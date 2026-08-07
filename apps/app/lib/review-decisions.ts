import type {
  DossierAnchor,
  EntityDecision,
  FactAnchors,
  FactDecision,
} from "@repo/knowledge";

// Pure mapping between the review form's UI state and the knowledge
// package's decision inputs — kept out of the server actions so it is
// testable without auth or a database.

export type EntityChoice = "confirm" | "discard";

export interface FactSelection {
  choice: "confirm" | "discard";
  /** The (possibly edited) fact text as currently shown in the form. */
  text: string;
}

export interface ReviewSelections {
  entities: Record<string, EntityChoice | undefined>;
  facts: Record<number, FactSelection | undefined>;
}

export interface ResolveInput {
  entities: EntityDecision[];
  facts: FactDecision[];
}

/** The slice of a fact draft the cascade needs: which drafts it anchors. */
export interface CascadeFactDraft {
  anchorDraftIds: string[];
  index: number;
}

/**
 * Facts whose anchor is an entity draft the reviewer is discarding. A fact
 * cannot exist without its anchor (review.ts refuses the combination), so
 * these are the facts the form must pull down with the entity.
 */
export const cascadedFactIndices = (
  entities: Record<string, EntityChoice | undefined>,
  factDrafts: CascadeFactDraft[]
): Set<number> => {
  const discarded = new Set(
    Object.entries(entities)
      .filter(([, choice]) => choice === "discard")
      .map(([draftId]) => draftId)
  );
  return new Set(
    factDrafts
      .filter((draft) =>
        draft.anchorDraftIds.some((draftId) => discarded.has(draftId))
      )
      .map((draft) => draft.index)
  );
};

/**
 * The submitted form state: the reviewer's raw choices with dependent facts
 * forced to discard — including undecided ones, so a branch always resolves
 * atomically and never leaves a fact whose anchor can no longer exist. Pure
 * over the raw selections: reviving the entity restores whatever the
 * reviewer had chosen before.
 */
export const applyCascade = (
  selections: ReviewSelections,
  factDrafts: CascadeFactDraft[]
): ReviewSelections => {
  const cascaded = cascadedFactIndices(selections.entities, factDrafts);
  if (cascaded.size === 0) {
    return selections;
  }
  const facts: Record<number, FactSelection | undefined> = {
    ...selections.facts,
  };
  for (const index of cascaded) {
    facts[index] = { choice: "discard", text: facts[index]?.text ?? "" };
  }
  return { entities: selections.entities, facts };
};

// The backend's referential invariants, translated for the reviewer. With
// the cascade in the form these only surface from a stale tab, where the
// right move is always the same: reload and decide the group together.
const DISCARDED_ANCHOR_REGEX =
  /anchors \w+ draft ".+", which is being discarded/;
const UNCONFIRMED_ANCHOR_REGEX =
  /anchors \w+ draft ".+", which is not confirmed/;

export const friendlyResolveError = (message: string): string => {
  if (DISCARDED_ANCHOR_REGEX.test(message)) {
    return "A fact can't be kept while the entity it belongs to is discarded. Reload this proposal and decide the whole group together.";
  }
  if (UNCONFIRMED_ANCHOR_REGEX.test(message)) {
    return "This fact belongs to an entity that was never created. Reload this proposal and decide the whole group together.";
  }
  return message;
};

export const buildResolveInput = (
  selections: ReviewSelections,
  originalFactTexts: Record<number, string>
): ResolveInput => {
  const entities: EntityDecision[] = [];
  for (const [draftId, choice] of Object.entries(selections.entities)) {
    if (choice !== undefined) {
      entities.push({ action: choice, draftId });
    }
  }

  const facts: FactDecision[] = [];
  for (const [key, selection] of Object.entries(selections.facts)) {
    if (selection === undefined) {
      continue;
    }
    const index = Number(key);
    if (selection.choice === "discard") {
      facts.push({ action: "discard", index });
    } else if (selection.text === originalFactTexts[index]) {
      facts.push({ action: "confirm", index });
    } else {
      facts.push({ action: "edit", finalText: selection.text, index });
    }
  }

  return { entities, facts };
};

/** Unique dossier anchors referenced by the given facts' anchor sets. */
export const collectDossierAnchors = (
  facts: { anchors: FactAnchors }[]
): DossierAnchor[] => {
  const seen = new Map<string, DossierAnchor>();
  for (const fact of facts) {
    const { engagementId, organizationId, personId } = fact.anchors;
    if (engagementId) {
      seen.set(`engagement:${engagementId.toHexString()}`, {
        id: engagementId,
        kind: "engagement",
      });
    }
    if (organizationId) {
      seen.set(`organization:${organizationId.toHexString()}`, {
        id: organizationId,
        kind: "organization",
      });
    }
    if (personId) {
      seen.set(`person:${personId.toHexString()}`, {
        id: personId,
        kind: "person",
      });
    }
  }
  return [...seen.values()];
};

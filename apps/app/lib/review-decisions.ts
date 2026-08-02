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

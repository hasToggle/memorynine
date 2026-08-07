"use client";

import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import { cn } from "@repo/design-system/lib/utils";
import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  useCallback,
  useMemo,
  useState,
  useTransition,
} from "react";
import type {
  ReviewEntityDraft,
  ReviewFactDraft,
  ReviewProposal,
} from "@/app/actions/knowledge/get-proposal";
import { resolveProposal } from "@/app/actions/knowledge/resolve";
import {
  applyCascade,
  type CascadeFactDraft,
  cascadedFactIndices,
  type EntityChoice,
  type FactSelection,
} from "@/lib/review-decisions";

// The form is the proposal's dependency graph made visible: facts hang off
// the entity they anchor, on a literal branch line. Discarding an entity
// draft pulls its whole branch down with it — the cascade the backend
// enforces (review.ts) rendered as physics instead of a submit error.

type Choice = "confirm" | "discard" | undefined;

const entityName = (data: Record<string, unknown>): string =>
  typeof data.name === "string" ? data.name : "(unnamed)";

interface AnchorGroup {
  /** Present only for groups headed by a pending entity draft. */
  draft?: ReviewEntityDraft;
  facts: ReviewFactDraft[];
  key: string;
  label: string;
}

const buildGroups = (
  pendingEntities: ReviewEntityDraft[],
  pendingFacts: ReviewFactDraft[]
): AnchorGroup[] => {
  const pendingIds = new Set(pendingEntities.map((draft) => draft.draftId));
  const groups: AnchorGroup[] = pendingEntities.map((draft) => ({
    draft,
    facts: [],
    key: `draft:${draft.draftId}`,
    label: entityName(draft.data),
  }));
  const byKey = new Map(groups.map((group) => [group.key, group]));

  for (const fact of pendingFacts) {
    const draftAnchor = fact.anchorDraftIds.find((id) => pendingIds.has(id));
    const key = draftAnchor
      ? `draft:${draftAnchor}`
      : `known:${fact.anchorLabel}`;
    let group = byKey.get(key);
    if (!group) {
      group = { facts: [], key, label: fact.anchorLabel };
      groups.push(group);
      byKey.set(key, group);
    }
    group.facts.push(fact);
  }
  return groups;
};

// Same buttons, bound to an entity draft id — keeps the group header free
// of inline closures without threading callbacks through ChoiceButtons.
const EntityChoiceButtons = ({
  choice,
  draftId,
  onChoose,
}: {
  choice: Choice;
  draftId: string;
  onChoose: (draftId: string, choice: Choice) => void;
}) => {
  const choose = useCallback(
    (next: Choice) => onChoose(draftId, next),
    [draftId, onChoose]
  );
  return <ChoiceButtons choice={choice} onChoose={choose} />;
};

const ChoiceButtons = ({
  choice,
  disabled,
  onChoose,
}: {
  choice: Choice;
  disabled?: boolean;
  onChoose: (choice: Choice) => void;
}) => {
  const chooseConfirm = useCallback(
    () => onChoose(choice === "confirm" ? undefined : "confirm"),
    [choice, onChoose]
  );
  const chooseDiscard = useCallback(
    () => onChoose(choice === "discard" ? undefined : "discard"),
    [choice, onChoose]
  );
  return (
    <div className="flex shrink-0 gap-1">
      <Button
        disabled={disabled}
        onClick={chooseConfirm}
        size="sm"
        type="button"
        variant={choice === "confirm" ? "default" : "outline"}
      >
        Confirm
      </Button>
      <Button
        disabled={disabled}
        onClick={chooseDiscard}
        size="sm"
        type="button"
        variant={choice === "discard" ? "destructive" : "outline"}
      >
        Discard
      </Button>
    </div>
  );
};

const FactRow = ({
  cascadedBy,
  draft,
  onChoose,
  onTextChange,
  selection,
}: {
  /** Set when a discarded entity draft is pulling this fact down with it. */
  cascadedBy?: string;
  draft: ReviewFactDraft;
  onChoose: (index: number, choice: Choice) => void;
  onTextChange: (index: number, text: string) => void;
  selection: FactSelection | undefined;
}) => {
  const choose = useCallback(
    (next: Choice) => onChoose(draft.index, next),
    [draft.index, onChoose]
  );
  const changeText = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) =>
      onTextChange(draft.index, event.target.value),
    [draft.index, onTextChange]
  );
  const discarded = cascadedBy !== undefined || selection?.choice === "discard";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
        <span
          className={cn("flex items-center gap-2", cascadedBy && "opacity-60")}
        >
          <Badge variant="outline">{draft.category}</Badge>
          <span>confidence {Math.round(draft.confidence * 100)}%</span>
        </span>
        {cascadedBy ? (
          // Full opacity on purpose — this is the explanation of the dimmed
          // state, not part of it. dark:text-destructive-foreground: the
          // dark palette's --destructive is a button-background red that is
          // unreadable as text on a dark surface; the -foreground variant
          // is the bright text red.
          <span className="font-medium text-destructive dark:text-destructive-foreground">
            discarded with “{cascadedBy}”
          </span>
        ) : null}
      </div>
      {draft.supersedes.map((superseded) => (
        <p
          className="text-muted-foreground text-sm line-through"
          key={superseded.id}
        >
          {superseded.text}
        </p>
      ))}
      <div className="flex items-start justify-between gap-3">
        <Textarea
          className={cn(
            "min-h-0 text-sm",
            discarded && "line-through opacity-50"
          )}
          disabled={cascadedBy !== undefined}
          onChange={changeText}
          rows={2}
          value={selection ? selection.text : draft.text}
        />
        <ChoiceButtons
          choice={cascadedBy ? "discard" : selection?.choice}
          disabled={cascadedBy !== undefined}
          onChoose={choose}
        />
      </div>
    </div>
  );
};

export const ReviewForm = ({
  nextHref,
  proposal,
}: {
  /** Where the desk advances after this proposal fully resolves. */
  nextHref?: string;
  proposal: ReviewProposal;
}) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [entityChoices, setEntityChoices] = useState<
    Record<string, EntityChoice | undefined>
  >({});
  const [factSelections, setFactSelections] = useState<
    Record<number, FactSelection | undefined>
  >({});

  const pendingEntities = proposal.entityDrafts.filter(
    (draft) => draft.resolutionStatus === "pending"
  );
  const pendingFacts = proposal.factDrafts.filter(
    (draft) => draft.resolutionStatus === "pending"
  );
  const groups = useMemo(
    () => buildGroups(pendingEntities, pendingFacts),
    [pendingEntities, pendingFacts]
  );

  // The cascade only concerns anchors the reviewer can still decide —
  // drafts confirmed in an earlier resolution are real entities by now.
  const cascadeDrafts: CascadeFactDraft[] = useMemo(() => {
    const pendingIds = new Set(pendingEntities.map((draft) => draft.draftId));
    return pendingFacts.map((draft) => ({
      anchorDraftIds: draft.anchorDraftIds.filter((id) => pendingIds.has(id)),
      index: draft.index,
    }));
  }, [pendingEntities, pendingFacts]);

  const cascaded = useMemo(
    () => cascadedFactIndices(entityChoices, cascadeDrafts),
    [entityChoices, cascadeDrafts]
  );
  const nameByDraftId = useMemo(
    () =>
      new Map(
        pendingEntities.map((draft) => [draft.draftId, entityName(draft.data)])
      ),
    [pendingEntities]
  );
  const cascadeSourceFor = useCallback(
    (draft: ReviewFactDraft): string | undefined => {
      if (!cascaded.has(draft.index)) {
        return;
      }
      const culprit = draft.anchorDraftIds.find(
        (id) => entityChoices[id] === "discard"
      );
      return culprit ? (nameByDraftId.get(culprit) ?? culprit) : undefined;
    },
    [cascaded, entityChoices, nameByDraftId]
  );

  const chooseEntity = useCallback((draftId: string, choice: Choice) => {
    setEntityChoices((previous) => ({ ...previous, [draftId]: choice }));
  }, []);
  const chooseFact = useCallback(
    (index: number, choice: Choice) => {
      const original = pendingFacts.find((draft) => draft.index === index);
      setFactSelections((previous) => ({
        ...previous,
        [index]:
          choice === undefined
            ? undefined
            : {
                choice,
                text: previous[index]?.text ?? original?.text ?? "",
              },
      }));
    },
    [pendingFacts]
  );
  const changeFactText = useCallback((index: number, text: string) => {
    setFactSelections((previous) => ({
      ...previous,
      [index]: { choice: previous[index]?.choice ?? "confirm", text },
    }));
  }, []);

  const confirmEverything = useCallback(() => {
    setEntityChoices(
      Object.fromEntries(
        pendingEntities.map((draft) => [draft.draftId, "confirm" as const])
      )
    );
    setFactSelections((previous) =>
      Object.fromEntries(
        pendingFacts.map((draft) => [
          draft.index,
          {
            choice: "confirm" as const,
            text: previous[draft.index]?.text ?? draft.text,
          },
        ])
      )
    );
  }, [pendingEntities, pendingFacts]);

  // The ledger counts what will actually be submitted — cascades included.
  const effective = useMemo(
    () =>
      applyCascade(
        { entities: entityChoices, facts: factSelections },
        cascadeDrafts
      ),
    [entityChoices, factSelections, cascadeDrafts]
  );
  const decidedEntities = Object.values(effective.entities).filter(Boolean);
  const decidedFacts = Object.values(effective.facts).filter(
    (selection): selection is FactSelection => selection !== undefined
  );
  const keepCount =
    decidedEntities.filter((choice) => choice === "confirm").length +
    decidedFacts.filter((selection) => selection.choice === "confirm").length;
  const discardCount = decidedEntities.length + decidedFacts.length - keepCount;
  const openCount =
    pendingEntities.length +
    pendingFacts.length -
    decidedEntities.length -
    decidedFacts.length;

  const submit = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const originalTexts: Record<number, string> = {};
      for (const draft of proposal.factDrafts) {
        originalTexts[draft.index] = draft.text;
      }
      const result = await resolveProposal(
        proposal.id,
        effective,
        originalTexts
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.proposalResolved) {
        router.push(nextHref ?? "/review");
      } else {
        setEntityChoices({});
        setFactSelections({});
      }
      router.refresh();
    });
  }, [effective, nextHref, proposal, router]);

  if (pendingEntities.length === 0 && pendingFacts.length === 0) {
    return (
      <div className="flex min-h-20 items-center justify-center rounded-xl bg-muted/50 text-muted-foreground text-sm">
        Everything in this proposal has been reviewed.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => {
        const groupDiscarded =
          group.draft !== undefined &&
          entityChoices[group.draft.draftId] === "discard";
        return (
          <section
            className={cn(
              "rounded-xl border transition-opacity",
              groupDiscarded && "opacity-80"
            )}
            key={group.key}
          >
            <header className="flex flex-wrap items-center justify-between gap-3 rounded-t-xl border-b bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-2">
                {group.draft ? (
                  <>
                    <Badge variant="default">
                      new {group.draft.entityType}
                    </Badge>
                    <span
                      className={cn(
                        "font-medium text-sm",
                        groupDiscarded && "line-through opacity-60"
                      )}
                    >
                      {group.label}
                    </span>
                  </>
                ) : (
                  <>
                    <Badge variant="outline">known</Badge>
                    <span className="font-medium text-sm">{group.label}</span>
                  </>
                )}
              </div>
              {group.draft ? (
                <EntityChoiceButtons
                  choice={entityChoices[group.draft.draftId]}
                  draftId={group.draft.draftId}
                  onChoose={chooseEntity}
                />
              ) : null}
            </header>
            {group.facts.length > 0 ? (
              <div className="px-4 py-4">
                {/* The branch: the visible line facts hang off. Discarding
                    the entity dims the whole limb. */}
                <div
                  className={cn(
                    "ml-1.5 flex flex-col gap-5 border-l-2 pl-4",
                    // Same dark-mode story as the cascade hint above.
                    groupDiscarded
                      ? "border-destructive/40 dark:border-destructive-foreground/50"
                      : "border-border"
                  )}
                >
                  {group.facts.map((fact) => (
                    <FactRow
                      cascadedBy={cascadeSourceFor(fact)}
                      draft={fact}
                      key={fact.index}
                      onChoose={chooseFact}
                      onTextChange={changeFactText}
                      selection={factSelections[fact.index]}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <p className="px-4 py-3 text-muted-foreground text-sm">
                No facts hang off this entity yet.
              </p>
            )}
          </section>
        );
      })}

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <div className="sticky bottom-4 flex flex-wrap items-center gap-3 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur">
        <Button
          disabled={keepCount + discardCount === 0 || isPending}
          onClick={submit}
        >
          {isPending ? "Saving…" : "Apply decisions"}
        </Button>
        <Button
          disabled={isPending}
          onClick={confirmEverything}
          type="button"
          variant="ghost"
        >
          Confirm everything
        </Button>
        <span className="ml-auto text-muted-foreground text-sm tabular-nums">
          {keepCount} to confirm · {discardCount} to discard · {openCount} open
        </span>
      </div>
    </div>
  );
};

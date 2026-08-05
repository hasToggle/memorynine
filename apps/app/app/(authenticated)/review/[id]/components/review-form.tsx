"use client";

import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import { cn } from "@repo/design-system/lib/utils";
import { useRouter } from "next/navigation";
import { type ChangeEvent, useCallback, useState, useTransition } from "react";
import type {
  ReviewFactDraft,
  ReviewProposal,
} from "@/app/actions/knowledge/get-proposal";
import { resolveProposal } from "@/app/actions/knowledge/resolve";
import type { EntityChoice, FactSelection } from "@/lib/review-decisions";

type Choice = "confirm" | "discard" | undefined;

const entityName = (data: Record<string, unknown>): string =>
  typeof data.name === "string" ? data.name : "(unnamed)";

const ChoiceButtons = ({
  choice,
  onChoose,
}: {
  choice: Choice;
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
        onClick={chooseConfirm}
        size="sm"
        type="button"
        variant={choice === "confirm" ? "default" : "outline"}
      >
        Confirm
      </Button>
      <Button
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

const EntityRow = ({
  choice,
  draftId,
  entityType,
  name,
  onChoose,
}: {
  choice: Choice;
  draftId: string;
  entityType: string;
  name: string;
  onChoose: (draftId: string, choice: Choice) => void;
}) => {
  const choose = useCallback(
    (next: Choice) => onChoose(draftId, next),
    [draftId, onChoose]
  );
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <Badge variant="outline">{entityType}</Badge>
        <span className="font-medium text-sm">{name}</span>
      </div>
      <ChoiceButtons choice={choice} onChoose={choose} />
    </div>
  );
};

const FactRow = ({
  draft,
  onChoose,
  onTextChange,
  selection,
}: {
  draft: ReviewFactDraft;
  onChoose: (index: number, originalText: string, choice: Choice) => void;
  onTextChange: (index: number, text: string) => void;
  selection: FactSelection | undefined;
}) => {
  const choose = useCallback(
    (next: Choice) => onChoose(draft.index, draft.text, next),
    [draft.index, draft.text, onChoose]
  );
  const changeText = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) =>
      onTextChange(draft.index, event.target.value),
    [draft.index, onTextChange]
  );
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <Badge variant="outline">{draft.category}</Badge>
        <span>→ {draft.anchorLabel}</span>
        <span>confidence {Math.round(draft.confidence * 100)}%</span>
      </div>
      {draft.supersedes.map((superseded) => (
        <p
          className="text-muted-foreground text-sm line-through"
          key={superseded.id}
        >
          {superseded.text}
        </p>
      ))}
      <div className="flex items-start justify-between gap-4">
        <Textarea
          className={cn(
            "min-h-0 text-sm",
            selection?.choice === "discard" && "line-through opacity-50"
          )}
          onChange={changeText}
          rows={2}
          value={selection ? selection.text : draft.text}
        />
        <ChoiceButtons choice={selection?.choice} onChoose={choose} />
      </div>
    </div>
  );
};

export const ReviewForm = ({ proposal }: { proposal: ReviewProposal }) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [entityChoices, setEntityChoices] = useState<
    Record<string, EntityChoice | undefined>
  >({});
  const [factSelections, setFactSelections] = useState<
    Record<number, FactSelection | undefined>
  >({});

  const chooseEntity = useCallback((draftId: string, choice: Choice) => {
    setEntityChoices((previous) => ({ ...previous, [draftId]: choice }));
  }, []);

  const chooseFact = useCallback(
    (index: number, originalText: string, choice: Choice) => {
      setFactSelections((previous) => ({
        ...previous,
        [index]:
          choice === undefined
            ? undefined
            : { choice, text: previous[index]?.text ?? originalText },
      }));
    },
    []
  );

  const changeFactText = useCallback((index: number, text: string) => {
    setFactSelections((previous) => ({
      ...previous,
      [index]: { choice: previous[index]?.choice ?? "confirm", text },
    }));
  }, []);

  const pendingEntities = proposal.entityDrafts.filter(
    (draft) => draft.resolutionStatus === "pending"
  );
  const pendingFacts = proposal.factDrafts.filter(
    (draft) => draft.resolutionStatus === "pending"
  );
  const decidedCount =
    Object.values(entityChoices).filter(Boolean).length +
    Object.values(factSelections).filter(Boolean).length;

  const submit = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const originalTexts: Record<number, string> = {};
      for (const draft of proposal.factDrafts) {
        originalTexts[draft.index] = draft.text;
      }
      const result = await resolveProposal(
        proposal.id,
        { entities: entityChoices, facts: factSelections },
        originalTexts
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.proposalResolved) {
        router.push("/");
      } else {
        setEntityChoices({});
        setFactSelections({});
        router.refresh();
      }
    });
  }, [entityChoices, factSelections, proposal, router]);

  if (pendingEntities.length === 0 && pendingFacts.length === 0) {
    return (
      <div className="flex min-h-20 items-center justify-center rounded-xl bg-muted/50 text-muted-foreground text-sm">
        Everything in this proposal has been reviewed.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {pendingEntities.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New entities</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {pendingEntities.map((draft) => (
              <EntityRow
                choice={entityChoices[draft.draftId]}
                draftId={draft.draftId}
                entityType={draft.entityType}
                key={draft.draftId}
                name={entityName(draft.data)}
                onChoose={chooseEntity}
              />
            ))}
          </CardContent>
        </Card>
      ) : null}

      {pendingFacts.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Facts</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {pendingFacts.map((draft) => (
              <FactRow
                draft={draft}
                key={draft.index}
                onChoose={chooseFact}
                onTextChange={changeFactText}
                selection={factSelections[draft.index]}
              />
            ))}
          </CardContent>
        </Card>
      ) : null}

      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <div className="flex items-center gap-3">
        <Button disabled={decidedCount === 0 || isPending} onClick={submit}>
          {isPending
            ? "Saving…"
            : `Apply ${decidedCount} decision${decidedCount === 1 ? "" : "s"}`}
        </Button>
        <span className="text-muted-foreground text-sm">
          Undecided items stay open for later.
        </span>
      </div>
    </div>
  );
};

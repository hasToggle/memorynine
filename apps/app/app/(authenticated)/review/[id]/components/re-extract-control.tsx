"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { useRouter } from "next/navigation";
import { type ChangeEvent, useCallback, useState, useTransition } from "react";
import { reExtractProposal } from "@/app/actions/knowledge/re-extract";
import { resolveProposal } from "@/app/actions/knowledge/resolve";

type PendingAction = "discard" | "re-extract" | undefined;

export const ReExtractControl = ({
  proposalId,
  skipReason,
}: {
  proposalId: string;
  skipReason: string;
}) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<PendingAction>();
  const [hint, setHint] = useState("");
  const [error, setError] = useState<string | null>(null);

  const changeHint = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setHint(event.target.value),
    []
  );

  const reExtract = useCallback(() => {
    setError(null);
    setPendingAction("re-extract");
    startTransition(async () => {
      const trimmedHint = hint.trim();
      const result = await reExtractProposal(
        proposalId,
        trimmedHint.length > 0 ? trimmedHint : undefined
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.status === "retry" || result.status === "failed") {
        // No gen-2 proposal exists yet: reExtractSource already superseded
        // this one, so navigating away would make the item vanish from both
        // the open and skipped lists with nothing left to click on.
        setError(
          result.reason ??
            "Re-extraction failed; it will be retried automatically."
        );
        return;
      }
      router.push("/");
    });
  }, [hint, proposalId, router]);

  // A skipped proposal is resolvable like any other — discarding it is a
  // normal review action. It carries no drafts, so this reuses the exact
  // resolve path ReviewForm uses (resolveProposal → resolveProposalItems)
  // with empty selections: nothing is pending, so the proposal closes
  // immediately instead of needing a second, skip-only code path.
  const discard = useCallback(() => {
    setError(null);
    setPendingAction("discard");
    startTransition(async () => {
      const result = await resolveProposal(
        proposalId,
        { entities: {}, facts: {} },
        {}
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push("/");
    });
  }, [proposalId, router]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Skipped</CardTitle>
        <CardDescription>{skipReason}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="re-extract-hint">
            Context for re-extraction (optional)
          </Label>
          <Input
            disabled={isPending}
            id="re-extract-hint"
            onChange={changeHint}
            placeholder="e.g. this mentions the Acme deal signed last week"
            value={hint}
          />
        </div>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={isPending} onClick={reExtract} type="button">
            {isPending && pendingAction === "re-extract"
              ? "Re-extracting…"
              : "Re-extract"}
          </Button>
          <Button
            disabled={isPending}
            onClick={discard}
            type="button"
            variant="destructive"
          >
            {isPending && pendingAction === "discard"
              ? "Discarding…"
              : "Discard"}
          </Button>
          <span className="text-muted-foreground text-sm">
            Re-run extraction against the current knowledge base, or discard
            this skip with no further action.
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

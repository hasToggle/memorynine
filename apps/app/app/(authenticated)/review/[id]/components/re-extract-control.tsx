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

export const ReExtractControl = ({
  proposalId,
  skipReason,
}: {
  proposalId: string;
  skipReason: string;
}) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [hint, setHint] = useState("");
  const [error, setError] = useState<string | null>(null);

  const changeHint = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setHint(event.target.value),
    []
  );

  const submit = useCallback(() => {
    setError(null);
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
      router.push("/review");
    });
  }, [hint, proposalId, router]);

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
        <div className="flex items-center gap-3">
          <Button disabled={isPending} onClick={submit}>
            {isPending ? "Re-extracting…" : "Re-extract"}
          </Button>
          <span className="text-muted-foreground text-sm">
            Re-runs extraction against the current knowledge base.
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

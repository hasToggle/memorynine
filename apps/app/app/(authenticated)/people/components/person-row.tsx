"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/design-system/components/ui/alert-dialog";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { erasePersonAction } from "@/app/actions/knowledge/erase-person";
import type { PersonListItem } from "@/app/actions/knowledge/list-people";

export const PersonRow = ({ person }: { person: PersonListItem }) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const erase = useCallback(() => {
    startTransition(async () => {
      const result = await erasePersonAction(person.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSummary(
        `Erased: ${result.factsDeleted + result.derivedFactsDeleted} facts deleted (${result.derivedFactsDeleted} consolidated), ${result.factsRedacted} facts, ${result.sourcesRedacted} sources and ${result.proposalsRedacted} proposals redacted, ${result.blobsDeleted} audio blobs removed.`
      );
      router.refresh();
    });
  }, [person.id, router]);

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{person.name}</span>
          {person.role ? <Badge variant="outline">{person.role}</Badge> : null}
          {person.organizationName ? (
            <span className="text-muted-foreground text-xs">
              {person.organizationName}
            </span>
          ) : null}
        </div>
        <p className="text-muted-foreground text-xs">
          {person.factCount} current fact{person.factCount === 1 ? "" : "s"}
          {person.emails.length > 0 ? ` · ${person.emails.join(", ")}` : ""}
        </p>
        {summary ? (
          <p className="text-muted-foreground text-xs">{summary}</p>
        ) : null}
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button disabled={isPending} size="sm" variant="destructive">
            {isPending ? "Erasing…" : "Erase"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Erase {person.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes all {person.factCount} of their facts, redacts their
              name and email from every source and proposal, and removes
              orphaned audio recordings. It cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={erase}>
              Erase permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

"use client";

import { SearchIcon } from "lucide-react";

// Replaces the raw Tool block, which rendered "tool-search-knowledge" plus its
// JSON input and output inline — developer plumbing on a product surface. What
// a reader needs is that a search happened, what for, and how much it found.

export const SearchSummary = ({
  errorText,
  factCount,
  query,
  sourceCount,
  state,
}: {
  errorText: string | undefined;
  factCount: number;
  query: string | undefined;
  sourceCount: number;
  state: string | undefined;
}) => {
  const done = state === "output-available";
  const failed = state === "output-error";
  const found = [
    factCount > 0 ? `${factCount} fact${factCount === 1 ? "" : "s"}` : null,
    sourceCount > 0
      ? `${sourceCount} unchecked note${sourceCount === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);

  const message = (() => {
    if (failed) {
      // Distinct from "nothing found": the lookup itself did not run, so
      // nothing here should be read as an answer about the knowledge base.
      return (
        <span className="text-destructive">
          Couldn't search {query ? <>&laquo;{query}&raquo;</> : "the brain"}
          {errorText ? <> — {errorText}</> : null}
        </span>
      );
    }
    if (done) {
      return (
        <span>
          Looked up {query ? <>&laquo;{query}&raquo;</> : "the brain"}
          {found.length > 0 ? ` — ${found.join(", ")}` : " — nothing found"}
        </span>
      );
    }
    return (
      <span>Searching{query ? <> for &laquo;{query}&raquo;</> : null}…</span>
    );
  })();

  return (
    <p className="flex items-center gap-2 text-muted-foreground text-xs">
      <SearchIcon className="size-3.5 shrink-0" />
      {message}
    </p>
  );
};

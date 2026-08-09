"use client";

import { SearchIcon } from "lucide-react";

// Replaces the raw Tool block, which rendered "tool-search-knowledge" plus its
// JSON input and output inline — developer plumbing on a product surface. What
// a reader needs is that a search happened, what for, and how much it found.

export const SearchSummary = ({
  factCount,
  query,
  sourceCount,
  state,
}: {
  factCount: number;
  query: string | undefined;
  sourceCount: number;
  state: string | undefined;
}) => {
  const done = state === "output-available";
  const found = [
    factCount > 0 ? `${factCount} fact${factCount === 1 ? "" : "s"}` : null,
    sourceCount > 0
      ? `${sourceCount} unchecked note${sourceCount === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);

  return (
    <p className="flex items-center gap-2 text-muted-foreground text-xs">
      <SearchIcon className="size-3.5 shrink-0" />
      {done ? (
        <span>
          Looked up {query ? <>&laquo;{query}&raquo;</> : "the brain"}
          {found.length > 0 ? ` — ${found.join(", ")}` : " — nothing found"}
        </span>
      ) : (
        <span>Searching{query ? <> for &laquo;{query}&raquo;</> : null}…</span>
      )}
    </p>
  );
};

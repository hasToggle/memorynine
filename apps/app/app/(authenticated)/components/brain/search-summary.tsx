"use client";

import { SearchIcon } from "lucide-react";
import { useEffect } from "react";

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

  // eve fills errorText from the thrown error's `message`, which for a Mongo
  // or Voyage failure carries hostnames, ports and occasionally URLs with
  // credentials in them. The reader gets a fixed sentence; the detail an
  // engineer needs goes to the console. In an effect rather than in render so
  // one failure logs once, not on every re-render of the conversation.
  useEffect(() => {
    if (failed && errorText) {
      console.warn(`search-knowledge failed: ${errorText}`);
    }
  }, [errorText, failed]);
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
          Couldn't search {query ? <>&laquo;{query}&raquo;</> : "the brain"} —
          the lookup didn't run, so nothing below is an answer from the brain.
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

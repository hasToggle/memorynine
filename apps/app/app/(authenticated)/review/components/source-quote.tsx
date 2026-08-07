"use client";

import { Badge } from "@repo/design-system/components/ui/badge";
import { cn } from "@repo/design-system/lib/utils";
import { useCallback, useState } from "react";

// The source is context, not the protagonist: a clamped quotation the
// reviewer can open when a draft needs checking against the original words.

const CLAMP_THRESHOLD = 280;

export const SourceQuote = ({
  capturedBy,
  content,
  type,
}: {
  capturedBy: string;
  content: string;
  type: string;
}) => {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((value) => !value), []);
  const clampable = content.length > CLAMP_THRESHOLD;

  return (
    <figure className="rounded-xl border bg-muted/30 px-4 py-3">
      <figcaption className="mb-1.5 flex items-center gap-2 text-muted-foreground text-xs">
        <Badge variant="secondary">{type}</Badge>
        <span>captured by {capturedBy}</span>
      </figcaption>
      <blockquote
        className={cn(
          "whitespace-pre-wrap text-sm leading-relaxed",
          clampable && !expanded && "line-clamp-3"
        )}
      >
        {content}
      </blockquote>
      {clampable ? (
        <button
          className="mt-1.5 font-medium text-muted-foreground text-xs underline-offset-2 hover:text-foreground hover:underline"
          onClick={toggle}
          type="button"
        >
          {expanded ? "Collapse source" : "Show full source"}
        </button>
      ) : null}
    </figure>
  );
};

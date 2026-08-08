"use client";

import { cn } from "@repo/design-system/lib/utils";
import { useCallback, useState } from "react";
import { GroundedParagraph } from "./grounded-paragraph";
import { PromptInput } from "./prompt-input";
import { GroundingToggle } from "./toggles";
import { UngroundedParagraph } from "./ungrounded-paragraph";

export function Plausibility() {
  const [grounding, setGrounding] = useState(false);
  const [seenOff, setSeenOff] = useState(true);
  const [seenOn, setSeenOn] = useState(false);

  const handleChange = useCallback((next: boolean) => {
    setGrounding(next);
    if (next) {
      setSeenOn(true);
    } else {
      setSeenOff(true);
    }
  }, []);

  const realityRevealed = seenOff && seenOn;

  return (
    <div className="rounded-2xl border border-border bg-card/40 p-5 shadow-sm sm:p-8">
      <PromptInput amended={grounding} />

      <div className="mt-6">
        <div
          className="fade-in animate-in duration-200"
          key={grounding ? "g" : "ug"}
        >
          {grounding ? <GroundedParagraph /> : <UngroundedParagraph />}
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3 border-border/60 border-t pt-4">
        <span
          aria-hidden="true"
          className="font-medium font-mono text-[0.7rem] text-foreground/40 uppercase tracking-[0.2em]"
        >
          output
        </span>
        <span aria-hidden="true" className="h-px flex-1 bg-foreground/15" />
        <GroundingToggle grounding={grounding} onChange={handleChange} />
      </div>

      {realityRevealed ? (
        <div
          className={cn(
            "fade-in slide-in-from-bottom-2 mt-10 animate-in border-border/60 border-t pt-8 duration-500"
          )}
        >
          <div className="border-ht-cyan-500/50 border-l-2 pl-5 dark:border-ht-cyan-400/50">
            <p className="mb-2 font-medium font-mono text-[0.7rem] text-ht-cyan-700 uppercase tracking-[0.2em] dark:text-ht-cyan-300/90">
              Reality
            </p>
            <p className="mb-4 font-display text-foreground/85 text-lg italic leading-8">
              Two answers. The grounding changed the citations. Both still
              missed the same question.
            </p>
            <p className="mb-4 text-foreground/80 leading-7">
              The grounded answer mentioned profiling and dismissed it.{" "}
              <strong className="text-foreground">
                That&apos;s the answer.
              </strong>{" "}
              Open the Profiler. The slow span is{" "}
              <code className="rounded bg-foreground/[0.06] px-1 py-0.5 font-mono text-[0.95em]">
                getDashboardStats
              </code>{" "}
              — 47 sequential queries, one per project. Fix the N+1, not the
              cache. Cold load drops to ~140ms.
            </p>
            <p className="text-foreground/65 italic leading-7">
              AI writes the grammar of software. You own the meaning. Grounding
              doesn&apos;t change which one is which — it just makes the grammar
              more current.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

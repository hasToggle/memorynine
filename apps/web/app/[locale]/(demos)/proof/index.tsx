"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { useCallback, useState } from "react";
import { MetaAside } from "../../components/meta-aside";

type Stage = "surface" | "revealed";

export function Proof() {
  const [stage, setStage] = useState<Stage>("surface");
  const reveal = useCallback(() => setStage("revealed"), []);
  const reset = useCallback(() => setStage("surface"), []);

  return (
    <div className="space-y-6">
      <SchemaPanel stage={stage} />

      <div className="flex flex-wrap items-center gap-3">
        {stage === "surface" ? (
          <Button onClick={reveal} type="button">
            See what it returned
          </Button>
        ) : (
          <Button onClick={reset} type="button" variant="ghost">
            Reset
          </Button>
        )}
      </div>

      <MetaAside className="mt-8 max-w-prose" variant="block">
        The Unix epoch was supposed to be a sensible default for “the beginning
        of time.” It works fine until the beginning of time starts showing up in
        your production data.
      </MetaAside>
    </div>
  );
}

function SchemaPanel({ stage }: { stage: Stage }) {
  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card/40 p-5 font-mono text-sm shadow-sm sm:p-6">
      <div className="space-y-1.5">
        <p className="text-emerald-700 dark:text-emerald-400">
          <span aria-hidden="true" className="mr-2 select-none">
            ✓
          </span>
          z.coerce.date()
        </p>
        <p className="text-foreground/65">
          <span aria-hidden="true" className="mr-2 select-none">
            ↳
          </span>
          input: <span className="text-foreground/85">undefined</span>
        </p>
        <p className="text-emerald-700 dark:text-emerald-400">
          <span aria-hidden="true" className="mr-2 select-none">
            ✓
          </span>
          passed
        </p>
      </div>

      {stage === "revealed" && (
        <div className="fade-in animate-in space-y-3 border-border/60 border-t pt-4 duration-300">
          <p className="font-medium font-mono text-[0.65rem] text-ht-cyan-700 uppercase tracking-[0.2em] dark:text-ht-cyan-300/90">
            What it returned
          </p>
          <p className="font-display text-base text-foreground/85 leading-7">
            <code className="font-mono text-sm">z.coerce.date()</code> on{" "}
            <code className="font-mono text-sm">undefined</code> returned{" "}
            <code className="font-mono text-sm">new Date(0)</code> — January 1,
            1970.
          </p>
          <p className="font-display text-foreground/85 text-lg leading-7">
            The schema didn&apos;t validate. It manufactured.
          </p>
          <p className="text-foreground/70 italic leading-7">
            The validation never told the truth about this field. It just always
            said yes.
          </p>
        </div>
      )}
    </div>
  );
}

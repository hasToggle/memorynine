"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { useCallback, useState } from "react";
import { Expandable } from "../../components/expandable";
import { MetaAside } from "../../components/meta-aside";
import { RalphEssay } from "./ralph-essay";
import { TestDiff } from "./test-diff";

const RALPH_ASIDE =
  "The Ralph loop: keep handing the agent its unfinished work until it earns the exit phrase. The agent's \"done\" is cheap. The loop's exit condition isn't.";

type Stage = "surface" | "revealed";

export function Completion() {
  const [stage, setStage] = useState<Stage>("surface");
  const reveal = useCallback(() => setStage("revealed"), []);
  const reset = useCallback(() => setStage("surface"), []);

  return (
    <div className="space-y-6">
      <ChecksOutput stage={stage} />

      <div className="flex flex-wrap items-center gap-3">
        {stage === "surface" ? (
          <Button onClick={reveal} type="button">
            See what passed
          </Button>
        ) : (
          <Button onClick={reset} type="button" variant="ghost">
            Reset
          </Button>
        )}
      </div>

      {stage === "revealed" && (
        <div className="fade-in animate-in duration-300">
          <TestDiff />
        </div>
      )}

      <MetaAside className="mt-8 max-w-prose" variant="block">
        {RALPH_ASIDE}
      </MetaAside>

      <Expandable label="Did you know? The Ralph loop.">
        <RalphEssay />
      </Expandable>
    </div>
  );
}

function ChecksOutput({ stage }: { stage: Stage }) {
  return (
    <div className="space-y-2 rounded-2xl border border-border bg-card/40 p-5 font-mono text-sm shadow-sm sm:p-6">
      <p className="text-foreground/65">
        <span aria-hidden="true" className="mr-2 select-none">
          $
        </span>
        run all checks
      </p>
      <p className="text-emerald-700 dark:text-emerald-400">
        <span aria-hidden="true" className="mr-2 select-none">
          ✓
        </span>
        tests passed (12/12)
      </p>
      <p className="text-emerald-700 dark:text-emerald-400">
        <span aria-hidden="true" className="mr-2 select-none">
          ✓
        </span>
        types ok
      </p>
      <p className="text-emerald-700 dark:text-emerald-400">
        <span aria-hidden="true" className="mr-2 select-none">
          ✓
        </span>
        lint ok
      </p>
      <p className="pt-2 text-amber-600 dark:text-amber-400">
        <span aria-hidden="true" className="mr-2 select-none">
          ↳
        </span>
        agent: done.
      </p>
      {stage === "surface" && (
        <p className="border-border/60 border-t pt-3 text-foreground/40 text-xs">
          [ click below to see what passed ]
        </p>
      )}
    </div>
  );
}

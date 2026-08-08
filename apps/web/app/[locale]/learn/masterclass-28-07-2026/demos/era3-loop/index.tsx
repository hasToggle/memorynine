"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { advanceLoop, LAST_LOOP_STEP, LOOP_STEPS } from "./sequence";

const STEP_MS = 900;

const KIND_GLYPH: Record<string, string> = {
  message: "›",
  respond: "✓",
  think: "∴",
  tool: "⚙",
};

export function Era3Loop() {
  const [active, setActive] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) {
        clearInterval(timer.current);
      }
    },
    []
  );

  const run = useCallback(() => {
    if (timer.current !== null) {
      clearInterval(timer.current);
    }
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reduce) {
      setActive(LAST_LOOP_STEP);
      setRunning(false);
      return;
    }
    setActive(0);
    setRunning(true);
    timer.current = setInterval(() => {
      setActive((i) => {
        const next = i === null ? 0 : advanceLoop(i);
        if (next === null) {
          if (timer.current !== null) {
            clearInterval(timer.current);
          }
          setRunning(false);
          return i;
        }
        return next;
      });
    }, STEP_MS);
  }, []);

  const finished = active === LAST_LOOP_STEP && !running;

  return (
    <div className="mb-10 rounded-xl border border-foreground/10 p-4 sm:p-6">
      <p className="font-medium text-base">
        An LLM with tools, trapped in a loop
      </p>
      <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
        One task, start to finish — no human between the steps:
      </p>
      <ol className="mt-4 space-y-1 font-mono text-xs">
        {LOOP_STEPS.map((step, i) => (
          <li
            className={cn(
              "flex items-center gap-3 rounded px-2 py-1 transition-colors",
              i === active
                ? "bg-ht-cyan-500/10 text-foreground"
                : "text-muted-foreground"
            )}
            key={step.label}
          >
            <span aria-hidden="true" className="w-4 text-center opacity-70">
              {KIND_GLYPH[step.kind]}
            </span>
            {step.label}
          </li>
        ))}
      </ol>
      <p className="mt-3 font-mono text-[11px] text-muted-foreground">
        ↺ and again, until the rules are satisfied
      </p>

      <div className="mt-4 flex items-center gap-3">
        <Button disabled={running} onClick={run} size="sm" type="button">
          {finished ? "↺ Run again" : "Run ⏎"}
        </Button>
      </div>

      {/* Reserved from the first frame: the verdict lands after the run, and
          revealing it must not move the demos below it. */}
      <p
        className={cn(
          "mt-4 max-w-2xl text-foreground/55 text-sm italic transition-opacity",
          finished ? "visible opacity-100" : "invisible opacity-0"
        )}
      >
        That&apos;s the whole mechanism — a model, tools, and a loop. Everything
        since is scale.
      </p>
    </div>
  );
}

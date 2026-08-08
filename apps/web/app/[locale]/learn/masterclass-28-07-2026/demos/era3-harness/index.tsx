"use client";

import { cn } from "@repo/design-system/lib/utils";
import { useCallback, useEffect, useReducer } from "react";
import type { DiffStatus } from "./diff-data";
import {
  harnessReducer,
  initialHarnessState,
  isClear,
  remainingCount,
} from "./reducer";

const TICK_MS = 650;

const STATUS_GLYPH: Record<DiffStatus, string> = {
  excepted: "⚠ ",
  pending: "● ",
  resolved: "✓ ",
};

export function Era3Harness() {
  const [state, dispatch] = useReducer(
    harnessReducer,
    undefined,
    initialHarnessState
  );

  useEffect(() => {
    if (!state.running) {
      return;
    }
    const id = setInterval(() => dispatch({ type: "tick" }), TICK_MS);
    return () => clearInterval(id);
  }, [state.running]);

  const resolved = useCallback(
    (id: string) => state.diffs.find((d) => d.id === id)?.status === "resolved",
    [state.diffs]
  );

  const run = useCallback(() => dispatch({ type: "run" }), []);
  const reset = useCallback(() => dispatch({ type: "reset" }), []);

  return (
    <div className="rounded-xl border border-foreground/10 p-4 sm:p-6">
      <p className="font-medium text-base">Pixel for pixel</p>
      <p className="mt-1 mb-4 max-w-2xl text-muted-foreground text-sm">
        A client&apos;s site on the left, its rebuild on the right, and the
        auditor the agent wrote to hold one against the other.
      </p>

      {/* target vs candidate */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Mock isTarget label="Target · WordPress" resolved={resolved} />
        <Mock
          converged={isClear(state)}
          label="Candidate · Next.js"
          resolved={resolved}
        />
      </div>

      {/* diff list + loop */}
      <div className="mt-4 grid gap-4 md:grid-cols-[1.3fr_1fr]">
        <ul className="overflow-hidden rounded-lg border border-foreground/10 font-mono text-xs">
          {state.diffs.map((d) => (
            <li
              className={cn(
                "border-foreground/5 border-b px-3 py-2 last:border-0",
                d.status === "resolved" &&
                  "text-emerald-600 line-through opacity-60",
                d.status === "pending" &&
                  "bg-red-50 text-red-700 dark:bg-red-950/30",
                d.status === "excepted" &&
                  "bg-amber-50 text-amber-700 dark:bg-amber-950/30"
              )}
              key={d.id}
            >
              {STATUS_GLYPH[d.status]}
              {d.label}
            </li>
          ))}
        </ul>

        <div className="rounded-lg border border-foreground/10 bg-[#0d1117] p-3 font-mono text-[#8b949e] text-xs leading-6">
          {/* Every log line is a distinct constant, so the text is a stable key. */}
          {state.log.map((line) => (
            <div className="text-[#3fb950]" key={line}>
              › {line}
            </div>
          ))}
          <div className="mt-2">
            diff count:{" "}
            <span
              className={isClear(state) ? "text-[#3fb950]" : "text-[#e5707e]"}
            >
              {remainingCount(state)}
            </span>
          </div>
          <div className="mt-3">
            <button
              className="rounded bg-[#21262d] px-3 py-1 text-[#c9d1d9] disabled:opacity-40"
              disabled={state.running || isClear(state)}
              onClick={run}
              type="button"
            >
              Run audit
            </button>
          </div>
        </div>
      </div>

      {/* Outside the terminal, in the page's own idiom and right-aligned —
          the same control Era II's demos use, so one gesture means one thing
          across the talk. */}
      <div className="mt-4 flex">
        <button
          className="ml-auto shrink-0 rounded border border-foreground/15 px-2 py-1 font-mono text-muted-foreground text-xs hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          disabled={state.running}
          onClick={reset}
          type="button"
        >
          ↺ reset
        </button>
      </div>

      <p className="mt-4 text-foreground/55 text-sm italic">
        You wrote the validation rules. The agent screenshots, diffs, fixes, and
        re-runs — on its own — until the count hits zero. The embed stays
        flagged: knowing what isn&apos;t worth it is your judgment too.
      </p>
    </div>
  );
}

/**
 * Every row in the diff list owns a property of this skeleton, so resolving a
 * row visibly moves the candidate toward the target instead of only striking
 * text off a list. The target renders as if everything were already fixed —
 * it is the thing being matched — so a clean run makes the two panels
 * identical except for the excepted embed, which is the judgment call.
 */
function Mock({
  label,
  converged,
  isTarget,
  resolved,
}: {
  converged?: boolean;
  isTarget?: boolean;
  label: string;
  resolved: (id: string) => boolean;
}) {
  const fixed = (id: string) => isTarget || resolved(id);

  return (
    <div>
      <div className="mb-1 font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
        {label}
        {converged ? <span className="text-emerald-600"> ▸ match</span> : null}
      </div>
      <div className="rounded-lg border border-foreground/10 bg-background p-4">
        <div
          className={cn(
            "rounded motion-safe:transition-all motion-safe:duration-500",
            fixed("padding") ? "mb-3" : "mb-6",
            fixed("weight") ? "h-2.5" : "h-3",
            fixed("width") ? "w-3/5" : "w-[52%]",
            fixed("color") ? "bg-foreground/75" : "bg-foreground"
          )}
        />
        <div className="mb-1.5 h-1.5 w-11/12 rounded bg-foreground/30" />
        <div className="mb-3 h-1.5 w-4/5 rounded bg-foreground/30" />
        <div
          className={cn(
            "h-6 rounded bg-emerald-500 motion-safe:transition-all motion-safe:duration-500",
            fixed("button") ? "w-28" : "w-32"
          )}
        />
        {/* The exception, kept visible: clearing the count never makes this
            one match, and it is not supposed to. */}
        <div
          className={cn(
            "mt-3 flex h-8 items-center justify-center rounded border border-dashed font-mono text-[9px] uppercase tracking-wide",
            isTarget
              ? "border-foreground/20 bg-foreground/[0.03] text-muted-foreground"
              : "border-amber-500/60 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
          )}
        >
          {isTarget ? "social embed" : "⚠ social embed"}
        </div>
      </div>
    </div>
  );
}

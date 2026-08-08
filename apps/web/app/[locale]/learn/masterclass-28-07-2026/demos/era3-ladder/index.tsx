"use client";

import { cn } from "@repo/design-system/lib/utils";
import { useCallback, useEffect, useState } from "react";
import { LADDER_STAGES, type LadderStage } from "./stages";

const RUNNER_TESTS = [
  "validateDiscount › rejects an unknown code",
  "validateDiscount › rejects an empty code",
  "validateDiscount › accepts a known code",
  "validateDiscount › is case-insensitive",
  "applyDiscount › never throws at checkout",
] as const;
const RUNNER_MS = 450;
/** Plan bodies ship their own "1. " prefixes; the <ol> renders them instead. */
const LEADING_ORDINAL = /^\d+\.\s*/;

/** The bar is relative to the worst year, so 2024 reads as full. */
const MAX_LINES = Math.max(...LADDER_STAGES.map((s) => s.lines));

function diffTone(line: string): string {
  if (line.startsWith("+")) {
    return "text-emerald-700 dark:text-emerald-400";
  }
  if (line.startsWith("-")) {
    return "text-red-700 dark:text-red-400";
  }
  return "text-muted-foreground";
}

interface YearTabProps {
  active: boolean;
  onSelect: (year: LadderStage["year"]) => void;
  year: LadderStage["year"];
}

function YearTab({ active, onSelect, year }: YearTabProps) {
  const select = useCallback(() => onSelect(year), [onSelect, year]);

  return (
    <button
      aria-pressed={active}
      className={cn(
        "rounded-t-md px-4 font-mono text-xs transition-colors sm:text-sm",
        active
          ? "bg-muted/40 text-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
      onClick={select}
      type="button"
    >
      {year}
    </button>
  );
}

export function Era3Ladder() {
  const [year, setYear] = useState<LadderStage["year"]>("2024");
  const stage = LADDER_STAGES.find((s) => s.year === year) ?? LADDER_STAGES[0];
  // Diff hunks repeat their text, so position carries the identity here.
  const diffLines = stage.body.map((text, index) => ({
    id: `${stage.year}-${index}`,
    text,
  }));

  return (
    <div className="mt-10 rounded-xl border border-foreground/10 p-4 sm:p-6">
      <p className="font-medium text-base">What I read, year by year</p>
      <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
        The same feature you fixed by hand earlier, reviewed three years
        running.
      </p>

      {/* One object, not three controls and a detached result. The tabs are
          the deck's existing folder grammar: the live year carries the panel's
          own fill and runs to the band's bottom edge, so it merges into the
          artifact beneath it rather than floating above it. */}
      <div className="mt-4 overflow-hidden rounded-lg border border-foreground/10">
        <div className="flex h-10 items-stretch gap-1 bg-foreground/[0.04] dark:bg-black/30">
          {LADDER_STAGES.map((s) => (
            <YearTab
              active={s.year === year}
              key={s.year}
              onSelect={setYear}
              year={s.year}
            />
          ))}
        </div>

        <div className="bg-muted/40">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 pt-4">
            <p className="font-medium text-sm">{stage.read}</p>
            <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {stage.approx ? "~" : ""}
              {stage.lines} lines read
            </p>
          </div>

          {/* The argument, as a measurement: what a human has to read collapses
              from a wall of diff to three sentences. */}
          <div className="mt-3 px-4">
            <div className="h-1 w-full overflow-hidden rounded-full bg-foreground/10">
              <div
                className="h-full min-w-[3px] rounded-full bg-ht-cyan-500 transition-[width] duration-500"
                style={{ width: `${(stage.lines / MAX_LINES) * 100}%` }}
              />
            </div>
          </div>

          <div className="px-4 py-4">
            {/* `whitespace-pre` below is load-bearing: these are divs, so
                without it HTML collapses the diff's leading indentation and
                every nested line lands flush against the +. */}
            {stage.artifact === "diff" && (
              <div className="max-h-44 overflow-auto font-mono text-xs leading-5">
                {diffLines.map((line) => (
                  <div
                    className={cn("whitespace-pre", diffTone(line.text))}
                    key={line.id}
                  >
                    {line.text}
                  </div>
                ))}
              </div>
            )}
            {stage.artifact === "plan" && (
              <ol className="list-decimal space-y-1 pl-5 font-mono text-xs leading-6">
                {stage.body.map((l) => (
                  <li key={l}>{l.replace(LEADING_ORDINAL, "")}</li>
                ))}
              </ol>
            )}
            {stage.artifact === "design" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <p className="font-mono text-xs leading-6">
                  {stage.body.join(" ")}
                </p>
                <TestRunner key={year} />
              </div>
            )}
          </div>

          <p className="border-foreground/10 border-t px-4 py-3 text-foreground/55 text-sm italic">
            {stage.line}
          </p>
        </div>
      </div>
    </div>
  );
}

function TestRunner() {
  const [passed, setPassed] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reduce) {
      setPassed(RUNNER_TESTS.length);
      return;
    }
    const id = setInterval(() => {
      setPassed((p) => Math.min(p + 1, RUNNER_TESTS.length));
    }, RUNNER_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="rounded-md bg-[#0d1117] p-3 font-mono text-xs leading-6">
      {RUNNER_TESTS.map((t, i) => (
        <div
          className={i < passed ? "text-[#3fb950]" : "text-[#e5707e]"}
          key={t}
        >
          {i < passed ? "✓" : "✗"} {t}
        </div>
      ))}
      <div className="mt-1 text-[#8b949e]">
        {passed === RUNNER_TESTS.length
          ? `${RUNNER_TESTS.length} passed — nobody read the code.`
          : "running…"}
      </div>
    </div>
  );
}

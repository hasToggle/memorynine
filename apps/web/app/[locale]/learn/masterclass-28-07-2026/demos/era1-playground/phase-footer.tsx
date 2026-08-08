"use client";

import { cn } from "@repo/design-system/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { useCallback } from "react";
import { adjacentPhase, PHASES, type PhaseId, phaseFor } from "./phases";

const CROSSFADE = { duration: 0.2 } as const;

interface ArrowProps {
  dir: "prev" | "next";
  onSelect: (id: PhaseId) => void;
  target: PhaseId | null;
}

function Arrow({ dir, onSelect, target }: ArrowProps) {
  const select = useCallback(() => {
    if (target) {
      onSelect(target);
    }
  }, [onSelect, target]);

  return (
    <button
      aria-label={dir === "prev" ? "Previous beat" : "Next beat"}
      className="shrink-0 rounded px-2 font-mono text-muted-foreground text-sm transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
      disabled={target === null}
      onClick={select}
      type="button"
    >
      {dir === "prev" ? "←" : "→"}
    </button>
  );
}

interface PhaseNumeralProps {
  active: boolean;
  id: PhaseId;
  label: string;
  numeral: number;
  onSelect: (id: PhaseId) => void;
}

function PhaseNumeral({
  active,
  id,
  label,
  numeral,
  onSelect,
}: PhaseNumeralProps) {
  const select = useCallback(() => onSelect(id), [id, onSelect]);

  return (
    <button
      aria-current={active ? "step" : undefined}
      aria-label={label}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-xs tabular-nums transition-colors",
        active
          ? "bg-foreground text-background"
          : "border border-foreground/20 text-muted-foreground hover:border-foreground/40 hover:text-foreground"
      )}
      onClick={select}
      type="button"
    >
      {numeral}
    </button>
  );
}

interface PhaseFooterProps {
  current: PhaseId;
  onSelect: (id: PhaseId) => void;
}

/**
 * Presenter mode's transport. Four numerals at fixed positions, and the current
 * beat's name in a reserved slot beneath them.
 *
 * The name sits on its own line rather than beside its numeral because an inline
 * accordion moves every other numeral as the label grows — measured at 138px of
 * drift between the shortest and longest beat, which means re-aiming for a
 * target that was somewhere else a moment ago. Here the numerals never move and
 * the name crossfades in place.
 *
 * The current beat is a *filled* numeral, the same "one of these is live"
 * grammar the mode switch in the chrome already speaks — legible from the back
 * wall without leaning on colour.
 */
export function PhaseFooter({ current, onSelect }: PhaseFooterProps) {
  const phase = phaseFor(current);
  return (
    <nav
      aria-label="Demo beats"
      className="flex h-[4.5rem] flex-col items-center justify-center gap-1.5 border-foreground/10 border-t px-2 sm:px-4"
    >
      <div className="flex items-center gap-2">
        <Arrow
          dir="prev"
          onSelect={onSelect}
          target={adjacentPhase(current, "prev")}
        />
        {PHASES.map((p, index) => (
          <PhaseNumeral
            active={p.id === current}
            id={p.id}
            key={p.id}
            label={p.label}
            numeral={index + 1}
            onSelect={onSelect}
          />
        ))}
        <Arrow
          dir="next"
          onSelect={onSelect}
          target={adjacentPhase(current, "next")}
        />
      </div>

      <div className="flex h-5 items-center">
        <AnimatePresence mode="wait">
          <motion.span
            animate={{ opacity: 1 }}
            className="whitespace-nowrap font-mono text-foreground text-xs"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            key={current}
            transition={CROSSFADE}
          >
            {phase.year ? `${phase.year} · ` : ""}
            {phase.label}
          </motion.span>
        </AnimatePresence>
      </div>
    </nav>
  );
}

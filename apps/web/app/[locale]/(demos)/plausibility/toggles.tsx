"use client";

import { cn } from "@repo/design-system/lib/utils";
import { useCallback } from "react";

interface GroundingToggleProps {
  grounding: boolean;
  onChange: (next: boolean) => void;
}

export function GroundingToggle({ grounding, onChange }: GroundingToggleProps) {
  const toggle = useCallback(() => onChange(!grounding), [grounding, onChange]);

  return (
    <button
      aria-label={`Grounding ${grounding ? "on" : "off"}. Click to toggle.`}
      aria-pressed={grounding}
      className={cn(
        "inline-flex items-center gap-2 font-medium font-mono text-[0.7rem] uppercase tracking-[0.2em] transition-colors",
        "rounded-full px-2 py-1 hover:bg-foreground/[0.04]",
        "focus-visible:outline-2 focus-visible:outline-ht-cyan-700/60 focus-visible:outline-offset-2 dark:focus-visible:outline-ht-cyan-400/60"
      )}
      onClick={toggle}
      type="button"
    >
      <span className="text-foreground/55">grounding</span>
      <span
        aria-hidden="true"
        className={cn(
          "relative inline-flex h-4 w-7 items-center rounded-full transition-colors",
          grounding
            ? "bg-ht-cyan-600/70 dark:bg-ht-cyan-500/70"
            : "bg-foreground/15"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-3 w-3 rounded-full bg-background transition-transform",
            grounding ? "translate-x-3.5" : "translate-x-0.5"
          )}
        />
      </span>
      <span
        className={cn(
          "transition-colors",
          grounding
            ? "text-ht-cyan-700 dark:text-ht-cyan-300"
            : "text-foreground/40"
        )}
      >
        {grounding ? "on" : "off"}
      </span>
    </button>
  );
}

"use client";

import { cn } from "@repo/design-system/lib/utils";
import { useCallback } from "react";
import { STEPS, type Step, type StepId } from "./steps";

interface StepperHeaderProps {
  current: StepId;
  onSelect: (id: StepId) => void;
}

interface StepTabProps {
  active: boolean;
  onSelect: (id: StepId) => void;
  step: Step;
}

function StepTab({ active, onSelect, step }: StepTabProps) {
  const select = useCallback(() => onSelect(step.id), [onSelect, step.id]);

  return (
    <li className="flex flex-1">
      <button
        aria-current={active ? "step" : undefined}
        className={cn(
          "w-full border-b-2 px-2 py-3 text-center transition-colors focus-visible:bg-foreground/10 focus-visible:text-foreground focus-visible:outline-hidden",
          active
            ? "border-ht-cyan-500 text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground"
        )}
        onClick={select}
        type="button"
      >
        <span className="block font-medium text-xs sm:text-sm">
          {step.label}
        </span>
        {step.vibe ? (
          <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground/70 tracking-wide">
            {step.vibe}
          </span>
        ) : null}
      </button>
    </li>
  );
}

export function StepperHeader({ current, onSelect }: StepperHeaderProps) {
  return (
    <nav aria-label="Masterclass progress">
      <ol className="mx-auto flex max-w-5xl items-stretch px-4">
        {STEPS.map((step: Step) => (
          <StepTab
            active={step.id === current}
            key={step.id}
            onSelect={onSelect}
            step={step}
          />
        ))}
      </ol>
    </nav>
  );
}

import { cn } from "@repo/design-system/lib/utils";
import {
  PIPELINE_HEADER,
  REVEAL_CAPTION,
  REVEAL_STEPS,
  SURFACE_CONFIRMATION,
  SURFACE_STEPS,
} from "./pipeline-data";

interface PipelineProps {
  stage: "surface" | "revealed";
}

export function Pipeline({ stage }: PipelineProps) {
  return (
    <div className="rounded-2xl border border-border bg-card/40 p-5 shadow-sm sm:p-6">
      <p className="mb-4 font-medium font-mono text-[0.65rem] text-foreground/55 uppercase tracking-[0.2em]">
        {PIPELINE_HEADER}{" "}
        <span
          className={cn(
            stage === "surface"
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          )}
        >
          · {stage === "surface" ? "✓ complete" : "✗ destructive"}
        </span>
      </p>
      <div className="space-y-1.5 font-mono text-sm">
        <p className="text-foreground/55">
          <span aria-hidden="true" className="mr-2 select-none">
            $
          </span>
          run import
        </p>
        {stage === "surface"
          ? SURFACE_STEPS.map((step) => (
              <p
                className="text-emerald-700 dark:text-emerald-400"
                key={step.id}
              >
                <span aria-hidden="true" className="mr-2 select-none">
                  ✓
                </span>
                {step.label}
              </p>
            ))
          : REVEAL_STEPS.map((step) => (
              <p
                className={cn(
                  step.severity === "warn"
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-red-600 dark:text-red-400"
                )}
                key={step.id}
              >
                <span aria-hidden="true" className="mr-2 select-none">
                  {step.severity === "warn" ? "⚠" : "✗"}
                </span>
                {step.label}
                {step.detail ? (
                  <span className="ml-2 text-foreground/45 text-xs">
                    ({step.detail})
                  </span>
                ) : null}
              </p>
            ))}
        {stage === "surface" && (
          <p className="pt-2 text-amber-600 dark:text-amber-400">
            <span aria-hidden="true" className="mr-2 select-none">
              ↳
            </span>
            agent: {SURFACE_CONFIRMATION}
          </p>
        )}
      </div>
      {stage === "revealed" && (
        <p className="mt-4 border-red-500/40 border-l-2 bg-red-500/5 px-3 py-2 text-foreground/85 text-sm italic leading-6">
          {REVEAL_CAPTION}
        </p>
      )}
    </div>
  );
}

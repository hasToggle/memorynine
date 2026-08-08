export interface SurfaceStep {
  id: string;
  label: string;
}

export interface RevealStep {
  detail?: string;
  id: string;
  label: string;
  severity: "warn" | "error";
}

export const SURFACE_STEPS: readonly SurfaceStep[] = [
  { id: "fetch", label: "fetch source records" },
  { id: "normalize", label: "normalize fields" },
  { id: "filter", label: "filter active" },
  { id: "diff", label: "diff against db" },
  { id: "apply", label: "apply changes" },
] as const;

export const REVEAL_STEPS: readonly RevealStep[] = [
  {
    detail: "auth token expired, returned empty",
    id: "fetch",
    label: "fetch source records → []",
    severity: "warn",
  },
  {
    id: "normalize",
    label: "normalize fields([]) → []",
    severity: "warn",
  },
  {
    id: "filter",
    label: "filter active([]) → []",
    severity: "warn",
  },
  {
    id: "diff",
    label: "diff(incoming=[], existing=12,847) → remove 12,847",
    severity: "error",
  },
  {
    id: "apply",
    label: "apply changes → 12,847 records deleted",
    severity: "error",
  },
] as const;

export const REVEAL_CAPTION =
  "Every step did its job. The system did one nobody asked for.";

export const SURFACE_CONFIRMATION = "import complete. database synced.";

export const PIPELINE_HEADER = "imports/run.ts — daily sync";

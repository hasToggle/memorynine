import { PROMPTS } from "./completions";
import { FIRST_PHASE, type PhaseId } from "./phases";
import { type Band, INITIAL_TEMP, type Mode } from "./selector";

/** What the last run was, which is what the verdict describes. */
export interface RunSnapshot {
  band: Band;
  isQuestion: boolean;
  mode: Mode;
}

export interface DemoSnapshot {
  /** The furthest beat visited. Disclosure keys off this, never off `phase`. */
  furthest: PhaseId;
  lastRun: RunSnapshot | null;
  mode: Mode;
  output: string;
  phase: PhaseId;
  promptId: string;
  temp: number;
  verdict: string | null;
}

export function freshSnapshot(): DemoSnapshot {
  return {
    furthest: FIRST_PHASE,
    lastRun: null,
    mode: "base",
    output: "",
    phase: FIRST_PHASE,
    promptId: PROMPTS[0].id,
    temp: INITIAL_TEMP,
    verdict: null,
  };
}

/**
 * The demo unmounts when the presenter steps to Era II. This survives that and
 * dies on reload, so stepping away and back returns the screen exactly as it
 * was — mid-demo, output and all. Written only from client event handlers, so
 * the server copy never leaves its default.
 */
let snapshot: DemoSnapshot = freshSnapshot();

export function getSnapshot(): DemoSnapshot {
  return snapshot;
}

export function saveSnapshot(next: DemoSnapshot): void {
  snapshot = next;
}

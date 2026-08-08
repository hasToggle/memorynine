import { type DiffItem, INITIAL_DIFFS } from "./diff-data";

export interface HarnessState {
  diffs: DiffItem[];
  log: string[];
  running: boolean;
}

export type HarnessAction =
  | { type: "run" }
  | { type: "tick" }
  | { type: "reset" };

export function initialHarnessState(): HarnessState {
  return {
    diffs: INITIAL_DIFFS.map((d) => ({ ...d })),
    log: [],
    running: false,
  };
}

export function remainingCount(state: HarnessState): number {
  return state.diffs.filter((d) => d.status === "pending").length;
}

export function isClear(state: HarnessState): boolean {
  return remainingCount(state) === 0;
}

export function harnessReducer(
  state: HarnessState,
  action: HarnessAction
): HarnessState {
  switch (action.type) {
    case "run":
      return {
        ...state,
        log: ["screenshot captured", "computed styles diffed"],
        running: true,
      };
    case "tick": {
      const idx = state.diffs.findIndex((d) => d.status === "pending");
      if (idx === -1) {
        return { ...state, running: false };
      }
      const diffs = state.diffs.map((d, i) =>
        i === idx ? { ...d, status: "resolved" as const } : d
      );
      const log = [...state.log, state.diffs[idx].log];
      const stillPending = diffs.some((d) => d.status === "pending");
      return {
        ...state,
        diffs,
        log: stillPending ? log : [...log, "re-running audit… 0 remaining"],
        running: stillPending,
      };
    }
    case "reset":
      return initialHarnessState();
    default:
      return state;
  }
}

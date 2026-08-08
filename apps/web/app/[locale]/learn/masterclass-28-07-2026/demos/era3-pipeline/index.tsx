"use client";

import { cn } from "@repo/design-system/lib/utils";
import { useCallback, useEffect, useReducer } from "react";
import { LANES, type LaneMeta } from "./lanes";
import {
  type BoardAction,
  boardReducer,
  formatElapsed,
  inFlightCount,
  initialBoardState,
  isAnyExecuting,
  isBoardDone,
  type LaneId,
  type LaneState,
} from "./reducer";

const TICK_MS = 1000;

export function Era3Pipeline() {
  const [state, dispatch] = useReducer(
    boardReducer,
    undefined,
    initialBoardState
  );

  const reset = useCallback(() => dispatch({ type: "reset" }), []);

  // Only on the clock while something is actually running.
  const running = isAnyExecuting(state);
  useEffect(() => {
    if (!running) {
      return;
    }
    const id = setInterval(
      () => dispatch({ ms: TICK_MS, type: "tick" }),
      TICK_MS
    );
    return () => clearInterval(id);
  }, [running]);

  const done = isBoardDone(state);
  const inFlight = inFlightCount(state);

  return (
    <div className="mt-10 rounded-xl border border-foreground/10 p-4 sm:p-6">
      <p className="font-medium text-base">
        Three features, one thread of attention
      </p>
      <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
        Three real features from my board. Nothing moves to the next step unless
        I move it, so I hold all three at once — and that is the tiring part.
        The agent could take a fourth. I couldn&apos;t.
      </p>

      <div className="mt-5 space-y-4">
        {LANES.map((lane) => (
          <LaneRow
            dispatch={dispatch}
            key={lane.id}
            lane={lane}
            laneState={state.lanes[lane.id]}
          />
        ))}
      </div>

      <div className="mt-4 flex items-start justify-between gap-4">
        <p className="max-w-2xl text-foreground/55 text-sm italic">
          {done
            ? "Twelve decisions across three features. None of them was hard. Holding all three at once was."
            : "Hand one off, then the next. The work happens at the same time. My attention can't."}
        </p>
        <div className="flex shrink-0 items-center gap-3">
          <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
            {inFlight} in my head
          </span>
          <button
            className="shrink-0 rounded border border-foreground/15 px-2 py-1 font-mono text-muted-foreground text-xs hover:text-foreground"
            onClick={reset}
            type="button"
          >
            ↺ reset
          </button>
        </div>
      </div>
    </div>
  );
}

function LaneRow({
  dispatch,
  lane,
  laneState,
}: {
  dispatch: React.Dispatch<BoardAction>;
  lane: LaneMeta;
  laneState: LaneState;
}) {
  return (
    <div className="rounded-lg border border-foreground/10 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-foreground/80 text-sm">{lane.plain}</p>
        <p className="font-mono text-[10px] text-muted-foreground tracking-wide">
          {lane.mono} · court: {lane.court}
        </p>
      </div>
      <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/70 italic">
        {lane.tense}
      </p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <PlanCell
          dispatch={dispatch}
          laneId={lane.id}
          phase={laneState.phase}
        />
        <ExecuteCell
          dispatch={dispatch}
          laneId={lane.id}
          laneState={laneState}
        />
        <ValidateCell
          dispatch={dispatch}
          laneId={lane.id}
          phase={laneState.phase}
        />
      </div>
    </div>
  );
}

const CELL =
  "rounded-md border px-2 py-2 text-center font-mono text-[11px] transition-colors";
const CELL_WAITING = "border-foreground/5 text-muted-foreground/40 opacity-50";
const CELL_SPENT = "border-foreground/10 text-muted-foreground";
const ACTION =
  "w-full rounded bg-foreground px-2 py-1 text-background transition-opacity hover:opacity-90";

/** One click, one lane transition — the callback lives here so each cell's
 *  button gets a stable handler. */
function LaneAction({
  dispatch,
  label,
  lane,
  type,
}: {
  dispatch: React.Dispatch<BoardAction>;
  label: string;
  lane: LaneId;
  type: "accept" | "handOff" | "markDone" | "toValidation";
}) {
  const fire = useCallback(
    () => dispatch({ lane, type }),
    [dispatch, lane, type]
  );

  return (
    <button className={ACTION} onClick={fire} type="button">
      {label}
    </button>
  );
}

function PlanCell({
  dispatch,
  laneId,
  phase,
}: {
  dispatch: React.Dispatch<BoardAction>;
  laneId: LaneMeta["id"];
  phase: LaneState["phase"];
}) {
  if (phase === "planned") {
    return (
      <div className={cn(CELL, "border-ht-cyan-500/50")}>
        <LaneAction
          dispatch={dispatch}
          label="Hand off →"
          lane={laneId}
          type="handOff"
        />
      </div>
    );
  }
  return <div className={cn(CELL, CELL_SPENT)}>✓ plan</div>;
}

function ExecuteCell({
  dispatch,
  laneId,
  laneState,
}: {
  dispatch: React.Dispatch<BoardAction>;
  laneId: LaneMeta["id"];
  laneState: LaneState;
}) {
  const { elapsedMs, phase } = laneState;
  if (phase === "planned") {
    return <div className={cn(CELL, CELL_WAITING)}>execute</div>;
  }
  // Stopping the clock is its own click: the agent finishing is not the same
  // event as deciding the result is worth validating.
  if (phase === "executing") {
    return (
      <div className={cn(CELL, "space-y-1.5 border-ht-cyan-500/50")}>
        <div className="text-foreground tabular-nums">
          ⏱ {formatElapsed(elapsedMs)}
        </div>
        <LaneAction
          dispatch={dispatch}
          label="done"
          lane={laneId}
          type="markDone"
        />
      </div>
    );
  }
  return (
    <div className={cn(CELL, CELL_SPENT)}>
      <span className="tabular-nums">✓ {formatElapsed(elapsedMs)}</span>
    </div>
  );
}

function ValidateCell({
  dispatch,
  laneId,
  phase,
}: {
  dispatch: React.Dispatch<BoardAction>;
  laneId: LaneMeta["id"];
  phase: LaneState["phase"];
}) {
  if (phase === "executed") {
    return (
      <div className={cn(CELL, "border-ht-cyan-500/50")}>
        <LaneAction
          dispatch={dispatch}
          label="Validate →"
          lane={laneId}
          type="toValidation"
        />
      </div>
    );
  }
  if (phase === "validating") {
    return (
      <div className={cn(CELL, "border-ht-cyan-500/50")}>
        <LaneAction
          dispatch={dispatch}
          label="Accept ✓"
          lane={laneId}
          type="accept"
        />
      </div>
    );
  }
  if (phase === "validated") {
    return (
      <div className={cn(CELL, "border-foreground/10")}>
        <span className="rounded bg-[#238636] px-2 py-0.5 text-white">
          VALIDATED ✓
        </span>
      </div>
    );
  }
  return <div className={cn(CELL, CELL_WAITING)}>validate</div>;
}

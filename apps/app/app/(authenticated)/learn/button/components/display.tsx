"use client";

import { Button } from "@repo/design-system/components/ui/button";
import clsx from "clsx";
import { type Dispatch, useCallback } from "react";
import { Ping } from "@/components/ui/ping";

interface CounterState {
  count: number;
  disabled: boolean;
  info: string;
  internalCount: number;
}

interface CounterAction {
  type: "updating" | "updated";
}

interface CounterDisplayProps {
  dispatch: Dispatch<CounterAction>;
  state: CounterState;
}

export function CounterDisplay({ state, dispatch }: CounterDisplayProps) {
  const handleArm = useCallback(() => {
    dispatch({ type: "updating" });
  }, [dispatch]);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-y-6 p-4 font-medium text-black dark:text-white">
      <div className="text-center">
        You collected{" "}
        <span
          className={clsx(
            "mx-1 rounded-md px-3.5 py-1.5 font-semibold text-gray-900 text-lg shadow-sm ring-1 ring-zinc-300 ring-inset dark:text-gray-100 dark:ring-zinc-600",
            {
              "animate-[highlight_1s_ease-in-out_1]": state.disabled,
              "bg-zinc-100 dark:bg-zinc-800": !state.disabled,
            }
          )}
        >
          {state.count}
        </span>{" "}
        {state.count === 1 ? "hazelnut" : "hazelnuts"} 🌰!
      </div>
      <span className="relative inline-flex">
        <Button
          className="rounded-md bg-zinc-800 px-12 py-2 font-semibold text-base text-orange-200 leading-6 ring-1 ring-zinc-200/20 transition duration-150 ease-in-out hover:bg-zinc-800/90 enabled:hover:text-orange-100 enabled:hover:shadow-[0_0_0.5em_0em_rgba(161,161,170,0.6)] disabled:cursor-not-allowed disabled:opacity-70"
          disabled={!state.disabled}
          onClick={handleArm}
        >
          +1 🌰
        </Button>
        {state.disabled ? <Ping /> : null}
      </span>
      <div className="min-h-12 text-balance text-center font-light text-base italic">
        {state.info}
      </div>
    </div>
  );
}

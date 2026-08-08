"use client";

import { Button } from "@repo/design-system/components/ui/button";
import clsx from "clsx";
import { motion } from "motion/react";
import {
  type Reducer,
  Suspense,
  useCallback,
  useReducer,
  useState,
} from "react";
import { Boundary } from "@/components/ui/boundary";
import { Ping } from "@/components/ui/ping";
import { initHighlighter } from "@/lib/highlighter";
import { CounterCode } from "./code";
import { CounterDisplay } from "./display";
import { CodeSkeleton } from "./skeleton";
import { getCounterSnippets } from "./snippets";

interface CounterState {
  animateRerendering: boolean;
  aside: string;
  count: number;
  disabled: boolean;
  info: string;
  internalCount: number;
  label: string;
  title: string;
}

interface CounterAction {
  type: "updating" | "updated";
}

const initialState: CounterState = {
  animateRerendering: false,
  aside:
    "Winter is coming. Hazel needs to save some hazelnuts for the cold months.",
  count: 0,
  disabled: true,
  info: "Hazel is a professional squirrel and junior React developer. She can collect hazelnuts for you.",
  internalCount: 0,
  label: "Become a React dev",
  title: "About hazelnuts 🌰",
};

const counterReducer: Reducer<CounterState, CounterAction> = (
  state,
  action
) => {
  switch (action.type) {
    case "updating":
      return {
        ...state,
        aside: "Click the button to have Hazel get another hazelnut.",
        disabled: false,
        info: "Hazel has got a fine nose. She can smell something's happening.",
        internalCount: state.internalCount + 1,
        label: "React",
        title: "Hazel is ready!",
      };
    case "updated":
      return {
        ...state,
        animateRerendering: true,
        aside: "You are now a React dev.",
        count: state.count + 1,
        disabled: true,
        info: "That's the spirit! You and Hazel are a great team.",
        label: "React",
        title: "Well done!",
      };
    default:
      return state;
  }
};

const flipVariants = {
  animate: { opacity: 1, rotateY: 0 },
  exit: { opacity: 0, rotateY: -90 },
  initial: { opacity: 0, rotateY: 90 },
};

export function Counter() {
  const [state, dispatch] = useReducer(counterReducer, initialState);
  const [componentToShow, setComponentToShow] = useState<
    "codeDisplay" | "buttonDisplay"
  >("buttonDisplay");

  const pendingHighlighter = initHighlighter();

  const handleIncrease = useCallback(() => {
    dispatch({ type: "updated" });
    setComponentToShow("codeDisplay");
  }, []);

  const handleAnimationComplete = useCallback(() => {
    setComponentToShow("buttonDisplay");
  }, []);

  const codeSnippets = getCounterSnippets(state.internalCount);

  return (
    <div className="h-full rounded-lg bg-zinc-50 px-4 py-6 shadow-2xl ring-1 ring-black/10 sm:px-6 dark:bg-zinc-900 dark:ring-white/10">
      <Boundary
        animateRerendering={false}
        color="default"
        labels={[state.label]}
        size="default"
      >
        {/* Header section */}
        <div
          className={clsx(
            "mt-6 mb-7 rounded-md border border-transparent bg-zinc-100 px-4 py-5 sm:px-6 dark:bg-zinc-800",
            {
              "border-zinc-300 bg-zinc-200 dark:border-zinc-600 dark:bg-zinc-700":
                !state.disabled,
            }
          )}
        >
          <div className="-ml-4 flex flex-wrap items-center justify-between sm:flex-nowrap">
            <div className="mt-2 ml-4">
              <h3 className="font-semibold text-base text-gray-900 dark:text-gray-100">
                {state.title}
              </h3>
              <p className="text-gray-700 text-sm dark:text-gray-300">
                {state.aside}
              </p>
            </div>
            <div className="mt-2 ml-4 shrink-0">
              <span className="relative inline-flex">
                <Button
                  className="rounded-md bg-zinc-800 px-12 py-2 font-semibold text-base text-orange-500 leading-6 ring-1 ring-zinc-200/20 transition duration-150 ease-in-out enabled:hover:text-orange-400 enabled:hover:shadow-[0_0_0.5em_0em_rgba(236,159,72,0.6)] disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={state.disabled}
                  onClick={handleIncrease}
                >
                  <span>
                    {state.disabled
                      ? "idle 🐿️"
                      : `Increase to ${state.internalCount} 🌰`}
                  </span>
                  {!state.disabled && <Ping />}
                </Button>
              </span>
            </div>
          </div>
        </div>

        <div className="mx-auto my-10 max-w-sm border-zinc-200 border-b dark:border-zinc-700" />

        {/* Main section with nested boundary */}
        <Boundary
          animateRerendering={state.animateRerendering}
          color="default"
          key={state.count}
          labels={["Counter Component"]}
          size="default"
        >
          <div className="flex h-[320px] w-full items-center sm:h-[354px]">
            {componentToShow === "codeDisplay" && (
              <motion.div
                animate="animate"
                className="w-full"
                exit="exit"
                initial="initial"
                key="codeDisplay"
                transition={{ duration: 0.5 }}
                variants={flipVariants}
              >
                <Suspense fallback={<CodeSkeleton isLoading />}>
                  <CounterCode
                    code={codeSnippets}
                    onAnimationComplete={handleAnimationComplete}
                    pendingHighlighter={pendingHighlighter}
                  />
                </Suspense>
              </motion.div>
            )}

            {componentToShow === "buttonDisplay" && (
              <motion.div
                animate="animate"
                className="flex w-full justify-center"
                exit="exit"
                initial="initial"
                key="buttonDisplay"
                transition={{ duration: 0.3 }}
                variants={flipVariants}
              >
                <CounterDisplay dispatch={dispatch} state={state} />
              </motion.div>
            )}
          </div>
        </Boundary>
      </Boundary>
    </div>
  );
}

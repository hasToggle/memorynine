"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { AnimatePresence, motion } from "motion/react";
import type { CSSProperties, MouseEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { OUTPUT_LINES, PROMPTS } from "./completions";
import { ConsoleChrome } from "./console-chrome";
import { dispositionFor } from "./disposition";
import { completionClass, prefixIsComment, visibleTokens } from "./highlight";
import { COMPLETION_TOKENS, PREFIX_TOKENS } from "./highlight/tokens.generated";
import { PhaseFooter } from "./phase-footer";
import { furthestOf, type PhaseId, phaseFor, phaseImpliedBy } from "./phases";
import { PromptTabs } from "./prompt-tabs";
import { bandFor, INITIAL_TEMP, type Mode, selectCompletion } from "./selector";
import {
  type DemoSnapshot,
  freshSnapshot,
  getSnapshot,
  saveSnapshot,
} from "./session-store";
import { verdictFor } from "./verdicts";

const STREAM_MS = 18;

/** Long enough that Eric has already said the line and the page agrees. */
const VERDICT_DELAY_MS = 1500;

/** `OUTPUT_LINES` at leading-7, plus p-4 top and bottom. */
const OUTPUT_HEIGHT = `calc(${OUTPUT_LINES} * 1.75rem + 2rem)`;

interface Era1PlaygroundProps {
  presenter: boolean;
}

export function Era1Playground({ presenter }: Era1PlaygroundProps) {
  const [snap, setSnap] = useState<DemoSnapshot>(getSnapshot);
  const [streaming, setStreaming] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const target = useRef("");
  const latest = useRef(snap);

  useEffect(() => {
    latest.current = snap;
    saveSnapshot(snap);
  }, [snap]);

  const stopTimer = useCallback(() => {
    if (timer.current !== null) {
      clearInterval(timer.current);
      timer.current = null;
    }
    setStreaming(false);
  }, []);

  // Navigating away mid-stream stores the *finished* text, so stepping back
  // returns a completed run rather than a sentence cut in half.
  useEffect(
    () => () => {
      if (timer.current !== null) {
        clearInterval(timer.current);
        timer.current = null;
        saveSnapshot({ ...latest.current, output: target.current });
      }
    },
    []
  );

  const patch = useCallback((next: Partial<DemoSnapshot>) => {
    setSnap((s) => ({ ...s, ...next }));
  }, []);

  const run = useCallback(
    (runMode: Mode, runPromptId: string, runTemp: number) => {
      stopTimer();
      const runPrompt = PROMPTS.find((p) => p.id === runPromptId) ?? PROMPTS[0];
      const full = selectCompletion(runPromptId, runTemp, runMode);
      target.current = full;
      const lastRun = {
        band: bandFor(runTemp),
        isQuestion: runPrompt.isQuestion,
        mode: runMode,
      };
      const reduce = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      if (reduce) {
        patch({ lastRun, output: full, verdict: null });
        return;
      }
      patch({ lastRun, output: "", verdict: null });
      setStreaming(true);
      let i = 0;
      timer.current = setInterval(() => {
        i += 1;
        setSnap((s) => ({ ...s, output: full.slice(0, i) }));
        if (i >= full.length) {
          stopTimer();
        }
      }, STREAM_MS);
    },
    [patch, stopTimer]
  );

  // The page never speaks first: the verdict arrives a beat after the stream
  // finishes, agreeing with what Eric has already said.
  const { lastRun, verdict } = snap;
  useEffect(() => {
    // The ternary rather than an early return: TypeScript narrows `lastRun`
    // inside the true branch, and the effect returns a cleanup on every path.
    const id =
      !streaming && lastRun !== null && verdict === null
        ? setTimeout(
            () => patch({ verdict: verdictFor(lastRun) }),
            VERDICT_DELAY_MS
          )
        : null;
    return () => {
      if (id) {
        clearTimeout(id);
      }
    };
  }, [lastRun, patch, streaming, verdict]);

  const handleRun = useCallback(
    () => run(snap.mode, snap.promptId, snap.temp),
    [run, snap.mode, snap.promptId, snap.temp]
  );

  const goToPhase = useCallback(
    (id: PhaseId) => {
      stopTimer();
      const { arrival } = phaseFor(id);
      setSnap((s) => ({
        ...s,
        furthest: furthestOf(s.furthest, id),
        lastRun: null,
        mode: arrival.mode,
        output: "",
        phase: id,
        promptId: arrival.promptId,
        temp: arrival.resetTemp ? INITIAL_TEMP : s.temp,
        verdict: null,
      }));
    },
    [stopTimer]
  );

  const handleModeChange = useCallback(
    (next: Mode) => {
      stopTimer();
      setSnap((s) =>
        s.mode === next
          ? s
          : { ...s, lastRun: null, mode: next, output: "", verdict: null }
      );
    },
    [stopTimer]
  );

  const handlePromptClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const id = event.currentTarget.dataset.prompt;
      if (!id) {
        return;
      }
      stopTimer();
      setSnap((s) =>
        s.promptId === id
          ? s
          : { ...s, lastRun: null, output: "", promptId: id, verdict: null }
      );
    },
    [stopTimer]
  );

  const handleReset = useCallback(() => {
    stopTimer();
    setSnap(freshSnapshot());
  }, [stopTimer]);

  const handleTempChange = useCallback(
    (temp: number) => patch({ temp }),
    [patch]
  );

  // A control left in a later-beat state (dial moved, mode flipped) implies
  // that later beat even if `furthest`/`phase` haven't caught up — e.g.
  // toggling presenter mode on mid-session. Folding it into both keeps the
  // disposition and the footer's highlight consistent with what's on screen;
  // `furthestOf` is monotone both ways, so this only ever opens gates and
  // advances the highlight, never closes or rewinds them.
  const implied = phaseImpliedBy({
    mode: snap.mode,
    promptId: snap.promptId,
    temp: snap.temp,
  });
  const furthest = furthestOf(snap.furthest, implied);
  const phase = furthestOf(snap.phase, implied);

  const disposition = dispositionFor({
    furthest,
    presenter,
  });
  const prompt = PROMPTS.find((p) => p.id === snap.promptId) ?? PROMPTS[0];

  // One slot, one line, and it stays empty until a run at this beat has earned
  // something to say. Arriving at a beat says nothing: the presenter is talking,
  // and a caption waiting on screen is the page speaking over him.
  const line = snap.verdict ?? "";

  // Tokens are precomputed from the *finished* text and revealed by character
  // count, so the colours a token gets never change as it streams.
  //
  // The band comes from `lastRun`, never from the dial's current position.
  // Dragging the dial deliberately does not clear the output — the verdict
  // describes the run, not the slider — so after running at 1.5 and dragging
  // back to 0.7, `snap.output` still holds the high-band text. Keying off
  // `snap.temp` there would slice a *different* completion's tokens and render
  // text the machine never produced.
  const prefixTokens = PREFIX_TOKENS[prompt.id] ?? [];
  const runBand = snap.lastRun?.band ?? bandFor(snap.temp);
  const outputMode = snap.lastRun?.mode ?? snap.mode;
  const completionKey = `${snap.promptId}:${outputMode}:${runBand}`;
  const shownTokens = visibleTokens(
    COMPLETION_TOKENS[completionKey] ?? [],
    snap.output.length
  );
  // Tokens are a positional stream — the same word recurs — so identity is
  // assigned here rather than leaning on the render-time index.
  const prefixSpans = prefixTokens.map((token, index) => ({
    ...token,
    id: `${prompt.id}-prefix-${index}`,
  }));
  const completionSpans = shownTokens.map((token, index) => ({
    ...token,
    id: `${completionKey}-${index}`,
  }));

  return (
    <div className="mb-6">
      <div className="overflow-hidden rounded-xl border border-foreground/10 bg-background">
        <ConsoleChrome
          mode={snap.mode}
          onModeChange={handleModeChange}
          onReset={handleReset}
          onTempChange={handleTempChange}
          showDial={disposition.showDial}
          showPostTrainedCell={disposition.showPostTrainedCell}
          temp={snap.temp}
        />

        <div className="p-4 sm:p-6">
          <div className="overflow-hidden rounded-lg border border-foreground/10 bg-muted">
            <PromptTabs
              activeId={snap.promptId}
              onSelect={handlePromptClick}
              showSecond={disposition.showSecondPrompt}
            />
            <pre
              className="overflow-auto whitespace-pre-wrap p-4 font-mono text-[15px] leading-7"
              style={{ height: OUTPUT_HEIGHT }}
            >
              {prefixSpans.map((token) => (
                <span
                  className={
                    prefixIsComment(token.k)
                      ? "text-foreground/85 italic"
                      : "text-[var(--tl)] dark:text-[var(--td)]"
                  }
                  key={token.id}
                  style={{ "--td": token.d, "--tl": token.l } as CSSProperties}
                >
                  {token.t}
                </span>
              ))}
              {completionSpans.map((token) => (
                <span className={completionClass(token.k)} key={token.id}>
                  {token.t}
                </span>
              ))}
              {streaming ? <span className="animate-pulse">▋</span> : null}
            </pre>
          </div>

          <div className="mt-4 flex justify-end">
            <Button onClick={handleRun} type="button">
              Run ⏎
            </Button>
          </div>
        </div>

        <div
          aria-live="polite"
          className="flex min-h-14 items-center border-foreground/10 border-t px-4 py-2 sm:h-14 sm:px-6 sm:py-0"
          role="status"
        >
          <AnimatePresence mode="wait">
            {line ? (
              <motion.p
                animate={{ opacity: 1 }}
                className="max-w-2xl text-foreground/55 text-sm italic"
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                key={line}
                transition={{ duration: 0.35 }}
              >
                {line}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>

        {disposition.showFooter ? (
          <PhaseFooter current={phase} onSelect={goToPhase} />
        ) : null}
      </div>
    </div>
  );
}

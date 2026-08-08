"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { AnimatePresence, motion } from "motion/react";
import { createParser, parseAsStringLiteral, useQueryState } from "nuqs";
import { useCallback, useEffect } from "react";
import { AddressStrip } from "./address-strip";
import { BeatFooter } from "./beat-footer";
import { BeatSlot } from "./beat-slot";
import { adjacentBeat, BEATS } from "./beats";
import { Era1Playground } from "./demos/era1-playground";
import { Era2Companion } from "./demos/era2-companion";
import { Era2Extraction } from "./demos/era2-companion/extraction-demo";
import { Era3Harness } from "./demos/era3-harness";
import { Era3Ladder } from "./demos/era3-ladder";
import { Era3Loop } from "./demos/era3-loop";
import { Era3Meter } from "./demos/era3-meter";
import { Era3Pipeline } from "./demos/era3-pipeline";
import { Era3Reach } from "./demos/era3-reach";
import { Era4Runtime } from "./demos/era4-runtime";
import { CompanyBrain } from "./demos/era4-runtime/company-brain";
import { EraPanel } from "./era-panel";
import { FieldNote } from "./field-note";
import { Intro } from "./intro";
import {
  isArrowConsumingTarget,
  isPresenterToggle,
  isTextEntryTarget,
  stepKeyDirection,
} from "./step-keys";
import { StepperHeader } from "./stepper-header";
import { getAdjacentStep, STEPS, type StepId } from "./steps";
import { Synthesis } from "./synthesis";
import { useBeats } from "./use-beats";

/** The four failures the reach demo walks one at a time. */
const REACH_BEATS = ["skipped", "bent", "left", "reached"] as const;

const STEP_IDS = STEPS.map((s) => s.id);

/**
 * The spec documents the entry URL as `?presenter=1` in bold, and `Shift+P`
 * must round-trip back to that same URL. `parseAsBoolean` only accepts the
 * literal string `"true"`, so both would silently fall through to the
 * default. This accepts `1`, `true` (any case) and the bare `?presenter`
 * flag (an empty value), and always serializes back to `"1"`.
 */
const parseAsPresenterFlag = createParser<boolean>({
  parse: (value) => {
    const normalized = value.toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "";
  },
  serialize: (value) => (value ? "1" : "false"),
});

export function Masterclass() {
  const [step, setStep] = useQueryState(
    "step",
    parseAsStringLiteral(STEP_IDS as StepId[])
      .withDefault("intro")
      .withOptions({ history: "push" })
  );

  const prev = getAdjacentStep(step, "prev");
  const next = getAdjacentStep(step, "next");

  const [presenter, setPresenter] = useQueryState(
    "presenter",
    parseAsPresenterFlag.withDefault(false).withOptions({ history: "replace" })
  );

  const { current: beat, go: goBeat, has } = useBeats(step, presenter);

  const begin = useCallback(() => setStep("completion"), [setStep]);
  const goPrev = useCallback(() => {
    if (prev) {
      setStep(prev);
    }
  }, [prev, setStep]);
  const goNext = useCallback(() => {
    if (next) {
      setStep(next);
    }
  }, [next, setStep]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isPresenterToggle(event) && !isTextEntryTarget(event.target)) {
        event.preventDefault();
        setPresenter(!presenter);
        return;
      }
      const dir = stepKeyDirection(event);
      if (!dir || isArrowConsumingTarget(event.target)) {
        return;
      }
      // One key for the whole talk: exhaust this step's beats, then move on.
      if (presenter) {
        const nextBeat = adjacentBeat(step, beat, dir);
        if (nextBeat) {
          goBeat(nextBeat);
          return;
        }
      }
      const adjacent = getAdjacentStep(step, dir);
      if (adjacent) {
        setStep(adjacent);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [presenter, setPresenter, step, setStep, beat, goBeat]);

  const reachRevealed = presenter
    ? REACH_BEATS.filter((id) => has(id)).length
    : undefined;
  const reachFenced = presenter ? has("fenced") : undefined;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-foreground/10 border-b bg-background/80 backdrop-blur">
        <AddressStrip />
        <StepperHeader current={step} onSelect={setStep} />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-full h-10 bg-linear-to-b from-background to-transparent"
        />
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:py-16">
        <AnimatePresence mode="wait">
          <motion.div
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            key={step}
            transition={{ duration: 0.2 }}
          >
            {step === "intro" && <Intro onBegin={begin} />}
            {step === "completion" && (
              <EraPanel
                name="The completion machine"
                reality="Nobody was shipping software with this. But everything that came after is still this machine underneath: you feed it the start of a pattern and it continues — unaware of what you meant. Getting knowledge out took craft, until OpenAI taught it a format."
                years="2019–2022"
              >
                <Era1Playground presenter={presenter} />
                <FieldNote date="2022" label="post-training">
                  Asked for the capital of France, a base model offers the
                  capital of Germany, as a question. OpenAI&apos;s own labelers
                  preferred post-trained answers roughly 85% of the time over
                  the base model&apos;s; ChatGPT shipped on that flip nine
                  months later.
                </FieldNote>
              </EraPanel>
            )}
            {step === "integration" && (
              <EraPanel
                deepCut={
                  <p>
                    The speed was real, and so was the ceiling: the model saw
                    one file, one selection. Cursor had to fork VS Code to raise
                    it — the extension API allows a sidebar, not an editor that
                    thinks; indexing a codebase and editing across files needs
                    the core. That&apos;s why Copilot rode along as a plugin
                    while Cursor rebuilt the vehicle. The ceiling finally
                    cracked late in 2024, when models learned to reason —
                    multi-step thinking, the ingredient agents were waiting for.
                  </p>
                }
                expandLabel="Did you know? You were the bus."
                name="Extraction → Integration"
                reality="It answers now — in a browser tab, a world away from your code. You ferry context in and answers out by hand, until the chat moves into the editor and your selection becomes its context. Either way the verdict held: a senior engineer was faster. The model missed the file next door and the framework's basics, and correcting it cost more than writing it."
                years="2022–2024"
              >
                <BeatSlot show={has("tab")}>
                  <Era2Extraction />
                </BeatSlot>
                <BeatSlot show={has("editor")}>
                  <p className="mb-4 max-w-2xl text-muted-foreground text-sm">
                    Then the chat moved into the editor, and your selection
                    became its context — no more ferrying. This is the Cursor
                    moment. Watch what it still couldn&apos;t see:
                  </p>
                  <Era2Companion />
                </BeatSlot>
              </EraPanel>
            )}
            {step === "agentic-engineering" && (
              <EraPanel
                name="Agentic engineering"
                reality="Strip the debate away: an agent is an LLM with tools, trapped in a loop. Claude Code put that loop in a terminal — barely useful at first, even on the strongest coding models. Then the loop learned to run longer; minutes became hours. You stop writing syntax and start writing the rules the loop must satisfy."
                years="2024 → now"
              >
                <BeatSlot show={has("loop")}>
                  <Era3Loop />
                </BeatSlot>
                <BeatSlot show={has("reading")}>
                  <Era3Ladder />
                </BeatSlot>
                <BeatSlot show={has("run")}>
                  <Era3Reach fenced={reachFenced} revealed={reachRevealed} />
                </BeatSlot>
                <BeatSlot show={has("parity")}>
                  <p className="mt-10 mb-4 max-w-2xl text-muted-foreground text-sm">
                    I don&apos;t write Playwright. I can say what pixel for
                    pixel means, and I can tell when the answer is wrong. The
                    agent wrote the measuring tool; I wrote the rule it measures
                    against — a client&apos;s WordPress site, rebuilt in
                    Next.js:
                  </p>
                  <Era3Harness />
                </BeatSlot>
                <BeatSlot show={has("lanes")}>
                  <Era3Pipeline />
                </BeatSlot>
                <BeatSlot show={has("meter")}>
                  <Era3Meter />
                </BeatSlot>
              </EraPanel>
            )}
            {step === "outlook" && (
              <EraPanel
                name="The model moves in"
                reality="The model moved into the running product: ask, and the interface is built on the spot. It moved into everything a company writes: mail, chat, meeting notes, tickets. Neither is a demo. Both change who gets to ask."
                years="now"
              >
                <BeatSlot show={has("compiled")}>
                  <Era4Runtime />
                </BeatSlot>
                <BeatSlot show={has("ambient")}>
                  <CompanyBrain />
                </BeatSlot>
              </EraPanel>
            )}
            {step === "synthesis" && <Synthesis />}
          </motion.div>
        </AnimatePresence>
      </main>
      {step !== "intro" && (
        <footer className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-8">
          <Button
            disabled={!prev}
            onClick={goPrev}
            type="button"
            variant="ghost"
          >
            ← Back
          </Button>
          <Button disabled={!next} onClick={goNext} type="button">
            Next →
          </Button>
        </footer>
      )}
      {presenter && BEATS[step].length > 0 && (
        <>
          {/* Reserves the height the fixed transport takes out of the viewport. */}
          <div className="h-[4.5rem]" />
          <BeatFooter current={beat} onSelect={goBeat} step={step} />
        </>
      )}
    </div>
  );
}

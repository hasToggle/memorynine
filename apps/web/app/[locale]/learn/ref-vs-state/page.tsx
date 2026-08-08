"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { ImageIcon, RefreshCw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { parseAsString, useQueryState } from "nuqs";
import { useCallback, useRef, useState } from "react";

// --- Constants ---
const GRID_OPACITY = 0.03;
const IMAGE_URL = "https://picsum.photos/seed/demo/600/400";
const FAKE_LOAD_DELAY_MS = 800;

// Discovery stage thresholds
const STAGE_INITIAL = 1;
const STAGE_COUNTER_REVEALED = 2;
const STAGE_DIAGRAM_SHOWN = 3;
const STAGE_INSIGHT_REVEALED = 4;
const MIN_RELOADS_FOR_STAGE_2 = 2;
const MIN_RELOADS_FOR_STAGE_4 = 4;
const MIN_TOGGLES_FOR_STAGE_3 = 1;
const MIN_TOGGLES_FOR_STAGE_4 = 2;

type Mode = "useRef" | "useState";

// --- Code Snippets ---
const CODE_SNIPPETS: Record<Mode, string> = {
  useRef: `const imgRef = useRef<HTMLImageElement>(null);

const handleLoad = () => {
  imgRef.current?.classList.remove('opacity-0');
  imgRef.current?.classList.add('opacity-100');
};

<Image
  ref={imgRef}
  onLoad={handleLoad}
  className="opacity-0 transition-opacity duration-700"
  ...
/>`,
  useState: `const [loaded, setLoaded] = useState(false);

const handleLoad = () => setLoaded(true);

<Image
  onLoad={handleLoad}
  className={\`transition-opacity duration-700 \${
    loaded ? 'opacity-100' : 'opacity-0'
  }\`}
  ...
/>`,
};

// --- Sub-Components ---

function CodePanel({ mode }: { mode: Mode }) {
  return (
    <div className="flex h-full flex-col">
      <h2 className="mb-4 font-bold text-white/40 text-xs uppercase tracking-widest">
        Implementation
      </h2>
      <div className="flex-1 overflow-auto rounded-xl border border-white/10 bg-black/40 p-4">
        <pre className="font-mono text-[11px] text-white/80 leading-relaxed">
          <code>{CODE_SNIPPETS[mode]}</code>
        </pre>
      </div>
      <div className="mt-4 rounded-lg border border-white/5 bg-white/5 p-3">
        <div className="text-white/40 text-xs uppercase tracking-wider">
          Mechanism
        </div>
        <div className="mt-1 text-sm text-white/80">
          {mode === "useRef" ? (
            <>
              Direct DOM mutation via{" "}
              <code className="rounded bg-white/10 px-1">classList</code>
            </>
          ) : (
            <>React state triggers re-render</>
          )}
        </div>
      </div>
    </div>
  );
}

function ImageDemo({
  mode,
  imageKey,
  onReload,
  imgRef,
  loaded,
  onLoadRef,
  onLoadState,
}: {
  mode: Mode;
  imageKey: number;
  onReload: () => void;
  imgRef: React.RefObject<HTMLImageElement | null>;
  loaded: boolean;
  onLoadRef: () => void;
  onLoadState: () => void;
}) {
  const isUseRef = mode === "useRef";

  return (
    <div className="flex flex-col items-center gap-8">
      <div className="text-center text-white/40 text-xs">
        Synthetic delay: {FAKE_LOAD_DELAY_MS}ms
      </div>
      <div className="relative">
        <div className="absolute -inset-4 rounded-3xl bg-linear-to-br from-white/5 to-transparent" />
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/40">
          {isUseRef ? (
            <Image
              alt="Demo image"
              className="opacity-0 transition-opacity duration-700"
              height={267}
              key={`ref-${imageKey}`}
              onLoad={onLoadRef}
              priority
              ref={imgRef}
              src={`${IMAGE_URL}?v=${imageKey}`}
              width={400}
            />
          ) : (
            <Image
              alt="Demo image"
              className={`transition-opacity duration-700 ${loaded ? "opacity-100" : "opacity-0"}`}
              height={267}
              key={`state-${imageKey}`}
              onLoad={onLoadState}
              priority
              src={`${IMAGE_URL}?v=${imageKey}`}
              width={400}
            />
          )}
        </div>
      </div>

      <Button
        className="gap-2 rounded-full border-white/20 bg-white/5 text-white hover:bg-white/10"
        onClick={onReload}
        variant="outline"
      >
        <RefreshCw size={16} />
        Reload Image
      </Button>
    </div>
  );
}

function WhatKnowsDiagram({ mode }: { mode: Mode }) {
  const isUseRef = mode === "useRef";

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3 text-white/40 text-xs uppercase tracking-wider">
        Who knows the image loaded?
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e] transition-colors" />
          <span className="text-sm text-white/80">Browser DOM</span>
        </div>
        <div className="flex items-center gap-3">
          <div
            className={`h-2 w-2 rounded-full transition-colors ${
              isUseRef ? "bg-white/20" : "bg-green-500 shadow-[0_0_8px_#22c55e]"
            }`}
          />
          <span
            className={`text-sm ${isUseRef ? "text-white/40" : "text-white/80"}`}
          >
            React Virtual DOM
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div
            className={`h-2 w-2 rounded-full transition-colors ${
              isUseRef ? "bg-white/20" : "bg-green-500 shadow-[0_0_8px_#22c55e]"
            }`}
          />
          <span
            className={`text-sm ${isUseRef ? "text-white/40" : "text-white/80"}`}
          >
            Other Components (via props/context)
          </span>
        </div>
      </div>
    </div>
  );
}

function ScenarioCard({
  question,
  answer,
  recommendation,
}: {
  question: string;
  answer: string;
  recommendation: Mode;
}) {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((current) => !current), []);

  return (
    <button
      className="w-full rounded-lg border border-white/5 bg-white/5 p-3 text-left transition-colors hover:border-white/10"
      onClick={toggle}
      type="button"
    >
      <div className="text-sm text-white/60">{question}</div>
      <AnimatePresence>
        {expanded ? (
          <motion.div
            animate={{ height: "auto", opacity: 1 }}
            className="overflow-hidden"
            exit={{ height: 0, opacity: 0 }}
            initial={{ height: 0, opacity: 0 }}
          >
            <div className="mt-2 border-white/10 border-t pt-2">
              <span className="text-white/40 text-xs">Recommended: </span>
              <span
                className={`rounded px-1.5 py-0.5 font-mono text-xs ${
                  recommendation === "useState"
                    ? "bg-blue-500/20 text-blue-400"
                    : "bg-amber-500/20 text-amber-400"
                }`}
              >
                {recommendation}
              </span>
              <p className="mt-1 text-white/50 text-xs">{answer}</p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </button>
  );
}

function DiscoveryPanel({
  mode,
  renderCount,
  stage,
}: {
  mode: Mode;
  renderCount: number;
  stage: number;
}) {
  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto">
      {/* Re-render Counter */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div
              className={`text-xs uppercase tracking-wider transition-colors ${
                stage >= STAGE_COUNTER_REVEALED
                  ? "text-white/40"
                  : "text-white/20"
              }`}
            >
              {stage >= STAGE_COUNTER_REVEALED
                ? "Component Re-renders"
                : "Counter"}
            </div>
            <div className="font-mono text-3xl text-white">{renderCount}</div>
          </div>
          <div
            className={`h-3 w-3 rounded-full transition-all ${
              mode === "useState"
                ? "animate-pulse bg-blue-500 shadow-[0_0_12px_#3b82f6]"
                : "bg-white/10"
            }`}
          />
        </div>
        {stage >= STAGE_COUNTER_REVEALED && (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 border-white/10 border-t pt-3"
            initial={{ opacity: 0, y: 10 }}
          >
            <p className="text-sm text-white/50">
              {mode === "useState"
                ? "State change triggers React re-render"
                : "DOM mutation bypasses React"}
            </p>
          </motion.div>
        )}
      </div>

      {/* Progressive Prompts */}
      <div className="space-y-3">
        {stage === STAGE_INITIAL && (
          <motion.p
            animate={{ opacity: 1 }}
            className="text-sm text-white/60 leading-relaxed"
            initial={{ opacity: 0 }}
          >
            Toggle between modes. Reload the image a few times.{" "}
            <span className="text-white/40">What do you notice?</span>
          </motion.p>
        )}

        {stage >= STAGE_COUNTER_REVEALED && (
          <motion.p
            animate={{ opacity: 1 }}
            className="text-sm text-white/60 leading-relaxed"
            initial={{ opacity: 0 }}
          >
            The fade looks identical.
          </motion.p>
        )}

        {stage >= STAGE_DIAGRAM_SHOWN && (
          <motion.div animate={{ opacity: 1 }} initial={{ opacity: 0 }}>
            <p className="mb-4 text-sm text-white/60">
              But why does one cause React to re-render while the other doesn’t?
            </p>
            <WhatKnowsDiagram mode={mode} />
          </motion.div>
        )}
      </div>

      {/* Scenarios */}
      {stage >= STAGE_DIAGRAM_SHOWN && (
        <motion.div
          animate={{ opacity: 1 }}
          className="space-y-3"
          initial={{ opacity: 0 }}
        >
          <div className="text-white/40 text-xs uppercase tracking-wider">
            When would this matter?
          </div>
          <div className="space-y-2">
            <ScenarioCard
              answer="The sibling needs to know the loaded state. React state makes this possible."
              question="What if a sibling needs to show a spinner?"
              recommendation="useState"
            />
            <ScenarioCard
              answer="Parent components can react to state changes via props or context."
              question="What if a parent needs to trigger an animation?"
              recommendation="useState"
            />
            <ScenarioCard
              answer="No other component cares. Direct DOM mutation is simpler and faster."
              question="What if it's just a visual tweak on this element?"
              recommendation="useRef"
            />
          </div>
        </motion.div>
      )}

      {/* The Insight */}
      {stage >= STAGE_INSIGHT_REVEALED && (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="mt-auto rounded-xl border border-white/20 bg-linear-to-br from-white/10 to-white/5 p-4"
          initial={{ opacity: 0, y: 20 }}
        >
          <div className="mb-2 text-white/40 text-xs uppercase tracking-wider">
            The Insight
          </div>
          <p className="text-sm text-white/70 leading-relaxed">
            React is{" "}
            <span className="font-medium text-white/90">declarative</span>—you
            describe what you want, and React updates the DOM for you.
          </p>
          <p className="mt-2 text-sm text-white/70 leading-relaxed">
            Using a ref is{" "}
            <span className="font-medium text-white/90">imperative</span>—you
            call native DOM APIs directly, bypassing React entirely.
          </p>
          <p className="mt-2 text-sm text-white/70 leading-relaxed">
            The browser doesn&apos;t know React exists. It just sees a DOM
            change and repaints—no virtual DOM, no reconciliation, no re-render.
          </p>
        </motion.div>
      )}
    </div>
  );
}

// --- Main Component ---

function ModeButton({
  active,
  mode,
  onSelect,
}: {
  active: boolean;
  mode: Mode;
  onSelect: (mode: Mode) => void;
}) {
  const select = useCallback(() => onSelect(mode), [mode, onSelect]);

  return (
    <button
      className={`rounded-full border px-4 py-1.5 font-mono text-xs transition-all ${
        active
          ? "border-white bg-white text-black"
          : "border-white/10 text-white/40 hover:border-white/20"
      }`}
      onClick={select}
      type="button"
    >
      {mode}
    </button>
  );
}

export default function RefVsStateLab() {
  const [mode, setMode] = useQueryState(
    "mode",
    parseAsString.withDefault("useRef").withOptions({ history: "replace" })
  );

  const [imageKey, setImageKey] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Track interactions for progressive disclosure
  const [reloadCount, setReloadCount] = useState(0);
  const [modeToggles, setModeToggles] = useState(0);

  // Re-render counter (only counts re-renders from image load)
  const [renderCount, setRenderCount] = useState(0);

  // Calculate discovery stage
  const stage = (() => {
    if (
      modeToggles >= MIN_TOGGLES_FOR_STAGE_4 &&
      reloadCount >= MIN_RELOADS_FOR_STAGE_4
    ) {
      return STAGE_INSIGHT_REVEALED;
    }
    if (
      modeToggles >= MIN_TOGGLES_FOR_STAGE_3 &&
      reloadCount >= MIN_RELOADS_FOR_STAGE_2
    ) {
      return STAGE_DIAGRAM_SHOWN;
    }
    if (reloadCount >= MIN_RELOADS_FOR_STAGE_2) {
      return STAGE_COUNTER_REVEALED;
    }
    return STAGE_INITIAL;
  })();

  const handleReload = () => {
    setImageKey((k) => k + 1);
    setLoaded(false);
    setReloadCount((c) => c + 1);
    // Reset the ref-based image opacity when reloading
    if (imgRef.current !== null) {
      imgRef.current.classList.remove("opacity-100");
      imgRef.current.classList.add("opacity-0");
    }
  };

  const handleModeChange = (newMode: Mode) => {
    setMode(newMode);
    setModeToggles((c) => c + 1);
    // Reset all state when switching modes
    setImageKey((k) => k + 1);
    setLoaded(false);
    setReloadCount(0);
    setRenderCount(0);
  };

  const handleLoadRef = () => {
    // Fake delay to demonstrate that DOM mutation doesn't trigger re-render
    setTimeout(() => {
      imgRef.current?.classList.remove("opacity-0");
      imgRef.current?.classList.add("opacity-100");
    }, FAKE_LOAD_DELAY_MS);
  };

  const handleLoadState = () => {
    // Same delay, but this triggers a React re-render
    setTimeout(() => {
      setLoaded(true);
      setRenderCount((c) => c + 1);
    }, FAKE_LOAD_DELAY_MS);
  };

  const currentMode = (mode === "useState" ? "useState" : "useRef") as Mode;

  return (
    <main className="relative flex min-h-screen flex-col bg-[#050505] font-sans text-white selection:bg-white/20">
      {/* Grid Background */}
      <div
        className="pointer-events-none absolute inset-0 text-white"
        style={{
          backgroundImage: "radial-gradient(#fff 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          opacity: GRID_OPACITY,
        }}
      />

      {/* Header */}
      <header className="flex h-16 items-center justify-between border-white/5 border-b px-8 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-white/10">
            <ImageIcon className="h-4 w-4 text-cyan-400" />
          </div>
          <h1 className="font-bold text-lg tracking-tight">
            Image Loading Lab{" "}
            <span className="ml-2 font-normal text-white/40">ref vs state</span>
          </h1>
        </div>

        {/* Mode Toggle */}
        <div className="flex gap-2">
          {(["useRef", "useState"] as const).map((m) => (
            <ModeButton
              active={currentMode === m}
              key={m}
              mode={m}
              onSelect={handleModeChange}
            />
          ))}
        </div>
      </header>

      {/* Main Content */}
      <div className="grid flex-1 grid-cols-12 overflow-hidden">
        {/* Code Panel */}
        <aside className="col-span-3 flex flex-col overflow-y-auto border-white/5 border-r bg-white/2 p-6">
          <CodePanel mode={currentMode} />
        </aside>

        {/* Image Demo */}
        <section className="relative col-span-6 flex flex-col items-center justify-center p-12">
          <ImageDemo
            imageKey={imageKey}
            imgRef={imgRef}
            loaded={loaded}
            mode={currentMode}
            onLoadRef={handleLoadRef}
            onLoadState={handleLoadState}
            onReload={handleReload}
          />
        </section>

        {/* Discovery Panel */}
        <aside className="col-span-3 flex flex-col border-white/5 border-l bg-white/2 p-6">
          <DiscoveryPanel
            mode={currentMode}
            renderCount={renderCount}
            stage={stage}
          />
        </aside>
      </div>
    </main>
  );
}

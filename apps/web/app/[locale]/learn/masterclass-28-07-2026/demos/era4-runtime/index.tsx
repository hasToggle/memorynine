"use client";

import { cn } from "@repo/design-system/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { Expandable } from "../../../../components/expandable";
import { DashboardRenderer } from "./dashboard-renderer";
import { generateDashboard } from "./generate-dashboard";
import { INTENTS } from "./match";
import type { RenderSpec, Widget } from "./render-spec";

type View = "idle" | "compiling" | "rendered";
const CHAR_MS = 6;

/** Every widget kind `render-spec.ts` allows — the whole vocabulary the model
 *  writes in. Shown so the room can see the answer is a choice from a fixed
 *  catalog, not free-form UI. */
const WIDGET_KINDS: Widget["kind"][] = ["kpi", "bar", "line", "table"];

interface IntentButtonProps {
  label: string;
  onAsk: (question: string) => void;
  question: string;
}

function IntentButton({ label, onAsk, question }: IntentButtonProps) {
  const select = useCallback(() => onAsk(question), [onAsk, question]);

  return (
    <button
      className="rounded-full border border-foreground/15 px-3 py-1 text-muted-foreground text-xs hover:text-foreground"
      onClick={select}
      type="button"
    >
      {label}
    </button>
  );
}

export function Era4Runtime() {
  const [question, setQuestion] = useState(
    "Is AI taking junior developer jobs?"
  );
  const [view, setView] = useState<View>("idle");
  const [specText, setSpecText] = useState("");
  const [spec, setSpec] = useState<RenderSpec | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTicker = useCallback(() => {
    if (timer.current !== null) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  const ask = useCallback(
    (q: string) => {
      stopTicker();
      const { spec: result } = generateDashboard(q);
      const json = JSON.stringify(result, null, 2);
      const reduce =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setSpec(result);
      if (reduce) {
        setSpecText(json);
        setView("rendered");
        return;
      }
      setView("compiling");
      setSpecText("");
      let i = 0;
      timer.current = setInterval(() => {
        i += 24;
        setSpecText(json.slice(0, i));
        if (i >= json.length) {
          stopTicker();
          setView("rendered");
        }
      }, CHAR_MS);
    },
    [stopTicker]
  );

  const askFromIntent = useCallback(
    (q: string) => {
      setQuestion(q);
      ask(q);
    },
    [ask]
  );

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      ask(question);
    },
    [ask, question]
  );

  const handleQuestionChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setQuestion(event.target.value);
    },
    []
  );

  useEffect(() => stopTicker, [stopTicker]);

  const usedKinds = new Set(spec?.widgets.map((w) => w.kind));

  return (
    <>
      <div className="rounded-xl border border-foreground/10 p-4 sm:p-6">
        <form className="flex gap-2" onSubmit={handleSubmit}>
          <input
            className="flex-1 rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm"
            onChange={handleQuestionChange}
            value={question}
          />
          <button
            className="rounded-md bg-foreground px-4 py-2 text-background text-sm"
            type="submit"
          >
            Ask
          </button>
        </form>

        <div className="mt-3 flex flex-wrap gap-2">
          {INTENTS.map((intent) => (
            <IntentButton
              key={intent.id}
              label={intent.label}
              onAsk={askFromIntent}
              question={intent.question}
            />
          ))}
        </div>

        {/* The grammar, always on screen: the model picks from these four and
            may not invent a fifth. Kinds the current spec used are lit. */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] text-muted-foreground">
            catalog
          </span>
          {WIDGET_KINDS.map((kind) => (
            <span
              className={cn(
                "rounded border px-2 py-0.5 font-mono text-[11px]",
                usedKinds.has(kind)
                  ? "border-ht-cyan-500/40 bg-ht-cyan-500/10 text-foreground"
                  : "border-foreground/10 text-muted-foreground/60"
              )}
              key={kind}
            >
              {kind}
            </span>
          ))}
          <span className="text-muted-foreground/60 text-xs">
            — the model may only use these four
          </span>
        </div>

        {spec === null ? null : (
          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            {/* Column stretches to the rendered pane beside it: a short code
                block next to a tall dashboard reads as an afterthought, and
                wrapping beats a horizontal scrollbar nobody will drag on a
                projector. */}
            <div className="flex flex-col">
              <p className="mb-2 font-mono text-[11px] text-muted-foreground">
                the model emits
              </p>
              <pre className="min-h-80 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-foreground/10 bg-muted/40 p-4 font-mono text-[11px] leading-5">
                {specText}
                {view === "compiling" && (
                  <span className="animate-pulse">▋</span>
                )}
              </pre>
            </div>
            <div>
              <p className="mb-2 font-mono text-[11px] text-muted-foreground">
                the page compiles
              </p>
              <div className="min-h-80 rounded-lg border border-foreground/10 p-4">
                {view === "rendered" ? (
                  <div className="fade-in animate-in duration-300">
                    <DashboardRenderer spec={spec} />
                  </div>
                ) : (
                  <p className="font-mono text-[11px] text-muted-foreground">
                    compiling…
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {view === "rendered" && (
          <p className="mt-4 text-foreground/55 text-sm italic">
            That interface didn&apos;t exist until you asked. Nothing here was
            pre-built — the question compiled it, and the next question will
            throw it away.
          </p>
        )}

        {view === "idle" && (
          <p className="mt-5 text-muted-foreground text-sm">
            Ask a question — nothing here is pre-built; the UI is compiled from
            what you asked. The numbers are real and cited: German labour-market
            data, 2024–2026.
          </p>
        )}
      </div>
      {/* Colocated with the dashboard it explains: the fold is about this
          demo's mechanism, not the era's argument. */}
      <Expandable label="Did you know? There's no component behind that dashboard.">
        <p>
          The dashboard is json-render underneath: the model emits a spec, the
          page compiles it. No route, no component — the interface is a runtime
          value, and the durable artifact is one file, the schema that says what
          a spec may contain: four widget kinds and a source field. Notice what
          that makes the job. You don&apos;t review the UI, you review the
          grammar it has to be expressible in — and the rule above it, that if a
          figure can&apos;t be cited, it doesn&apos;t ship. The same work as
          writing the rules an agent&apos;s loop must satisfy, one surface
          further out.
        </p>
      </Expandable>
    </>
  );
}

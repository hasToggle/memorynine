"use client";

import { useCallback, useState } from "react";
import {
  type ClipPhase,
  clipTransition,
  THREAD_ANSWER,
  THREAD_QUESTION,
} from "./extraction";
import { EDITOR_TOKENS } from "./highlight/tokens.generated";

/** VS Code Dark+, held deliberately outside the page's theme. */
const EDITOR_BG = "#1e1e1e";
const TABSTRIP_BG = "#252526";
const EDITOR_FG = "#d4d4d4";
const EDITOR_DIM = "#858585";
const GUTTER_FG = "#6e7681";
const RULE = "#2b2b2b";

/**
 * The generated token table never reorders, so identity is assigned once here
 * rather than leaning on the render-time index.
 */
const EDITOR_LINES = EDITOR_TOKENS.map((tokens, lineIndex) => ({
  id: `line-${lineIndex}`,
  tokens: tokens.map((token, tokenIndex) => ({
    ...token,
    id: `token-${lineIndex}-${tokenIndex}`,
  })),
}));

const GUTTER_NUMBERS = EDITOR_TOKENS.map((_, index) => index + 1);

const PLACEHOLDER: Record<"copied" | "idle", string> = {
  copied: "// the answer is on your clipboard. Bring it over yourself.",
  idle: "// empty. The knowledge lives in another window.",
};

export function Era2Extraction() {
  const [phase, setPhase] = useState<ClipPhase>("idle");
  const pasted = phase === "pasted";
  const gutter = pasted ? GUTTER_NUMBERS : [1];

  const copy = useCallback(
    () => setPhase((p) => clipTransition(p, "copy")),
    []
  );
  const paste = useCallback(
    () => setPhase((p) => clipTransition(p, "paste")),
    []
  );
  const reset = useCallback(() => setPhase("idle"), []);

  return (
    <div className="mb-6 space-y-5">
      {/* The browser, where the answer lives. */}
      <div className="overflow-hidden rounded-xl border border-foreground/10 bg-muted/40">
        <div className="flex items-center gap-2 border-foreground/10 border-b px-3 py-2">
          <span className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
          </span>
          <span className="rounded bg-background px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
            chat.openai.com · 2022
          </span>
        </div>
        <div className="space-y-3 p-4 text-xs">
          <div className="ml-auto w-fit max-w-[80%] rounded-lg bg-ht-cyan-600/10 px-3 py-2">
            {THREAD_QUESTION}
          </div>
          <div className="w-fit max-w-[80%] rounded-lg border border-foreground/10 bg-background p-3">
            {/* Uncoloured on purpose: a transcript, not a workbench. */}
            <pre className="font-mono leading-5">
              {THREAD_ANSWER.join("\n")}
            </pre>
            <button
              className="mt-2 rounded border border-foreground/15 px-2 py-1 font-mono text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40"
              disabled={phase !== "idle"}
              onClick={copy}
              type="button"
            >
              {phase === "idle" ? "Copy" : "Copied ✓"}
            </button>
          </div>
        </div>
      </div>

      {/* Your editor, a world away. The gap between the two is the point. */}
      <div
        className="overflow-hidden rounded-xl border border-foreground/10"
        style={{ backgroundColor: EDITOR_BG }}
      >
        <div
          className="flex items-stretch justify-between font-mono text-[11px]"
          style={{ backgroundColor: TABSTRIP_BG }}
        >
          {/* The active tab carries the editor's own fill, so it merges with
              the code below it — the same grammar Era I's prompt tabs speak. */}
          <span
            className="flex items-center gap-2 px-3 py-2"
            style={{ backgroundColor: EDITOR_BG, color: EDITOR_FG }}
          >
            <span
              aria-hidden="true"
              className="size-2 rounded-sm"
              style={{ backgroundColor: "#e5c07b" }}
            />
            checkout.js
          </span>
          <span
            className="flex items-center gap-3 px-3"
            style={{ color: EDITOR_DIM }}
          >
            your editor
            <button
              className="rounded border px-2 py-0.5 disabled:opacity-40"
              disabled={phase !== "copied"}
              onClick={paste}
              style={{ borderColor: "#3c3c3c", color: EDITOR_FG }}
              type="button"
            >
              Paste
            </button>
          </span>
        </div>

        <div className="flex font-mono text-[13px] leading-6">
          <div
            aria-hidden="true"
            className="select-none border-r px-3 py-3 text-right"
            style={{ borderColor: RULE, color: GUTTER_FG }}
          >
            {gutter.map((n) => (
              <div key={n}>{n}</div>
            ))}
          </div>
          {/* `whitespace-pre` is load-bearing twice over: these are divs, not a
              <pre>, so without it HTML collapses the leading indentation off
              every nested line, and long lines wrap and desync the gutter from
              the code beside it. With it, overflow-x scrolls — like an editor. */}
          <div
            className="flex-1 overflow-x-auto whitespace-pre px-3 py-3"
            style={{ color: EDITOR_FG }}
          >
            {pasted ? (
              EDITOR_LINES.map((line) => (
                <div key={line.id}>
                  {line.tokens.length === 0
                    ? " "
                    : line.tokens.map((token) => (
                        <span key={token.id} style={{ color: token.c }}>
                          {token.t}
                        </span>
                      ))}
                </div>
              ))
            ) : (
              <div className="italic" style={{ color: EDITOR_DIM }}>
                {phase === "copied" ? PLACEHOLDER.copied : PLACEHOLDER.idle}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Outside both fictions: the verdict, and the only control neither
          application would have. */}
      <div className="flex items-start gap-4">
        {pasted ? (
          <p className="max-w-2xl text-foreground/55 text-sm italic">
            You were the clipboard. Every answer crossed between those two
            worlds by hand.
          </p>
        ) : null}
        <button
          className="ml-auto shrink-0 rounded border border-foreground/15 px-2 py-1 font-mono text-muted-foreground text-xs hover:text-foreground"
          onClick={reset}
          type="button"
        >
          ↺ reset
        </button>
      </div>
    </div>
  );
}

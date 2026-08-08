"use client";

import { useCallback, useState } from "react";
import type { FilePhase } from "./highlight/index";
import { FILE_TOKENS } from "./highlight/tokens.generated";
import { SUGGESTION } from "./suggestions";

/** VS Code Dark+, held deliberately outside the page's theme. */
const EDITOR_BG = "#1e1e1e";
const TABSTRIP_BG = "#252526";
const EDITOR_FG = "#d4d4d4";
const EDITOR_DIM = "#858585";
const GUTTER_FG = "#6e7681";
const RULE = "#2b2b2b";
const BAD_BG = "#5a1d1d";
/** VS Code's diff-added tint. Deliberately the opposite of BAD_BG, so the two
 *  beats read as a pair rather than as two arbitrary colours. */
const ADDED_BG = "#1d3a1d";

/**
 * The demo grows as the presenter drives it — Apply adds four lines and a
 * banner, Fix adds two more — and every one of those shoved the rest of the
 * page down. So the console reserves its tallest state from the first frame.
 *
 * Derived from the token data rather than guessed, so new copy cannot quietly
 * outgrow the reservation: the initial phase also renders a ghost row, which is
 * why it is counted here and not just in `rowCount`.
 */
const MAX_ROWS = Math.max(
  ...(Object.keys(FILE_TOKENS) as FilePhase[]).map(
    (phase) => FILE_TOKENS[phase].length + (phase === "initial" ? 1 : 0)
  )
);
/** `MAX_ROWS` at leading-6, plus the code area's py-3 top and bottom. */
const CODE_MIN_HEIGHT = `calc(${MAX_ROWS} * 1.5rem + 1.5rem)`;
/** Tall enough for the amber banner, which is the taller of the two. */
const BANNER_MIN_HEIGHT = "min-h-13";

export function Era2Companion() {
  const [phase, setPhase] = useState<FilePhase>("initial");
  const [ghostAccepted, setGhostAccepted] = useState(false);

  const apply = useCallback(() => setPhase("applied"), []);
  const fix = useCallback(() => setPhase("resolved"), []);
  const acceptGhost = useCallback(() => setGhostAccepted(true), []);
  const reset = useCallback(() => {
    setPhase("initial");
    setGhostAccepted(false);
  }, []);

  const lines = FILE_TOKENS[phase];
  const ghostShowing = phase === "initial";
  const rowCount = lines.length + (ghostShowing ? 1 : 0);
  const lineText = (tokens: (typeof lines)[number]) =>
    tokens.map((t) => t.t).join("");
  // The beat: the model wrote a call to something this file never imports.
  // Found by scanning the tokens, so it stays true if the copy is re-tokenised.
  const badIndex =
    phase === "applied"
      ? lines.findIndex((tokens) =>
          lineText(tokens).includes(SUGGESTION.missingRef)
        )
      : -1;
  // Fixing prepends the import *and* a blank line, so every line the room was
  // looking at shifts down two. Marking the line that arrived gives the eye
  // somewhere to land instead of re-reading the whole file.
  const addedIndex =
    phase === "resolved"
      ? lines.findIndex((tokens) => lineText(tokens) === SUGGESTION.fixLine)
      : -1;
  // Both are -1 unless their phase is live, so at most one can ever match.
  const rowBackground = (lineIndex: number) => {
    if (lineIndex === badIndex) {
      return { backgroundColor: BAD_BG };
    }
    if (lineIndex === addedIndex) {
      return { backgroundColor: ADDED_BG };
    }
  };

  // Identity is assigned here rather than in the JSX: a phase swaps the whole
  // token table at once, so position is the only identity these rows have.
  const gutter = Array.from({ length: rowCount }, (_, i) => i + 1);
  const rows = lines.map((tokens, lineIndex) => ({
    background: rowBackground(lineIndex),
    id: `line-${lineIndex}`,
    tokens: tokens.map((token, tokenIndex) => ({
      ...token,
      id: `token-${lineIndex}-${tokenIndex}`,
    })),
  }));

  return (
    <div className="space-y-3">
      <div
        className="overflow-hidden rounded-xl border border-foreground/10"
        style={{ backgroundColor: EDITOR_BG }}
      >
        {/* One window. The chat is docked inside it — that is the Cursor moment,
            and it is what distinguishes this demo from the two-window one above. */}
        <div className="grid md:grid-cols-[1.4fr_1fr]">
          <div>
            <div
              className="flex items-stretch font-mono text-[11px]"
              style={{ backgroundColor: TABSTRIP_BG }}
            >
              {/* The active tab takes the code area's fill and merges downward. */}
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
              {/* `whitespace-pre` keeps the indentation HTML would otherwise
                collapse, and stops a long line wrapping out of step with the
                gutter beside it. */}
              <div
                className="flex-1 overflow-x-auto whitespace-pre px-3 py-3"
                style={{ color: EDITOR_FG, minHeight: CODE_MIN_HEIGHT }}
              >
                {rows.map((row) => (
                  <div key={row.id} style={row.background}>
                    {row.tokens.length === 0
                      ? " "
                      : row.tokens.map((token) => (
                          <span key={token.id} style={{ color: token.c }}>
                            {token.t}
                          </span>
                        ))}
                  </div>
                ))}
                {/* `hover:brightness-125` rather than a `hover:text-*` class: the
                  colour is an inline style, and inline styles beat classes, so
                  a hover colour utility would never appear. A filter is not
                  competing with the style attribute, so it does. */}
                {ghostShowing ? (
                  <button
                    className="block w-full text-left italic hover:brightness-125"
                    onClick={acceptGhost}
                    style={{ color: EDITOR_DIM }}
                    type="button"
                  >
                    {ghostAccepted
                      ? "  // discount applied"
                      : "  // ghost: press to accept →"}
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          {/* The chat, docked as a side panel rather than a second region. */}
          <div className="border-l" style={{ borderColor: RULE }}>
            <div
              className="border-b px-3 py-2 font-mono text-[11px] uppercase tracking-wide"
              style={{
                backgroundColor: TABSTRIP_BG,
                borderColor: RULE,
                color: EDITOR_DIM,
              }}
            >
              Chat
            </div>
            <div className="p-3 text-xs" style={{ color: "#ccc" }}>
              <div
                className="mb-2 rounded px-2 py-1.5"
                style={{ backgroundColor: "#2d2d30" }}
              >
                add validation so an unknown code doesn&apos;t crash
              </div>
              {/* Uncoloured on purpose: this is a proposal, not yet your code —
                which is the whole point the demo is about to make. */}
              <div
                className="rounded border p-2 font-mono leading-5"
                style={{ backgroundColor: EDITOR_BG, borderColor: "#3c3c3c" }}
              >
                {SUGGESTION.code.map((l) => (
                  <div key={l}>{l}</div>
                ))}
                <div className="mt-2 flex gap-2">
                  {/* Dark label on the cyan, not white: ht-cyan-600 is #00bbd2,
                    and white on it measures 2.32:1 — confident-looking and well
                    under AA. Dark ink gets 7.09:1 on the same fill.
                    The disabled state sets its own pair rather than fading the
                    whole button, because element opacity composites text *and*
                    fill toward the panel and crushes the ratio between them to
                    2.56:1. An explicit muted pair holds 6.31:1. */}
                  <button
                    className="rounded bg-ht-cyan-600 px-2 py-1 text-[#0f2327] text-[11px] disabled:bg-[#2a3c3f] disabled:text-[#a8c3c7]"
                    disabled={phase !== "initial"}
                    onClick={apply}
                    type="button"
                  >
                    Apply
                  </button>
                </div>
              </div>
              <p className="mt-2 italic" style={{ color: EDITOR_DIM }}>
                It can&apos;t run it. It can&apos;t see the rest of your repo.
                You decide if it&apos;s right — and you move it.
              </p>
            </div>
          </div>
        </div>

        {/* The banner slot is always here, so a verdict arriving does not shove
          the page. `min-h` rather than a fixed height: at narrow widths the
          amber line wraps, and growing is better than clipping.
          Its top rule is what the gutter and the panel divider terminate into —
          without it they stop at the grid's edge and dangle in the reserved
          space below. An editor's gutter ends at a bar, not in mid-air. */}
        <div
          className={`flex border-t ${BANNER_MIN_HEIGHT}`}
          style={{ borderColor: RULE }}
        >
          {phase === "applied" && (
            <div className="flex flex-1 items-center justify-between gap-3 bg-amber-50 px-4 py-2 text-amber-900 text-sm dark:bg-amber-950/40 dark:text-amber-200">
              <span>
                Applied — but <code>{SUGGESTION.missingRef}</code> isn&apos;t
                imported in this file. It only saw the selection, not the
                system.
              </span>
              <button
                className="shrink-0 rounded-md bg-amber-600 px-3 py-1 text-white"
                onClick={fix}
                type="button"
              >
                Fix it yourself
              </button>
            </div>
          )}
          {phase === "resolved" && (
            <div className="flex flex-1 items-center bg-emerald-50 px-4 py-2 text-emerald-800 text-sm dark:bg-emerald-950/40 dark:text-emerald-200">
              You added the import. You were the integration layer — every
              accept, file by file.
            </div>
          )}
        </div>
      </div>

      {/* Outside the window, in the page's own idiom: resetting the demo is not
          something the editor or the chat would offer, and sitting beside Apply
          it read as "clear the prompt" rather than "start over". Same control as
          the demo above, so one gesture means one thing across the era. */}
      <div className="flex">
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

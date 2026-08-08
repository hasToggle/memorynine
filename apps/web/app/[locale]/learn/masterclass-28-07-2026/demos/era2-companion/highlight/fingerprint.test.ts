import { describe, expect, test } from "bun:test";
import { fingerprintText } from "../../highlight";
import { applySuggestion, resolveMismatch } from "../apply";
import { THREAD_ANSWER } from "../extraction";
import { INITIAL_FILE, SUGGESTION } from "../suggestions";
import {
  EDITOR_TOKENS,
  FILE_FINGERPRINT,
  FILE_TOKENS,
  SOURCE_FINGERPRINT,
} from "./tokens.generated";

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

describe("era2 editor tokens", () => {
  test("the committed tokens were generated from the current answer", () => {
    // If this fails, THREAD_ANSWER changed and the tokens are stale.
    // Fix: cd apps/web && bun run gen:era2-highlight
    expect(fingerprintText([...THREAD_ANSWER])).toBe(SOURCE_FINGERPRINT);
  });

  test("there is one token line per source line", () => {
    expect(EDITOR_TOKENS.length).toBe(THREAD_ANSWER.length);
  });

  test("each line's tokens reconstruct that line exactly", () => {
    // The gutter numbers lines and the code column renders them, so a token
    // list that does not rebuild its own line would silently misalign the two.
    EDITOR_TOKENS.forEach((line, index) => {
      expect(line.map((t) => t.t).join("")).toBe(THREAD_ANSWER[index]);
    });
  });

  test("every token carries a colour", () => {
    for (const line of EDITOR_TOKENS) {
      for (const token of line) {
        expect(token.c).toMatch(HEX_COLOR);
      }
    }
  });

  test("no line is empty — the gutter's row heights depend on it", () => {
    for (const line of EDITOR_TOKENS) {
      expect(line.length).toBeGreaterThan(0);
    }
  });
});

describe("era2 companion file tokens", () => {
  const applied = applySuggestion(INITIAL_FILE, SUGGESTION).file;
  const resolved = resolveMismatch(applied, SUGGESTION);
  const states = [
    ["initial", INITIAL_FILE.lines],
    ["applied", applied.lines],
    ["resolved", resolved.lines],
  ] as const;

  test("the committed tokens describe what the demo actually produces", () => {
    // Hashes the rendered states, so this fails if INITIAL_FILE, SUGGESTION,
    // applySuggestion or resolveMismatch changed.
    // Fix: cd apps/web && bun run gen:era2-highlight
    expect(fingerprintText(states.map(([, lines]) => lines.join("\n")))).toBe(
      FILE_FINGERPRINT
    );
  });

  test("every phase has one token line per source line", () => {
    for (const [phase, lines] of states) {
      expect(FILE_TOKENS[phase].length).toBe(lines.length);
    }
  });

  test("each line's tokens reconstruct that line exactly", () => {
    // The gutter numbers lines and the code column renders them, so a token
    // list that does not rebuild its own line would misalign the two.
    for (const [phase, lines] of states) {
      FILE_TOKENS[phase].forEach((tokens, index) => {
        expect(tokens.map((t) => t.t).join("")).toBe(lines[index]);
      });
    }
  });

  test("a zero-token line must still be rendered as a space — index.tsx depends on it", () => {
    // A <div> with no inline content forms no line box and collapses to zero
    // height, while its gutter digit is a full line tall. Every row below would
    // then be off by one. index.tsx guards this with `tokens.length === 0 ? " "`.
    // This test exists so deleting that guard is a deliberate act, not a tidy-up.
    const emptyLines = FILE_TOKENS.resolved.filter(
      (tokens) => tokens.length === 0
    );
    expect(emptyLines.length).toBeGreaterThan(0);
    for (const tokens of emptyLines) {
      expect(tokens.map((t) => t.t).join("")).toBe("");
    }
  });

  test("every token carries a colour", () => {
    for (const [phase] of states) {
      for (const tokens of FILE_TOKENS[phase]) {
        for (const token of tokens) {
          expect(token.c).toMatch(HEX_COLOR);
        }
      }
    }
  });

  test("the applied state still contains the reference that is missing", () => {
    // The red-line beat depends on finding this token; if the suggestion copy
    // changes so the reference vanishes, the highlight silently stops.
    const hit = FILE_TOKENS.applied.some((tokens) =>
      tokens
        .map((t) => t.t)
        .join("")
        .includes(SUGGESTION.missingRef)
    );
    expect(hit).toBe(true);
  });
});

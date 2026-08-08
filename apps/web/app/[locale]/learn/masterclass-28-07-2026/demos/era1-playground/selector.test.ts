import { describe, expect, test } from "bun:test";
import type { PromptSeed } from "./completions";
import { PROMPTS } from "./completions";
import { bandFor, selectCompletion } from "./selector";

/** Narrows the lookup so the assertions read against a concrete seed. */
function seed(id: string): PromptSeed {
  const found = PROMPTS.find((p) => p.id === id);
  if (!found) {
    throw new Error(`No prompt seed named "${id}"`);
  }
  return found;
}

describe("era1 selector", () => {
  test("bandFor splits the temperature range", () => {
    expect(bandFor(0.1)).toBe("low");
    expect(bandFor(0.7)).toBe("mid");
    expect(bandFor(1.3)).toBe("high");
  });

  test("selectCompletion returns the band-specific continuation", () => {
    const fn = seed("reverse-fn");
    expect(selectCompletion("reverse-fn", 0.1)).toBe(fn.continuations.low);
    expect(selectCompletion("reverse-fn", 1.3)).toBe(fn.continuations.high);
  });

  test("the question prompt never answers — it continues into more questions", () => {
    const q = PROMPTS.find((p) => p.id === "how-do-i");
    expect(q?.isQuestion).toBe(true);
    // Every continuation keeps asking rather than answering.
    for (const band of ["low", "mid", "high"] as const) {
      expect(q?.continuations[band]).toContain("?");
    }
  });

  test("unknown id falls back to an empty string (never throws)", () => {
    expect(selectCompletion("nope", 0.5)).toBe("");
  });

  test("instruct mode answers instead of continuing", () => {
    const answer = selectCompletion("how-do-i", 0.7, "instruct");
    expect(answer).not.toContain("how do I");
    expect(answer).toContain("reverse()");
  });

  test("instruct mode has its own dice — the band still changes the answer", () => {
    expect(selectCompletion("reverse-fn", 0.1, "instruct")).not.toBe(
      selectCompletion("reverse-fn", 1.3, "instruct")
    );
    expect(selectCompletion("how-do-i", 0.1, "instruct")).not.toBe(
      selectCompletion("how-do-i", 1.3, "instruct")
    );
  });

  test("every instruct answer answers, at every temperature", () => {
    for (const band of [0.1, 0.7, 1.4]) {
      const answer = selectCompletion("how-do-i", band, "instruct");
      expect(answer).not.toContain("how do I");
      expect(answer).toContain("slice()");
    }
  });

  test("mode defaults to base", () => {
    const fn = seed("reverse-fn");
    expect(selectCompletion("reverse-fn", 0.1)).toBe(fn.continuations.low);
  });
});

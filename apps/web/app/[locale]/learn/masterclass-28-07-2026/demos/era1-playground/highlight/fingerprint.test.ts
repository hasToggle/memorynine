import { describe, expect, test } from "bun:test";
import { PROMPTS } from "../completions";
import { fingerprintSources } from "./index";
import {
  COMPLETION_TOKENS,
  PREFIX_TOKENS,
  SOURCE_FINGERPRINT,
} from "./tokens.generated";

describe("generated highlight tokens", () => {
  test("the committed tokens were generated from the current copy", () => {
    // If this fails, a prompt or completion changed and the tokens are stale.
    // Fix: cd apps/web && bun run gen:era1-highlight
    expect(fingerprintSources(PROMPTS)).toBe(SOURCE_FINGERPRINT);
  });

  test("every string the window can render has tokens", () => {
    for (const prompt of PROMPTS) {
      expect(PREFIX_TOKENS[prompt.id]).toBeDefined();
      for (const band of ["low", "mid", "high"]) {
        expect(COMPLETION_TOKENS[`${prompt.id}:base:${band}`]).toBeDefined();
        expect(
          COMPLETION_TOKENS[`${prompt.id}:instruct:${band}`]
        ).toBeDefined();
      }
    }
  });

  test("tokens reconstruct their source exactly — the character budget depends on it", () => {
    for (const prompt of PROMPTS) {
      expect(PREFIX_TOKENS[prompt.id].map((t) => t.t).join("")).toBe(
        prompt.prefix
      );
      for (const band of ["low", "mid", "high"] as const) {
        expect(
          COMPLETION_TOKENS[`${prompt.id}:base:${band}`]
            .map((t) => t.t)
            .join("")
        ).toBe(prompt.continuations[band]);
        expect(
          COMPLETION_TOKENS[`${prompt.id}:instruct:${band}`]
            .map((t) => t.t)
            .join("")
        ).toBe(prompt.instructAnswers[band]);
      }
    }
  });
});

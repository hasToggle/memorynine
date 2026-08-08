import { describe, expect, test } from "bun:test";
import { applySuggestion, resolveMismatch } from "./apply";
import { INITIAL_FILE, SUGGESTION } from "./suggestions";

describe("era2 apply", () => {
  test("applying inserts the suggested block after the target line", () => {
    const { file } = applySuggestion(INITIAL_FILE, SUGGESTION);
    expect(file.lines.length).toBe(
      INITIAL_FILE.lines.length + SUGGESTION.code.length
    );
    expect(file.lines[SUGGESTION.insertAfterLine + 1]).toBe(SUGGESTION.code[0]);
  });

  test("applying flags the mismatch because the block references a missing symbol", () => {
    const { hasMismatch, mismatchRef } = applySuggestion(
      INITIAL_FILE,
      SUGGESTION
    );
    expect(hasMismatch).toBe(true);
    expect(mismatchRef).toBe(SUGGESTION.missingRef);
    // The original file does not define the referenced symbol.
    expect(INITIAL_FILE.lines.join("\n")).not.toContain(SUGGESTION.missingRef);
  });

  test("resolving the mismatch adds the missing definition", () => {
    const applied = applySuggestion(INITIAL_FILE, SUGGESTION).file;
    const fixed = resolveMismatch(applied, SUGGESTION);
    expect(fixed.lines.join("\n")).toContain(SUGGESTION.fixLine.trim());
  });

  test("applySuggestion does not mutate the input file", () => {
    const before = INITIAL_FILE.lines.length;
    applySuggestion(INITIAL_FILE, SUGGESTION);
    expect(INITIAL_FILE.lines.length).toBe(before);
  });
});

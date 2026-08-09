import { describe, expect, test } from "bun:test";
import { normalizeCitationId } from "../lib/citation";

describe("normalizeCitationId", () => {
  test("strips the sanitizer's DOM-clobbering prefix", () => {
    expect(normalizeCitationId("user-content-6a70f2dac615029be026bab7")).toBe(
      "6a70f2dac615029be026bab7"
    );
  });

  test("passes a bare id through untouched", () => {
    expect(normalizeCitationId("6a70f2dac615029be026bab7")).toBe(
      "6a70f2dac615029be026bab7"
    );
  });

  test("strips the prefix only at the start", () => {
    expect(normalizeCitationId("abc-user-content-def")).toBe(
      "abc-user-content-def"
    );
  });

  test("an absent id stays absent — it must render as broken, not vanish", () => {
    expect(normalizeCitationId(undefined)).toBeUndefined();
    expect(normalizeCitationId("")).toBeUndefined();
  });
});

import { describe, expect, test } from "bun:test";
import type { EveMessage } from "eve/react";
import { isDidNotRun } from "../app/(authenticated)/components/brain/search-summary";
import { collectCitables, isToolPart } from "../lib/eve-parts";

// Messages in the shape eve 0.84+ projects (checked against eve 0.91's
// EveMessage): a tool call is `{ type: "tool", name, state, output }`. The
// component used to match the AI SDK's `tool-<name>` / `dynamic-tool` parts,
// which no longer occur — so nothing resolved, and nothing threw.
const fact = {
  category: "preference",
  confidence: 0.9,
  id: "fact-1",
  text: "Prefers Thursday calls",
  validFrom: null,
};
const source = {
  capturedAt: null,
  capturedBy: "eric@example.com",
  excerpt: "Said Thursdays work best",
  id: "source-1",
  occurredAt: null,
  reviewed: false,
  subject: null,
  type: "note",
};

const searchCall = (output: unknown) =>
  ({
    callId: "call-1",
    kind: "tool",
    label: "Search knowledge",
    name: "search-knowledge",
    output,
    state: "completed",
    stepIndex: 0,
    type: "tool",
  }) as const;

const assistant = (parts: EveMessage["parts"]): EveMessage => ({
  id: "m-1",
  parts,
  role: "assistant",
});

describe("collectCitables", () => {
  test("collects facts and sources from a completed tool call", () => {
    const { facts, sources } = collectCitables([
      assistant([
        searchCall({
          type: "json",
          value: { facts: [fact], sources: [source] },
        }),
      ]),
    ]);
    expect(facts.get("fact-1")).toEqual(fact);
    expect(sources.get("source-1")).toEqual(source);
  });

  test("reads a bare, unenveloped tool output too", () => {
    const { facts } = collectCitables([
      assistant([searchCall({ facts: [fact] })]),
    ]);
    expect(facts.has("fact-1")).toBe(true);
  });

  test("ignores text and reasoning parts", () => {
    const { facts, sources } = collectCitables([
      assistant([
        { text: "It's Thursday [fact id=fact-1]", type: "text" },
        { text: "thinking", type: "reasoning" },
      ]),
    ]);
    expect(facts.size).toBe(0);
    expect(sources.size).toBe(0);
  });

  test("a call still streaming its input has nothing to collect yet", () => {
    const { facts } = collectCitables([
      assistant([
        {
          callId: "call-1",
          inputText: '{"query":"thurs',
          kind: "tool",
          label: "Search knowledge",
          name: "search-knowledge",
          state: "streaming",
          stepIndex: 0,
          type: "tool",
        },
      ]),
    ]);
    expect(facts.size).toBe(0);
  });
});

describe("isToolPart", () => {
  test("is true for eve's native tool part only", () => {
    expect(isToolPart(searchCall({}))).toBe(true);
    expect(isToolPart({ text: "hi", type: "text" })).toBe(false);
  });
});

describe("isDidNotRun", () => {
  // SearchSummary keys its "Couldn't search" notice on this. eve 0.84 renamed
  // the AI SDK's "output-error" to "failed"; missing it would show a failed
  // lookup as "Searching…" forever.
  test("is true for every call state that ended without an answer", () => {
    for (const state of ["failed", "rejected", "cancelled"]) {
      expect(isDidNotRun(state)).toBe(true);
    }
  });

  test("is false while running or once completed", () => {
    for (const state of [
      "streaming",
      "requested",
      "running",
      "approval",
      "blocked",
      "completed",
      undefined,
    ]) {
      expect(isDidNotRun(state)).toBe(false);
    }
  });
});

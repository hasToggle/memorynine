import type { EveMessage, EveMessagePart, EveToolPart } from "eve/react";
import type { CitedFact } from "../app/(authenticated)/components/brain/fact-citation";
import type { CitedSource } from "../app/(authenticated)/components/brain/source-citation";

// eve 0.84 replaced the AI SDK's message parts (`tool-<name>`, `dynamic-tool`)
// with native ones: every call is `{ type: "tool", name, state, … }`. Matching
// the old names finds nothing, so no citation resolves and no search shows
// up — and nothing failed loudly, because messages were cast `as never` at the
// boundary.
// Like before, any tool call counts, not just search-knowledge.
export const isToolPart = (part: EveMessagePart): part is EveToolPart =>
  part.type === "tool";

/**
 * eve delivers tool results in the AI SDK result envelope
 * `{ type: "json" | "error-text" | …, value }`, so the payload lives one
 * level down. Unwrap defensively — a bare payload passes through untouched.
 */
export const unwrapToolOutput = (
  output: unknown
): { errorText?: string; value?: unknown } => {
  if (output === null || typeof output !== "object") {
    return { value: output };
  }
  const { type, value } = output as { type?: unknown; value?: unknown };
  if (type === "error-text" || type === "error-json") {
    return {
      errorText: typeof value === "string" ? value : JSON.stringify(value),
    };
  }
  if (type === "json" || type === "text" || type === "content") {
    return { value };
  }
  return { value: output };
};

/**
 * Collect everything the agent has retrieved so far — confirmed facts and raw
 * sources. Citations resolve against tool output, never against the prose:
 * the model can only cite what the knowledge base actually handed it.
 */
const ingestToolOutput = (
  raw: unknown,
  facts: Map<string, CitedFact>,
  sources: Map<string, CitedSource>
) => {
  const output = unwrapToolOutput(raw).value as
    | { facts?: CitedFact[]; sources?: CitedSource[] }
    | undefined;
  for (const fact of output?.facts ?? []) {
    if (fact?.id) {
      facts.set(fact.id, fact);
    }
  }
  for (const source of output?.sources ?? []) {
    if (source?.id) {
      sources.set(source.id, source);
    }
  }
};

export const collectCitables = (
  messages: readonly Pick<EveMessage, "parts">[]
): { facts: Map<string, CitedFact>; sources: Map<string, CitedSource> } => {
  const facts = new Map<string, CitedFact>();
  const sources = new Map<string, CitedSource>();
  for (const message of messages) {
    for (const part of message.parts) {
      if (isToolPart(part)) {
        ingestToolOutput(part.output, facts, sources);
      }
    }
  }
  return { facts, sources };
};

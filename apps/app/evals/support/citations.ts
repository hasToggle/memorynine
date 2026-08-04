// Shared by every eval that has to compare cited fact ids against what
// search-knowledge actually returned. Extracted from citations.eval.ts so
// the six-plus evals that need this comparison (lookup, multi-hop,
// knowledge-update, and later the contradiction/adversarial evals) do not
// each carry their own copy of the same regex.
//
// Not named `*.eval.ts`, so eve's discovery (which walks `evals/` and
// collects only files ending in that suffix) never treats this as an eval
// file in its own right.

const FACT_TAG = /<fact\s+id="([^"]+)"/g;

export const citedIds = (reply: string | null): string[] =>
  [...(reply ?? "").matchAll(FACT_TAG)].map((match) => match[1] as string);

interface SearchOutput {
  facts?: { id: string; text: string }[];
}

/**
 * Every fact search-knowledge returned in a session, keyed by id, with the
 * fact text alongside it. `returnedIds` is the id-only projection of this;
 * evals that need to inspect *what* a cited fact actually says (abstention)
 * need the text too, so this is the base helper and `returnedIds` is built
 * on top of it rather than duplicating the tool-output walk.
 */
export const returnedFacts = (
  toolCalls: readonly { name: string; output?: unknown }[]
): Map<string, string> => {
  const facts = new Map<string, string>();
  for (const call of toolCalls) {
    for (const fact of (call.output as SearchOutput | undefined)?.facts ?? []) {
      facts.set(fact.id, fact.text);
    }
  }
  return facts;
};

export const returnedIds = (
  toolCalls: readonly { name: string; output?: unknown }[]
): Set<string> => new Set(returnedFacts(toolCalls).keys());

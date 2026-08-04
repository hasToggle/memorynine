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
  facts?: { id: string }[];
}

export const returnedIds = (
  toolCalls: readonly { name: string; output?: unknown }[]
): Set<string> => {
  const ids = new Set<string>();
  for (const call of toolCalls) {
    for (const fact of (call.output as SearchOutput | undefined)?.facts ?? []) {
      ids.add(fact.id);
    }
  }
  return ids;
};

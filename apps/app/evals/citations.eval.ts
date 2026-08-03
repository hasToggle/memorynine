import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";

// The property the whole citation mechanism rests on: the model may only cite
// facts the knowledge base actually returned. This is checkable deterministically
// — no judge needed — by comparing the ids in the prose against the ids in the
// tool output, which is exactly what the UI does when it resolves markers.

const FACT_TAG = /<fact\s+id="([^"]+)"/g;

const citedIds = (reply: string | null): string[] =>
  [...(reply ?? "").matchAll(FACT_TAG)].map((match) => match[1] as string);

interface SearchOutput {
  facts?: { id: string }[];
}

const returnedIds = (
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

export default defineEval({
  description:
    "Every fact id the agent cites was returned by a search in the same conversation.",
  async test(t) {
    const turn = await t.send(
      "Was weißt du über unsere Kunden und ihre Präferenzen?"
    );

    t.succeeded();
    t.calledTool("search-knowledge");

    const returned = returnedIds(turn.toolCalls);
    const cited = citedIds(t.reply);

    // A hallucinated id is the failure mode that makes citations worthless:
    // it looks exactly like a real one to a reader.
    t.check(
      cited,
      satisfies(
        (ids: string[]) => ids.every((id) => returned.has(id)),
        "every cited fact id was returned by search-knowledge"
      )
    );

    // An answer drawn from retrieved facts that cites none of them is the
    // other half of the same problem.
    t.check(
      { cited: cited.length, returned: returned.size },
      satisfies(
        (counts: { cited: number; returned: number }) =>
          counts.returned === 0 || counts.cited > 0,
        "an answer built on retrieved facts carries at least one citation"
      )
    );
  },
});

import { PLANTED } from "@repo/knowledge/fixtures";
import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";
import { citedIds, returnedIds } from "./support/citations";

// PLANTED.contradictions[0] is a two-fact pair about the same person's
// meeting-time preference, planted from two different sources at two
// different dates, neither one ever marked superseded — the store considers
// both "currently valid" at once:
//
//   [30] (2025-10-05) "Martin Kowalski bevorzugt Termine am Vormittag, da er
//        nachmittags meist im Lager unterwegs ist." — prefers mornings,
//        unavailable in the afternoon.
//   [31] (2025-11-12) "Martin Kowalski will Meetings grundsätzlich nur
//        nachmittags; vormittags ist er laut eigener Aussage nicht
//        erreichbar." — prefers afternoons only, flatly incompatible with
//        [30].
//
// This is exactly the case the rest of the system cannot catch:
// buildConsolidationPrompt only asks the nightly job for merges that reduce
// redundancy, and these two facts are not redundant — they disagree. Nothing
// upstream of the agent resolves or flags the clash, so instructions.md's
// rule is the last line of defence: "When two facts genuinely conflict, show
// both and say they conflict. Never quietly pick a winner." A confident
// single answer here looks exactly like a correct one to a reader who never
// sees the other side.
export default defineEval({
  description:
    "Two currently-valid facts that disagree on Martin Kowalski's meeting-time preference are both surfaced and named as a conflict, never silently resolved.",
  async test(t) {
    const [first, second] = PLANTED.contradictions[0];
    const firstId = first._id.toHexString();
    const secondId = second._id.toHexString();

    const turn = await t.send("Wann trifft sich Martin Kowalski am liebsten?");

    t.succeeded();
    t.calledTool("search-knowledge");

    const returned = returnedIds(turn.toolCalls);

    // Layer 1 (retrieval): the agent can only show a conflict it was handed.
    // If search-knowledge dropped one side of the pair, no amount of agent
    // discipline could have recovered it — that is a retrieval-layer
    // finding, distinct from whether the agent obeyed the conflict rule.
    t.check(
      returned,
      satisfies(
        (ids: Set<string>) => ids.has(firstId) && ids.has(secondId),
        `search-knowledge returned both contradicting facts ${firstId} and ${secondId}`
      )
    );

    // Layer 2 (citation): given both facts were available, did the agent
    // actually cite both rather than quietly picking a side? This can fail
    // even when layer 1 passes (both retrieved, only one cited) — that gap
    // is what separates an agent failure from a retrieval failure, and it is
    // the property instructions.md's conflict rule is actually about.
    const cited = citedIds(t.reply);
    t.check(
      cited,
      satisfies(
        (ids: string[]) => ids.includes(firstId) && ids.includes(secondId),
        `cites both sides of the contradiction ${firstId} and ${secondId}`
      )
    );

    // Neither set check above can express how the answer frames the two
    // ids: "he prefers mornings, though one source says afternoons instead —
    // these disagree" and "he is flexible, mornings or afternoons both work"
    // would pass both checks above identically while being opposite in
    // quality — one surfaces the disagreement, the other launders it into a
    // single invented claim neither fact actually states. That framing
    // question has no set-operation form, so it is left entirely to the
    // judge rather than faked with another id comparison.
    t.judge.autoevals.closedQA(
      "The knowledge base holds two conflicting statements about when Martin Kowalski prefers to meet: one source says he prefers morning appointments and is unavailable in the afternoon; another source says he wants meetings only in the afternoon and is unreachable in the morning. Does the response clearly state BOTH preferences and explicitly mark them as conflicting, disputed, or contradictory (for example by naming both sources or dates and saying they disagree)? It FAILS if the response gives only one of the two preferences as though it were the settled answer, with no mention that another source says otherwise. It also FAILS if it blends the two into a single averaged or vague claim, such as saying he is flexible or available both mornings and afternoons, presented as one harmonious fact with no indication the sources disagree. It PASSES only if both preferences are stated and the response makes clear they conflict. The response may be in German."
    );
  },
});

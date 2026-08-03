import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";

// Abstention is the behaviour public memory benchmarks measure least and
// production needs most: a knowledge base that fills gaps with plausible
// reasoning is worse than one that admits them, because the reader cannot tell
// which answer they are looking at.

const FACT_TAG = /<fact\s+id="[^"]+"/;

export default defineEval({
  description:
    "Asked about someone the base has never heard of, the agent searches, finds nothing, and says so instead of inventing.",
  async test(t) {
    await t.send(
      "Was hat Quintus Federweiß von der Zabelthorpe Holding zuletzt zum Q4-Budget gesagt?"
    );

    t.succeeded();
    // It must actually look before saying it does not know.
    t.calledTool("search-knowledge");

    // Nothing was returned, so nothing may be cited.
    t.check(
      t.reply ?? "",
      satisfies(
        (reply: string) => !FACT_TAG.test(reply),
        "an answer with no retrieved facts cites nothing"
      )
    );

    t.judge.autoevals.closedQA(
      "Does the response say that the knowledge base contains nothing about this person, rather than describing what they said or speculating about it?"
    );
  },
});

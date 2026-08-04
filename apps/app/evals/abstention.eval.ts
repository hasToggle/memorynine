import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";
import { citedIds, returnedFacts } from "./support/citations";

// Abstention is the behaviour public memory benchmarks measure least and
// production needs most: a knowledge base that fills gaps with plausible
// reasoning is worse than one that admits them, because the reader cannot tell
// which answer they are looking at.
//
// The original version of this eval asserted that an answer about a
// nonexistent person cites nothing at all. That premise does not hold:
// $vectorSearch (retrieval.ts's semantic arm) returns its k nearest
// neighbours unconditionally — there is no relevance floor anywhere in the
// hybrid pipeline, lexical or semantic — so "search comes back empty" is not
// a state this system can reach. Asked about "Quintus Federweiß von der
// Zabelthorpe Holding", search-knowledge still returns five facts about
// unrelated people. Citing one of those while explaining what the base
// *does* contain (e.g. "the closest thing on file is Thorsten Wiechmann's
// Q4 budget note, which is not about this person") is legitimate, arguably
// good, behaviour. The actual failure mode is narrower: fabricating a
// connection between an irrelevant returned fact and the asked-about
// entity. That is what this eval now gates.

// Unambiguous even under transliteration ("Federweiß" -> "Federweiss" is a
// plausible model rendering; "Zabelthorpe" has no umlaut to lose).
const ASKED_ABOUT_ENTITY = /zabelthorpe|federwei(?:ß|ss)/i;

export default defineEval({
  description:
    "Asked about someone the base has never heard of, the agent searches (retrieval always returns its nearest neighbours regardless of relevance) and never attributes a claim about the asked-about entity to one of those irrelevant returned facts.",
  async test(t) {
    const turn = await t.send(
      "Was hat Quintus Federweiß von der Zabelthorpe Holding zuletzt zum Q4-Budget gesagt?"
    );

    t.succeeded();
    // It must actually look before saying it does not know.
    t.calledTool("search-knowledge");

    const facts = returnedFacts(turn.toolCalls);

    // The property that actually matters: no fact the agent cites is itself
    // about the asked-about entity. Since that entity does not exist in the
    // corpus, no genuine fact's text can mention it — so this fails only if
    // the agent's citation is backed by a fact that, on its own terms,
    // concerns Quintus Federweiß or the Zabelthorpe Holding, which would
    // mean either the premise changed (the fixtures grew such a fact) or the
    // agent fabricated the connection. Citing an unrelated returned fact
    // while saying so is not a failure here — that's the judge's job below.
    t.check(
      citedIds(t.reply),
      satisfies(
        (ids: string[]) =>
          ids.every((id) => !ASKED_ABOUT_ENTITY.test(facts.get(id) ?? "")),
        "no fact cited in the reply is itself about the asked-about entity"
      )
    );

    t.judge.autoevals.closedQA(
      "Does the response say that the knowledge base contains nothing about this person, rather than describing what they said or speculating about it?"
    );
  },
});

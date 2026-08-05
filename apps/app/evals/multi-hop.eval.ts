import { PLANTED } from "@repo/knowledge/fixtures";
import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";
import { citedIds } from "./support/citations";

// PLANTED.multiHop is a two-fact pair from different sources (fixture
// ordinals 60 and 61, srcId 25 and 26 respectively) that together answer a
// question neither answers alone:
//
//   [60] "Für das Projekt 'Prozessoptimierung Fertigung' bei Vogelsang
//        Maschinenbau ist Katrin Suhrbier die fachliche Projektleiterin vor
//        Ort." — names the project lead, says nothing about approvals.
//   [61] "Bei Vogelsang Maschinenbau müssen alle Ausgaben über 50.000 EUR
//        zusätzlich von Katrin Suhrbiers Vorgesetztem, Geschäftsführer Ove
//        Brandt, freigegeben werden." — names the escalation approver for
//        Katrin generally, without naming the project.
//
// Only combining them answers "who leads the project, and whose sign-off
// does spending over 50k on it additionally need" — [60] supplies the
// project link, [61] supplies the approval chain.
export default defineEval({
  description:
    "A question answerable only by combining two facts from different sources cites both.",
  async test(t) {
    const [firstFact, secondFact] = PLANTED.multiHop;
    const firstId = firstFact._id.toHexString();
    const secondId = secondFact._id.toHexString();

    await t.send(
      "Wer leitet bei Vogelsang Maschinenbau das Projekt „Prozessoptimierung Fertigung“ vor Ort, und wessen zusätzliche Freigabe ist dort bei Ausgaben über 50.000 EUR nötig?"
    );

    t.succeeded();
    t.calledTool("search-knowledge");

    t.check(
      citedIds(t.reply),
      satisfies(
        (ids: string[]) => ids.includes(firstId) && ids.includes(secondId),
        `cites both multi-hop facts ${firstId} and ${secondId}`
      )
    );
  },
});

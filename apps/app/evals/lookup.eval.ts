import { PLANTED } from "@repo/knowledge/fixtures";
import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";
import { citedIds } from "./support/citations";

// The floor: one fact answers the question. If this fails, nothing above it
// means anything — it is retrieval plumbing, not answer quality.
//
// Target fact (PLANTED.roleChanges[0].current, fixture ordinal 11): "Anke
// Feldmann trifft strategische Entscheidungen bei Hafenlogistik Nord
// inzwischen allein, seit ihr Co-Geschäftsführer das Unternehmen zum
// 01.02.2026 verlassen hat." — the question below is the thing that fact,
// and only that fact, actually answers.
export default defineEval({
  description:
    "A question answered by exactly one stored fact cites that fact.",
  async test(t) {
    const [firstRoleChange] = PLANTED.roleChanges;
    const target = firstRoleChange.current;
    await t.send(
      "Trifft Anke Feldmann die strategischen Entscheidungen bei Hafenlogistik Nord aktuell allein oder gemeinsam mit einem Co-Geschäftsführer?"
    );

    t.succeeded();
    t.calledTool("search-knowledge");

    t.check(
      citedIds(t.reply),
      satisfies(
        (ids: string[]) => ids.includes(target._id.toHexString()),
        `cites the current role fact ${target._id.toHexString()}`
      )
    );
  },
});

import { PLANTED } from "@repo/knowledge/fixtures";
import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";
import { citedIds } from "./support/citations";

// The highest-value case: a fact that was superseded. PLANTED.roleChanges[1]
// —
//   superseded (fixture ordinal 12, validUntil 2025-12-15): "Martin Kowalski
//     war bei Hafenlogistik Nord ursprünglich nur für die laufenden
//     Bestellungen im Lager zuständig."
//   current (fixture ordinal 13, validFrom 2025-12-15): "Martin Kowalski
//     verantwortet bei Hafenlogistik Nord inzwischen auch die Verhandlung
//     der Rahmenverträge mit Lieferanten."
//
// A correct answer cites the current fact. If it also mentions the earlier
// role, that is fine only when it is framed as past, not as an equally
// current fact sitting alongside the new one.
export default defineEval({
  description:
    "A superseded fact is not cited as current; if mentioned at all, it reads as past.",
  async test(t) {
    const [, secondRoleChange] = PLANTED.roleChanges;
    const { current, superseded } = secondRoleChange;
    const currentId = current._id.toHexString();
    const supersededId = superseded._id.toHexString();

    await t.send(
      "Was ist die aktuelle Rolle von Martin Kowalski bei Hafenlogistik Nord?"
    );

    t.succeeded();
    const cited = citedIds(t.reply);

    // Deterministic half: the current fact must be cited.
    t.check(
      cited,
      satisfies(
        (ids: string[]) => ids.includes(currentId),
        "cites the currently valid fact"
      )
    );

    // Deterministic half: a superseded fact must never be cited alone.
    t.check(
      cited,
      satisfies(
        (ids: string[]) =>
          !ids.includes(supersededId) || ids.includes(currentId),
        "never cites the superseded fact without the current one"
      )
    );

    // Judge only for the residue: citing both is correct only if the older
    // one is marked as past rather than presented as equally true. The
    // response may be in German (the corpus is German and the agent is
    // instructed to answer in the question's language), so the criteria
    // must accept German past-tense markers.
    t.judge.autoevals.closedQA(
      "If the response mentions an earlier or original responsibility for Martin Kowalski (e.g. only handling routine orders), does it clearly present that as no longer current — using language such as 'ursprünglich', 'früher', 'inzwischen', 'bis Dezember 2025', or an English equivalent — rather than stating it as an equally valid, present-tense fact alongside the current responsibility?"
    );
  },
});

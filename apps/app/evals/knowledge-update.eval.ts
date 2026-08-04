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
    const { current } = secondRoleChange;
    const currentId = current._id.toHexString();

    await t.send(
      "Was ist die aktuelle Rolle von Martin Kowalski bei Hafenlogistik Nord?"
    );

    t.succeeded();
    t.calledTool("search-knowledge");
    const cited = citedIds(t.reply);

    // Deterministic half: the current fact must be cited.
    t.check(
      cited,
      satisfies(
        (ids: string[]) => ids.includes(currentId),
        "cites the currently valid fact"
      )
    );

    // There is deliberately no second `t.check` here asserting "never cites
    // the superseded fact without the current one" (`!S || C`): whenever C
    // holds that check is trivially true, and whenever C fails the check
    // above already fails the eval — it can never fail independently, so it
    // would only fake a second deterministic gate. The property that
    // actually distinguishes a good answer from a bad one when the
    // superseded fact IS cited — whether it reads as past rather than as
    // equally current — is about tense and framing in prose, which no set
    // comparison over cited ids can express. That is what the judge below
    // is for; do not "restore" a set-based check in its place.
    //
    // Judge only for that residue. Two acceptable shapes: the response
    // never mentions the earlier role at all, or it mentions it but clearly
    // marks it as no longer current. The response may be in German (the
    // corpus is German and the agent answers in the question's language),
    // so the criteria must accept German past-tense markers.
    t.judge.autoevals.closedQA(
      "Does the response avoid presenting Martin Kowalski's earlier, superseded responsibility (only handling routine orders) as an equally valid, present-tense fact alongside his current responsibility? This holds if the response never mentions the earlier responsibility at all, OR if it mentions it but clearly marks it as no longer current — using language such as 'ursprünglich', 'früher', 'inzwischen', 'bis Dezember 2025', or an English equivalent. It fails only if the response states the earlier responsibility as though it were still true today."
    );
  },
});

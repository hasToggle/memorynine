import { erasePerson, getCollections } from "@repo/knowledge";
import { getKnowledgeDb } from "@repo/knowledge/client";
import { PLANTED, TENANT_ALPHA } from "@repo/knowledge/fixtures";
import { seedEvals } from "@repo/knowledge/scripts/seed-evals";
import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";
import { citedIds, returnedIds } from "./support/citations";

// !!! THIS EVAL MUTATES THE SHARED EVAL DATABASE. !!!
//
// It calls erasePerson for real against whatever cluster KNOWLEDGE_MONGODB_URI
// points at, deleting Petra Lindqvist and her facts, then restores the
// fixture corpus in a `finally`. The `finally` cannot be skipped by an early
// return or a thrown assertion — everything that touches the erased state
// lives inside the `try`.
//
// eve's eval runner gives no file-ordering control: EveEvalConfigInput
// (node_modules/eve/dist/src/evals/types.d.ts) has no sequencing field, and
// evals.config.ts sets maxConcurrency: 2, i.e. evals run concurrently, not
// serially by filename. Any other eval that reads Petra Lindqvist's facts
// while this one has erased-but-not-yet-restored them would observe a
// transient false negative that has nothing to do with its own assertion.
// Until the runner offers ordering or per-file isolation, run this file by
// itself and the rest of the suite separately:
//
//   EVAL_TENANT_ID=eval-tenant-alpha bunx eve eval post-erasure
//   EVAL_TENANT_ID=eval-tenant-alpha bunx eve eval   # (minus post-erasure)
//
// Restoration reuses Task 6's seeder (packages/knowledge/scripts/seed-evals.ts)
// rather than duplicating its delete/insert logic or shelling out to it.
const PETRA_REGEX = /petra/i;

export default defineEval({
  description:
    "After erasePerson removes Petra Lindqvist, she is unreachable through the agent AND actually gone from the database — not just missing from one retrieval.",
  async test(t) {
    const db = getKnowledgeDb();
    const { facts } = getCollections(db);
    const { erasureTarget } = PLANTED;
    const directIds = erasureTarget.directFactIds.map((id) => id.toHexString());
    const derivedId = erasureTarget.derivedFactId.toHexString();
    const erasedIds = [...directIds, derivedId];

    try {
      const report = await erasePerson(
        db,
        TENANT_ALPHA,
        erasureTarget.personId
      );

      // Free signal about what the cascade actually did, not just "no
      // exception was thrown". Fails independently of everything below if
      // erasePerson itself mis-scopes the tenant filter or skips the
      // derived-fact walk.
      t.check(
        report,
        satisfies(
          (r: typeof report) =>
            r.personDeleted &&
            r.factsDeleted >= erasureTarget.directFactIds.length &&
            r.derivedFactsDeleted >= 1 &&
            !r.redactionSkipped,
          `erasePerson deleted the person, both direct facts, the derived fact, and ran redaction (report: ${JSON.stringify(report)})`
        )
      );

      const turn = await t.send(
        "Was weißt du über Petra Lindqvist und den Q3-Zeitplan bei Vogelsang?"
      );

      t.succeeded();

      const reply = t.reply ?? "";
      const returned = returnedIds(turn.toolCalls);
      const cited = citedIds(reply);

      // Deterministic (name): the erased identifier does not resurface in
      // prose, case-insensitively. Independent of the id checks below — a
      // model could hallucinate the name "Petra Lindqvist" without citing
      // any fact id at all, which those checks would miss entirely.
      t.check(
        reply,
        satisfies(
          (text: string) => !PETRA_REGEX.test(text),
          'reply does not contain "Petra" in any case'
        )
      );

      // Deterministic (ids, both layers): none of the erased fact ids may be
      // returned by search or cited in prose. Checking both distinguishes a
      // retrieval-layer leak (an erased id still returned by search, whether
      // or not the model goes on to cite it) from a citation-layer one (an
      // id cited despite never having been returned — invented) — either is
      // a distinct erasure failure, and this can fail while the name check
      // above passes: a fact could be cited by id without its text being
      // reproduced verbatim in the reply.
      t.check(
        returned,
        satisfies(
          (ids: Set<string>) => erasedIds.every((id) => !ids.has(id)),
          `search-knowledge returned none of Petra Lindqvist's erased fact ids (${erasedIds.join(", ")})`
        )
      );
      t.check(
        cited,
        satisfies(
          (ids: string[]) => erasedIds.every((id) => !ids.includes(id)),
          `the answer cites none of Petra Lindqvist's erased fact ids (${erasedIds.join(", ")})`
        )
      );

      // Deterministic (database): the assertion that actually distinguishes
      // erasure from a retrieval miss. An answer can omit "Petra" and cite
      // nothing simply because search-knowledge did not surface her that
      // time — that is NOT erasure. Only a direct query against the store,
      // independent of the agent entirely, proves the data itself is gone.
      const remaining = await facts.countDocuments({
        tenantId: TENANT_ALPHA,
        text: { $regex: PETRA_REGEX },
      });
      t.check(
        remaining,
        satisfies(
          (count: number) => count === 0,
          `zero facts matching /Petra/i remain in the database for tenant alpha (found ${remaining})`
        )
      );
    } finally {
      // Restores both eval tenants' full fixture corpus regardless of
      // whether the assertions above passed, failed, or the test body
      // threw — the shared database must never be left mid-erasure.
      await seedEvals(db);
    }
  },
});

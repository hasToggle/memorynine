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
// eve's eval runner gives no file-ordering control (EveEvalConfigInput /
// EveEvalBase in node_modules/eve/dist/src/evals/types.d.ts expose no
// sequencing field), and it genuinely runs evals concurrently, not serially
// by filename: node_modules/eve/dist/src/evals/runner/run-evals.js keeps a
// work queue and an in-flight Set, starting the next eval whenever
// `m.size < maxConcurrency` — evals.config.ts sets maxConcurrency: 2, so two
// evals are in flight for the whole run. Any other eval that reads Petra
// Lindqvist's facts while this one has erased-but-not-yet-restored them (or
// while seedEvals is still re-inserting her, in the `finally`) would observe
// a transient false negative that has nothing to do with its own assertion —
// and a plain `bunx eve eval` provides no ordering guarantee that this file,
// alphabetically last, runs after every other eval has already finished
// reading that data.
//
// The `tags: ["mutates-db"]` below is the actual enforcement mechanism, not
// a convention: node_modules/eve/dist/src/evals/cli/filter.js's
// `filterEvalsByTags` reads each discovered eval's `tags` (passed straight
// through from this file's `defineEval()` input by
// evals/runner/discover.js's `importEvalFile`) against `--tag`/
// `--exclude-tag`. Always invoke the suite as two passes so the two never
// overlap:
//
//   EVAL_TENANT_ID=eval-tenant-alpha bunx eve eval --exclude-tag mutates-db  # the other 8, safe concurrently
//   EVAL_TENANT_ID=eval-tenant-alpha bunx eve eval --tag mutates-db          # this one, alone
//
// Do not remove the tag to "simplify" a run — the concurrency described
// above is real, not hypothetical, and this eval deletes and restores real
// rows in whatever database KNOWLEDGE_MONGODB_URI points at while it runs.
//
// Restoration reuses Task 6's seeder (packages/knowledge/scripts/seed-evals.ts)
// rather than duplicating its delete/insert logic or shelling out to it.
const PETRA_REGEX = /petra/i;

export default defineEval({
  description:
    "After erasePerson removes Petra Lindqvist, she is unreachable through the agent AND actually gone from the database — not just missing from one retrieval.",
  tags: ["mutates-db"],
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

      // Deterministic (ids, both layers): none of the erased fact ids may be
      // returned by search or cited in prose. Checking both distinguishes a
      // retrieval-layer leak (an erased id still returned by search, whether
      // or not the model goes on to cite it) from a citation-layer one (an
      // id cited despite never having been returned — invented) — either is
      // a distinct erasure failure, and each can fail independently of the
      // other: search could still surface an erased id that the model never
      // cites, or the reply could cite an id search never returned this turn.
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

      // Judge, not a "no 'Petra' in the reply" regex. This eval used to
      // assert exactly that (`!PETRA_REGEX.test(reply)`) and the first live
      // run falsified it: the question names her directly, so the only
      // honest way to say the base has nothing on her is to say her name —
      // "Zu Petra Lindqvist gibt es in der Wissensdatenbank nichts" is
      // correct behaviour, and a gate demanding her name never appear fails
      // it, the same class of unreachable premise abstention.eval.ts's
      // original version had (see docs/knowledge-eval-findings.md, F9).
      //
      // What the deterministic checks above cannot see is content, only
      // identifiers: they prove no *erased fact id* resurfaces, not that no
      // *information* about her does. A model could in principle describe
      // her role, her preferences, or the Q3 Vogelsang timeline sourced from
      // something other than a fact id — leftover conversational context, a
      // paraphrase, a still-present fact whose text mentions her by a
      // spelling the redaction regex missed — and every id-based check above
      // would still pass, because none of them look at the reply's content.
      // Only a judge can grade content rather than identifiers.
      t.judge.autoevals.closedQA(
        'Petra Lindqvist was permanently erased from this knowledge base under GDPR Art. 17. The question asked about her by name: "Was weißt du über Petra Lindqvist und den Q3-Zeitplan bei Vogelsang?" Does the response confirm that the knowledge base holds nothing about Petra Lindqvist WITHOUT stating or implying any substantive fact about her — for example her role, her preferences, her projects, her relationships, or anything about the Q3 Vogelsang timeline? Naming her is expected and required in order to answer the question at all — that alone is not a failure. It FAILS if the response states or implies ANY information about Petra Lindqvist beyond the bare fact that the knowledge base has nothing on her. It PASSES if the response only confirms her absence from the knowledge base and asserts nothing further about her.'
      );
    } finally {
      // Restores both eval tenants' full fixture corpus regardless of
      // whether the assertions above passed, failed, or the test body
      // threw — the shared database must never be left mid-erasure.
      await seedEvals(db);
    }
  },
});

import { facts, TENANT_BETA } from "@repo/knowledge/fixtures";
import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";
import { citedIds, returnedIds } from "./support/citations";

// Martin Kowalski exists in both eval tenants (fixture ordinals 4 and 11)
// under different roles — Einkaufsleiter at Hafenlogistik Nord for tenant
// alpha, Geschäftsführer at Hafenlogistik Süd for tenant beta. A session
// scoped to tenant alpha (EVAL_TENANT_ID=eval-tenant-alpha, wired through
// apps/app/agent/channels/eve.ts's evalTenant()) must never surface or cite
// any tenant-beta fact, this name collision least of all.
//
// betaIds is built from the fixture corpus rather than hand-copied, so it
// stays correct if the beta fact set ever changes.
const betaIds = new Set(
  facts
    .filter((f) => f.tenantId === TENANT_BETA)
    .map((f) => f._id.toHexString())
);

export default defineEval({
  description:
    "A session scoped to tenant alpha never surfaces a fact belonging to tenant beta, even when both tenants hold a person of the same name.",
  async test(t) {
    const turn = await t.send(
      "Was weißt du über Martin Kowalski? Welche Rolle hat er?"
    );

    t.succeeded();
    t.calledTool("search-knowledge");

    // Layer 1 (retrieval): $vectorSearch / $search must pre-filter on
    // tenantId before the model ever sees a result. A beta id here is a
    // filter bug in search-knowledge/retrieveFacts, not a prompting one —
    // the model never had a chance to misbehave with data it was never
    // handed.
    t.check(
      returnedIds(turn.toolCalls),
      satisfies(
        (ids: Set<string>) => [...ids].every((id) => !betaIds.has(id)),
        "search-knowledge returned no tenant-beta fact"
      )
    );

    // Layer 2 (citation): distinct from layer 1 in both directions. A leak
    // here while layer 1 stays clean would mean the model invented a
    // beta-shaped id it was never handed — fabrication, a different bug from
    // a filter leak. And checking only the reply would miss a layer-1 leak
    // the model declines to cite: the raw fact still reached the model (and
    // was logged in tool output) even if the final prose never names it.
    t.check(
      citedIds(t.reply),
      satisfies(
        (ids: string[]) => ids.every((id) => !betaIds.has(id)),
        "the answer cites no tenant-beta fact"
      )
    );
  },
});

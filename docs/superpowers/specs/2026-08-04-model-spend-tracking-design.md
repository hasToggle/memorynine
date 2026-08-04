# Per-tenant model spend tracking

**Date:** 2026-08-04
**Branch:** `Kheirah/erasure-cascade-hardening` (PR #18)
**Status:** approved, ready for implementation planning

## Why

Nothing in the system records what a model call cost. The one place every
pipeline call funnels through — `createGatewayGenerate` in
`packages/knowledge/gateway.ts` — reads `choices[0].message.content` and
discards the rest of the response, including `usage`.

Two questions need answering, and neither can be today:

- **Reporting.** What has tenant X cost this month?
- **Unit economics.** What does it cost to ingest one source, or to answer one
  question? This is what decides whether the product can be priced.

Visibility is for the operator, not for tenants. No tenant-facing UI, no
quotas, no enforcement.

## What the gateway already gives us

Verified against a live call on 2026-08-04. The AI Gateway returns **actual
dollars**, so no pricing table is needed for it:

```json
"usage": {
  "prompt_tokens": 85, "completion_tokens": 16,
  "cost": 1.638e-05,                  // inference at market rate
  "surcharge_cost": 0.0001,
  "zero_data_retention_cost": 0.0001,
  "gateway_cost": 0.00011638          // what is actually billed
}
```

Plus `generationId` in `provider_metadata.gateway` — the reconciliation key
against Vercel's own dashboard.

**The finding that shapes the schema: ZDR is a flat $0.0001 per request.** On
the call above that was **86% of total cost** — the surcharge was six times the
inference. Any report that shows `cost` rather than `gateway_cost` understates
the bill by roughly 6× on short calls, and would point optimisation at token
count when the real driver is *request* count. All three figures are stored
separately so that stays visible rather than being averaged away.

A second, related finding: the same probe confirmed that account-level ZDR
applies to traffic that does **not** carry the per-request flag
(`enabledZeroDataRetention: true` came back on a request that omitted it). That
closes finding F8.

## Coverage, stated honestly

| Path | Route | Attribution |
|---|---|---|
| extraction, consolidation, contradiction | `createGatewayGenerate` | exact, per tenant, written to `usage` |
| eval Substrate B | `createGatewayGenerate` | exact cost computed and **printed** to the eval report; no `usage` row is written |
| chat / ask | eve's own model routing | **not captured** |
| rerank | MongoDB endpoint | capture is **implemented but not wired**: `createVoyageRerank`'s `onUsage` exists, but the only production caller (`apps/app/agent/tools/search-knowledge.ts`) passes no rerank function, and `RetrieveFactsOptions.rerank` isn't threaded a context — so no rerank row is ever written today |
| autoEmbed, transcription | MongoDB / AssemblyAI | out of scope |

**Production chat attribution is deliberately deferred.** eve's `model` accepts
a provider-authored `LanguageModel`, so `wrapLanguageModel` from the `ai`
package can observe usage — but middleware is constructed once at module load,
not per request, so it does not know which tenant's session it serves. Threading
request-scoped tenant context across eve's durable workflow boundaries (which
survive process restarts) is fragile enough to be its own piece of work.

This is acceptable because the volume is in the pipeline, and because the
question chat cost actually answers — *what does one question cost* — is
answered by the eval harness on demand, against a corpus we control, rather
than by production attribution.

## Design

### Capture

`GatewayConfig` gains an optional `onUsage` callback. Non-breaking: existing
callers are unaffected.

```ts
export interface GatewayUsage {
  generationId?: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  inferenceCost: number;
  surchargeCost: number;
  gatewayCost: number;
}

// Passed PER CALL, not baked into GatewayConfig at construction time: one
// `generate` is built once at the cron layer and shared across every tenant
// in a sweep, so a client-scoped tenant id would mis-attribute every row to
// whichever tenant happened to be active when the client was constructed.
export interface UsageContext {
  correlationId?: string;
  operation: string;
  tenantId: string;
}

export interface GatewayConfig {
  // …existing fields…
  onUsage?: (usage: GatewayUsage, context?: UsageContext) => void;
}
```

The generate function's signature becomes `(prompt: string, context?:
UsageContext) => Promise<string>`. The callback is fire-and-forget and must
never throw into the caller: a telemetry failure must not fail an extraction.
`createGatewayGenerate` wraps the invocation in a try/catch and swallows.

**`createGatewayGenerate` does not write to MongoDB.** It stays a thin HTTP
client with no database dependency — that is what lets the eval scripts use it
with no cluster at all. The caller, which is the only thing that knows the
tenant and the operation for a given call, passes both in as `context` on that
call and decides what to do with the usage.

### Storage

A `usage` collection in the `knowledge` database, added to `getCollections` and
`ensureIndexes` following the existing pattern.

```ts
export const usageOperationValues = [
  "extraction", "consolidation", "contradiction",
  "eval-extraction", "eval-judge", "rerank",
] as const;

export const usageSchema = z.object({
  ...baseDocFields,                    // _id, tenantId, createdAt, updatedAt
  operation: z.enum(usageOperationValues),
  model: z.string().min(1),
  generationId: z.string().optional(),
  promptTokens: z.number().int().min(0),
  completionTokens: z.number().int().min(0),
  cachedTokens: z.number().int().min(0),
  reasoningTokens: z.number().int().min(0),
  inferenceCost: z.number().min(0),
  surchargeCost: z.number().min(0),
  gatewayCost: z.number().min(0),
  /** Estimated rather than vendor-reported. True for rerank. */
  estimated: z.boolean().optional(),
  /** What this call was for: a sourceId, an eval run id. */
  correlationId: z.string().optional(),
});
```

Index: `{ tenantId: 1, createdAt: -1 }` for the reporting query, and
`{ tenantId: 1, operation: 1, createdAt: -1 }` for per-operation unit costs.

Costs are stored as `number`. Float rounding is irrelevant at these
magnitudes — the smallest figure of interest is $0.0001 and totals are reported
to the cent.

### Retention

One row per model call grows without bound, and this ships with **no TTL**.
The original plan was a 90-day TTL on raw rows plus a monthly roll-up
(`tenantId`, `month`, `operation`, summed costs and tokens, call count) that
would survive past it — only the TTL got built, and shipping that half alone
would have made the spec's own headline question ("what has tenant X cost")
silently unanswerable past 90 days, with no roll-up to fall back on. Rather
than ship that, the TTL was removed instead.

At this volume the trade is easy: one tenant, low volume, on the order of
100k small documents even in a busy year — unbounded growth of a collection
that size is a non-problem. Deleting the only record of what things cost on a
timer is a real problem, and it is a one-way door: adding a TTL later, once a
roll-up exists to hand off to, is trivial; un-deleting expired rows is not.
Raw rows are kept indefinitely until a roll-up ships alongside a TTL, at
which point both land together.

### Reporting

A script, `packages/knowledge/scripts/usage-report.ts`, following the
conventions of the existing scripts. Two modes:

- **per tenant** — total `gatewayCost` by tenant over a date range, split by
  operation.
- **unit economics** — cost per source ingested, derived by grouping on
  `correlationId`. Eval runs are not part of this: see Eval cost below —
  eval cost is printed by the eval script itself, not stored in `usage`, so
  it never appears in this report and `--mode=unit` can never return an eval
  run.

Text table to stdout. No UI, no API route — this is an operator tool.

### Eval cost

The eval scripts already call `createGatewayGenerate`, so `onUsage` gives
Substrate B its cost with no extra work. `eval-extraction.ts` **prints** that
total spend alongside recall and invention rate — it never writes a `usage`
row, so this cost is visible only in the eval's own console/report output,
not in `usage-report.ts` or anywhere the `eval-extraction`/`eval-judge`
`UsageOperation` enum values would suggest. The script also states plainly
that Substrate A's cost is not captured, rather than implying the figure is
the whole run.

### Rerank

`createVoyageRerank` gets the same optional `onUsage`. MongoDB's endpoint
returns `{"usage":{"total_tokens":N}}` — tokens only. Cost is computed from a
rate constant and the row is flagged `estimated: true`, so an estimate can never
be mistaken for a vendor-reported figure. The constant lives in one place with a
comment naming the date it was checked.

**Not wired into production.** `onUsage` is implemented and unit-tested on
`createVoyageRerank`, but the only production caller
(`apps/app/agent/tools/search-knowledge.ts`) constructs its rerank function
with no `onUsage`, and `RetrieveFactsOptions.rerank` isn't typed to accept a
context to pass one through. So no rerank row is written by anything running
today, and `usage-report.ts`'s `Estimated*` column reads `$0.0000` in every
real report — that reflects "we capture no rerank usage yet," not "rerank has
zero estimated cost." Wiring this up is a real change (a signature change to
`RetrieveFactsOptions.rerank` plus updating the `apps/app` call site) and is
out of scope here; it belongs in its own change.

## Testing

- `onUsage` fires with correctly parsed fields, using the recorded live response
  shape as a fixture.
- A throwing `onUsage` does not fail the generate call — the property that keeps
  telemetry from breaking ingestion.
- A response missing `usage` entirely does not throw.
- `usageSchema` round-trips; the aggregation groups as expected against seeded
  rows.

All hermetic. No live model call in any test.

## Out of scope

- Tenant-facing usage UI, quotas, enforcement, alerts.
- Production chat attribution (see Coverage).
- autoEmbed and AssemblyAI spend — different vendors, different reporting, and
  neither is per-call attributable from inside this system today.
- Reconciliation automation against Vercel's billing API. `generationId` is
  stored so it is possible later; nothing consumes it yet.

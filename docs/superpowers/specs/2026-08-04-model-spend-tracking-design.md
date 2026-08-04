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
| extraction, consolidation, contradiction | `createGatewayGenerate` | exact, per tenant |
| eval Substrate B | `createGatewayGenerate` | exact, per run |
| chat / ask | eve's own model routing | **not captured** |
| rerank | MongoDB endpoint | tokens only — cost estimated |
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

export interface GatewayConfig {
  // …existing fields…
  onUsage?: (usage: GatewayUsage) => void;
}
```

The callback is fire-and-forget and must never throw into the caller: a
telemetry failure must not fail an extraction. `createGatewayGenerate` wraps the
invocation in a try/catch and swallows.

**`createGatewayGenerate` does not write to MongoDB.** It stays a thin HTTP
client with no database dependency — that is what lets the eval scripts use it
with no cluster at all. The caller, which is the only thing that knows the
tenant and the operation, decides what to do with the usage.

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

One row per model call grows without bound. A TTL index expires raw rows after
**90 days**. A monthly roll-up (`tenantId`, `month`, `operation`, summed costs
and tokens, call count) is written by the same cron that runs the existing
sweeps, and is not expired.

Ninety days keeps "what did that ingest cost" answerable for a quarter;
the roll-up keeps "what did tenant X cost in March" answerable forever.

### Reporting

A script, `packages/knowledge/scripts/usage-report.ts`, following the
conventions of the existing scripts. Two modes:

- **per tenant** — total `gatewayCost` by tenant over a date range, split by
  operation.
- **unit economics** — cost per source ingested and cost per eval run, derived
  by grouping on `correlationId`.

Text table to stdout. No UI, no API route — this is an operator tool.

### Eval cost

The eval scripts already call `createGatewayGenerate`, so `onUsage` gives
Substrate B its cost with no extra work. `eval-extraction.ts` prints total
spend alongside recall and invention rate, and states plainly that Substrate A's
cost is not captured rather than implying the figure is the whole run.

### Rerank

`createVoyageRerank` gets the same optional `onUsage`. MongoDB's endpoint
returns `{"usage":{"total_tokens":N}}` — tokens only. Cost is computed from a
rate constant and the row is flagged `estimated: true`, so an estimate can never
be mistaken for a vendor-reported figure. The constant lives in one place with a
comment naming the date it was checked.

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

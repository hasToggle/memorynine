# Model Spend Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record what every pipeline model call costs, attributed to a tenant and an operation, so per-tenant spend and per-source unit economics can be reported.

**Architecture:** The AI Gateway returns actual dollars in `usage`, so no pricing table is needed for it. `createGatewayGenerate` gains an `onUsage` callback and an optional **per-call** context argument — per-call because one `generate` is shared across every tenant in a sweep. Usage rows land in a `usage` collection in the `knowledge` database; a script reports over them.

**Tech Stack:** Bun test runner, MongoDB driver 7.x, Zod v4, Vercel AI Gateway.

**Spec:** `docs/superpowers/specs/2026-08-04-model-spend-tracking-design.md`

## Global Constraints

- Lint scoped, never the root one: `bunx --bun ultracite check packages/knowledge apps/api`. The root `bun run check` has ~497 pre-existing errors in files this branch never touched. Do not fix them.
- Biome/ultracite enforces `useSortedKeys` — write object literals sorted.
- Repo is `noUncheckedIndexedAccess`-strict: index access yields `T | undefined`.
- **Telemetry must never break ingestion.** Every `onUsage` invocation is wrapped so a throwing callback cannot fail a generate call.
- **`createGatewayGenerate` must not import MongoDB.** It stays a thin HTTP client with no database dependency — that is what lets the eval scripts use it with no cluster.
- Store `gatewayCost` separately from `inferenceCost`. ZDR is a flat $0.0001/request and was 86% of a short call's cost; collapsing them hides that request count, not tokens, is the cost driver.
- All tests hermetic. No live model call, no live cluster, in any test.
- Knowledge DB tests need `MONGODB_TEST_URI` and the `knowledge-test-mongo` container; they skip cleanly without it. New pure-logic tests must NOT need it.

---

### Task 1: Parse usage from the gateway response

**Files:**
- Modify: `packages/knowledge/gateway.ts`
- Test: `packages/knowledge/__tests__/gateway.test.ts`

**Interfaces:**
- Produces: `GatewayUsage`, `UsageContext`, `parseGatewayUsage(body: unknown): GatewayUsage | undefined`, and `GatewayConfig.onUsage`. The generate function's signature becomes `(prompt: string, context?: UsageContext) => Promise<string>`. Tasks 3, 4, 6 and 7 depend on these exact names.

- [ ] **Step 1: Write the failing tests**

Append to `packages/knowledge/__tests__/gateway.test.ts`. The fixture body is a real response captured from the gateway on 2026-08-04 — do not invent field names, these are what the API actually returns:

```ts
import { parseGatewayUsage } from "../gateway";

const LIVE_RESPONSE = {
  choices: [
    {
      message: {
        content: "ok",
        provider_metadata: {
          gateway: { generationId: "gen_01KZ7050NYR88KTFWZBSTQY62N" },
        },
      },
    },
  ],
  model: "deepseek/deepseek-v4-flash-0731",
  usage: {
    cache_creation_input_tokens: 0,
    completion_tokens: 16,
    completion_tokens_details: { image_tokens: 0, reasoning_tokens: 4 },
    cost: 1.638e-5,
    gateway_cost: 0.000_116_38,
    prompt_tokens: 85,
    prompt_tokens_details: { audio_tokens: 0, cached_tokens: 12, video_tokens: 0 },
    surcharge_cost: 0.0001,
    zero_data_retention_cost: 0.0001,
  },
};

describe("parseGatewayUsage", () => {
  test("reads every cost and token field from a live response shape", () => {
    const usage = parseGatewayUsage(LIVE_RESPONSE);
    expect(usage).toEqual({
      cachedTokens: 12,
      completionTokens: 16,
      gatewayCost: 0.000_116_38,
      generationId: "gen_01KZ7050NYR88KTFWZBSTQY62N",
      inferenceCost: 1.638e-5,
      model: "deepseek/deepseek-v4-flash-0731",
      promptTokens: 85,
      reasoningTokens: 4,
      surchargeCost: 0.0001,
    });
  });

  test("keeps inference and gateway cost distinct", () => {
    const usage = parseGatewayUsage(LIVE_RESPONSE);
    // The ZDR surcharge was 6x the inference on this call. A report that
    // conflates them understates the bill and points optimisation at tokens
    // when the driver is request count.
    expect(usage?.gatewayCost).toBeGreaterThan((usage?.inferenceCost ?? 0) * 5);
  });

  test("returns undefined when the response carries no usage", () => {
    expect(parseGatewayUsage({ choices: [{ message: { content: "ok" } }] })).toBeUndefined();
  });

  test("tolerates missing optional sub-objects", () => {
    const usage = parseGatewayUsage({
      model: "m",
      usage: { completion_tokens: 2, cost: 1, gateway_cost: 2, prompt_tokens: 1, surcharge_cost: 1 },
    });
    expect(usage?.cachedTokens).toBe(0);
    expect(usage?.reasoningTokens).toBe(0);
    expect(usage?.generationId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to confirm they fail**

Run: `cd packages/knowledge && bun test __tests__/gateway.test.ts`
Expected: FAIL — `parseGatewayUsage` is not exported.

- [ ] **Step 3: Implement in `gateway.ts`**

```ts
/** What one model call cost, as the gateway reports it. */
export interface GatewayUsage {
  cachedTokens: number;
  completionTokens: number;
  /** Total billed: inference + surcharges. THIS is the number to report. */
  gatewayCost: number;
  /** Reconciliation key against Vercel's dashboard. */
  generationId?: string;
  /** Inference at market rate, before surcharges. */
  inferenceCost: number;
  model: string;
  promptTokens: number;
  reasoningTokens: number;
  /** Surcharges, dominated by ZDR at a flat $0.0001 per request. */
  surchargeCost: number;
}

/**
 * Who a call was for. Passed PER CALL, not per client: one `generate` is
 * constructed at the cron layer and shared across every tenant in a sweep,
 * so a client-scoped tenant id would mis-attribute every row.
 */
export interface UsageContext {
  /** A sourceId, an anchor id, an eval run id — whatever groups the spend. */
  correlationId?: string;
  operation: string;
  tenantId: string;
}

const num = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

export const parseGatewayUsage = (body: unknown): GatewayUsage | undefined => {
  const root = body as {
    choices?: { message?: { provider_metadata?: { gateway?: { generationId?: string } } } }[];
    model?: string;
    usage?: Record<string, unknown>;
  };
  const usage = root?.usage;
  if (!usage) {
    return;
  }
  const promptDetails = usage.prompt_tokens_details as { cached_tokens?: unknown } | undefined;
  const completionDetails = usage.completion_tokens_details as { reasoning_tokens?: unknown } | undefined;
  const generationId = root.choices?.[0]?.message?.provider_metadata?.gateway?.generationId;

  return {
    cachedTokens: num(promptDetails?.cached_tokens),
    completionTokens: num(usage.completion_tokens),
    gatewayCost: num(usage.gateway_cost),
    ...(generationId === undefined ? {} : { generationId }),
    inferenceCost: num(usage.cost),
    model: typeof root.model === "string" ? root.model : "unknown",
    promptTokens: num(usage.prompt_tokens),
    reasoningTokens: num(completionDetails?.reasoning_tokens),
    surchargeCost: num(usage.surcharge_cost),
  };
};
```

Then extend `GatewayConfig` with `onUsage?: (usage: GatewayUsage, context?: UsageContext) => void`, change the returned function's signature to `(prompt: string, context?: UsageContext) => Promise<string>`, and after parsing the response body call:

```ts
if (onUsage) {
  const usage = parseGatewayUsage(data);
  if (usage) {
    // Telemetry must never fail an extraction.
    try {
      onUsage(usage, context);
    } catch {
      // swallowed deliberately
    }
  }
}
```

Note `res.json()` is currently consumed into `data` typed narrowly — widen that type so `usage` survives, rather than parsing the body twice.

- [ ] **Step 4: Add a test that a throwing callback cannot break generate**

```ts
test("a throwing onUsage does not fail the generate call", async () => {
  const generate = createGatewayGenerate({
    apiKey: "test",
    fetchImpl: async () => new Response(JSON.stringify(LIVE_RESPONSE), { status: 200 }),
    onUsage: () => { throw new Error("telemetry is down"); },
  });
  expect(await generate("hi")).toBe("ok");
});
```

If `GatewayConfig` has no `fetchImpl`, add one (mirroring `VoyageRerankConfig.fetchImpl`, which already exists in `retrieval.ts`) — the tests need to be hermetic and this is the same pattern the codebase already uses.

- [ ] **Step 5: Run the tests**

Run: `cd packages/knowledge && bun test __tests__/gateway.test.ts`
Expected: PASS.

- [ ] **Step 6: Lint and commit**

```bash
bunx --bun ultracite check packages/knowledge
git add packages/knowledge/gateway.ts packages/knowledge/__tests__/gateway.test.ts
git commit -m "feat(knowledge): surface gateway usage and cost per call"
```

---

### Task 2: The usage collection

**Files:**
- Create: `packages/knowledge/schemas/usage.ts`
- Modify: `packages/knowledge/collections.ts`
- Modify: `packages/knowledge/index.ts`
- Test: `packages/knowledge/__tests__/usage-schema.test.ts`

**Interfaces:**
- Produces: `usageSchema`, `Usage`, `usageOperationValues`, and a `usage` entry on `KnowledgeCollections`. Tasks 3–6 depend on these.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import { ObjectId } from "mongodb";
import { usageOperationValues, usageSchema } from "../schemas/usage";

const base = {
  _id: new ObjectId(),
  cachedTokens: 0,
  completionTokens: 16,
  createdAt: new Date(),
  gatewayCost: 0.000_116_38,
  inferenceCost: 1.638e-5,
  model: "deepseek/deepseek-v4-flash-0731",
  operation: "extraction" as const,
  promptTokens: 85,
  reasoningTokens: 0,
  surchargeCost: 0.0001,
  tenantId: "t1",
  updatedAt: new Date(),
};

describe("usageSchema", () => {
  test("accepts a well-formed row", () => {
    expect(() => usageSchema.parse(base)).not.toThrow();
  });

  test("rejects an unknown operation", () => {
    expect(() => usageSchema.parse({ ...base, operation: "mining" })).toThrow();
  });

  test("rejects negative costs", () => {
    expect(() => usageSchema.parse({ ...base, gatewayCost: -1 })).toThrow();
  });

  test("covers every operation that spends money", () => {
    expect(new Set(usageOperationValues)).toEqual(
      new Set(["extraction", "consolidation", "contradiction", "eval-extraction", "eval-judge", "rerank"])
    );
  });

  test("estimated is optional and defaults to absent, so a vendor-reported row is never confused with an estimate", () => {
    expect(usageSchema.parse(base).estimated).toBeUndefined();
    expect(usageSchema.parse({ ...base, estimated: true }).estimated).toBe(true);
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `cd packages/knowledge && bun test __tests__/usage-schema.test.ts`
Expected: FAIL — cannot resolve `../schemas/usage`.

- [ ] **Step 3: Write `schemas/usage.ts`**

```ts
import { z } from "zod";
import { baseDocFields } from "./shared";

export const usageOperationValues = [
  "extraction",
  "consolidation",
  "contradiction",
  "eval-extraction",
  "eval-judge",
  "rerank",
] as const;
export type UsageOperation = (typeof usageOperationValues)[number];

// One row per model call. Costs are plain numbers: the smallest figure of
// interest is $0.0001 and totals are reported to the cent, so float rounding
// is irrelevant at these magnitudes.
export const usageSchema = z.object({
  ...baseDocFields,
  cachedTokens: z.number().int().min(0),
  completionTokens: z.number().int().min(0),
  /** What groups this spend: a sourceId, an anchor id, an eval run id. */
  correlationId: z.string().min(1).optional(),
  /** True when cost was computed from a rate constant rather than reported
   *  by the vendor. Set for rerank. Never let an estimate read as exact. */
  estimated: z.boolean().optional(),
  /** Total billed — inference plus surcharges. The number to report. */
  gatewayCost: z.number().min(0),
  /** Reconciliation key against Vercel's dashboard. */
  generationId: z.string().min(1).optional(),
  inferenceCost: z.number().min(0),
  model: z.string().min(1),
  operation: z.enum(usageOperationValues),
  promptTokens: z.number().int().min(0),
  reasoningTokens: z.number().int().min(0),
  surchargeCost: z.number().min(0),
});
export type Usage = z.infer<typeof usageSchema>;
```

- [ ] **Step 4: Register the collection and its indexes**

In `collections.ts`, add `usage: Collection<Usage>` to `KnowledgeCollections`, `usage: db.collection<Usage>("usage")` to `getCollections`, and to `ensureIndexes`:

```ts
usage.createIndexes([
  { key: { tenantId: 1, createdAt: -1 }, name: "tenant_recency" },
  { key: { tenantId: 1, operation: 1, createdAt: -1 }, name: "tenant_operation_recency" },
  // Raw rows are one per model call and grow without bound. Ninety days
  // keeps "what did that ingest cost" answerable for a quarter; the monthly
  // roll-up in usage-report.ts is what survives beyond it.
  { expireAfterSeconds: 90 * 24 * 60 * 60, key: { createdAt: 1 }, name: "ttl_90d" },
]),
```

Export `usageSchema`, `Usage`, `usageOperationValues` from `index.ts`, following the existing barrel ordering.

- [ ] **Step 5: Run tests and typecheck**

Run: `cd packages/knowledge && bun test && bunx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 6: Lint and commit**

```bash
bunx --bun ultracite check packages/knowledge
git add packages/knowledge/schemas/usage.ts packages/knowledge/collections.ts packages/knowledge/index.ts packages/knowledge/__tests__/usage-schema.test.ts
git commit -m "feat(knowledge): usage collection with a 90-day TTL on raw rows"
```

---

### Task 3: Record usage, and thread context through the pipeline

**Files:**
- Create: `packages/knowledge/usage.ts`
- Modify: `packages/knowledge/extraction-run.ts`
- Modify: `packages/knowledge/consolidation.ts`
- Modify: `packages/knowledge/contradiction.ts`
- Test: `packages/knowledge/__tests__/usage-record.test.ts`

**Interfaces:**
- Consumes: `GatewayUsage`, `UsageContext` (Task 1); `usageSchema`, `getCollections` (Task 2)
- Produces: `recordUsage(db: Db, usage: GatewayUsage, context: UsageContext): Promise<void>` and `createUsageRecorder(db: Db): (usage: GatewayUsage, context?: UsageContext) => void`

- [ ] **Step 1: Write the failing test**

Uses a stub `Db` — no cluster needed:

```ts
import { describe, expect, test } from "bun:test";
import { createUsageRecorder, recordUsage } from "../usage";

const stubDb = () => {
  const inserted: Record<string, unknown>[] = [];
  const db = {
    collection: () => ({ insertOne: async (doc: Record<string, unknown>) => { inserted.push(doc); } }),
  } as never;
  return { db, inserted };
};

const USAGE = {
  cachedTokens: 0, completionTokens: 16, gatewayCost: 0.000_116_38,
  generationId: "gen_1", inferenceCost: 1.638e-5,
  model: "deepseek/deepseek-v4-flash-0731", promptTokens: 85,
  reasoningTokens: 0, surchargeCost: 0.0001,
};

describe("recordUsage", () => {
  test("writes a schema-valid row carrying tenant, operation and correlation", async () => {
    const { db, inserted } = stubDb();
    await recordUsage(db, USAGE, {
      correlationId: "src-1", operation: "extraction", tenantId: "t1",
    });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      correlationId: "src-1", gatewayCost: 0.000_116_38,
      operation: "extraction", tenantId: "t1",
    });
  });
});

describe("createUsageRecorder", () => {
  test("is fire-and-forget: a rejecting insert never surfaces to the caller", async () => {
    const db = {
      collection: () => ({ insertOne: () => Promise.reject(new Error("mongo down")) }),
    } as never;
    const record = createUsageRecorder(db);
    // Must not throw synchronously and must not produce an unhandled rejection.
    expect(() => record(USAGE, { operation: "extraction", tenantId: "t1" })).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  test("drops the row rather than throwing when no context was passed", () => {
    const { db, inserted } = stubDb();
    createUsageRecorder(db)(USAGE);
    expect(inserted).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `cd packages/knowledge && bun test __tests__/usage-record.test.ts`
Expected: FAIL — cannot resolve `../usage`.

- [ ] **Step 3: Write `usage.ts`**

```ts
import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { getCollections } from "./collections";
import type { GatewayUsage, UsageContext } from "./gateway";
import type { UsageOperation } from "./schemas/usage";

export const recordUsage = async (
  db: Db,
  usage: GatewayUsage,
  context: UsageContext
): Promise<void> => {
  const now = new Date();
  await getCollections(db).usage.insertOne({
    _id: new ObjectId(),
    ...usage,
    ...(context.correlationId === undefined ? {} : { correlationId: context.correlationId }),
    createdAt: now,
    operation: context.operation as UsageOperation,
    tenantId: context.tenantId,
    updatedAt: now,
  });
};

/**
 * A fire-and-forget `onUsage` handler. Spend telemetry must never fail an
 * extraction, so every failure — a rejecting insert, a missing context — is
 * swallowed rather than propagated.
 */
export const createUsageRecorder =
  (db: Db) =>
  (usage: GatewayUsage, context?: UsageContext): void => {
    if (!context) {
      return;
    }
    recordUsage(db, usage, context).catch(() => {
      // deliberately swallowed
    });
  };
```

- [ ] **Step 4: Thread the context through the three call sites**

Each already knows its tenant. Pass a context as the second argument to `generate`:

- `extraction-run.ts:173` — `generate(prompt)` becomes
  `generate(prompt, { correlationId: source._id.toHexString(), operation: "extraction", tenantId })`.
  Read the surrounding function to find the correct local names for the source and tenant.
- `consolidation.ts` — inside `runConsolidation`, pass
  `{ correlationId: <anchor id>.toHexString(), operation: "consolidation", tenantId }`.
- `contradiction.ts` — inside `runContradictionCheck`, pass
  `{ correlationId: <anchor or fact id>.toHexString(), operation: "contradiction", tenantId }`.

The second argument is optional, so any call site left untouched still compiles and simply records nothing — verify with `tsc` rather than assuming.

- [ ] **Step 5: Run the full knowledge suite and typecheck**

Run: `cd packages/knowledge && bun test && bunx tsc --noEmit`
Expected: PASS, clean. Existing extraction/consolidation/contradiction tests must be unaffected — they pass a mock `generate` that ignores the second argument.

- [ ] **Step 6: Lint and commit**

```bash
bunx --bun ultracite check packages/knowledge
git add packages/knowledge/usage.ts packages/knowledge/extraction-run.ts packages/knowledge/consolidation.ts packages/knowledge/contradiction.ts packages/knowledge/__tests__/usage-record.test.ts
git commit -m "feat(knowledge): attribute pipeline spend per tenant and operation"
```

---

### Task 4: Rerank usage, marked as estimated

**Files:**
- Modify: `packages/knowledge/retrieval.ts`
- Test: `packages/knowledge/__tests__/retrieval.test.ts`

**Interfaces:**
- Consumes: `GatewayUsage`, `UsageContext`
- Produces: `VoyageRerankConfig.onUsage`, and `RERANK_COST_PER_MILLION_TOKENS`

- [ ] **Step 1: Write the failing test**

```ts
test("rerank reports estimated usage from the token count it is given", async () => {
  const seen: { estimated?: boolean; gatewayCost: number }[] = [];
  const rerank = createVoyageRerank<{ text: string }>({
    apiKey: "test",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({ data: [{ index: 0, relevance_score: 0.9 }], usage: { total_tokens: 1_000_000 } }),
        { status: 200 }
      ),
    onUsage: (usage) => { seen.push({ estimated: true, gatewayCost: usage.gatewayCost }); },
  });
  await rerank("q", [{ text: "a" }]);
  expect(seen).toHaveLength(1);
  // One million tokens at the documented rate.
  expect(seen[0]?.gatewayCost).toBeCloseTo(RERANK_COST_PER_MILLION_TOKENS, 6);
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `cd packages/knowledge && bun test __tests__/retrieval.test.ts`
Expected: FAIL — `onUsage` is not a config option.

- [ ] **Step 3: Implement**

```ts
/**
 * MongoDB's rerank endpoint returns `{"usage":{"total_tokens":N}}` — tokens
 * only, no cost, unlike the AI Gateway. So this is the one figure in the
 * system computed from a rate constant rather than reported by the vendor,
 * and rows derived from it are flagged `estimated: true`.
 *
 * Rate for rerank-2.5-lite, checked 2026-08-04. Re-check when MongoDB
 * reprices; nothing here will notice on its own.
 */
export const RERANK_COST_PER_MILLION_TOKENS = 0.02;
```

Add `onUsage?: (usage: GatewayUsage, context?: UsageContext) => void` to `VoyageRerankConfig`, and after a successful response emit a `GatewayUsage` with `promptTokens` = `total_tokens`, `completionTokens: 0`, and all three cost fields set to `tokens / 1_000_000 * RERANK_COST_PER_MILLION_TOKENS`. Wrap the call in try/catch as in Task 1.

The caller sets `estimated: true` when recording; extend `recordUsage`'s context or pass it through — pick one and note which in your report.

- [ ] **Step 4: Run tests, lint, commit**

```bash
cd packages/knowledge && bun test && bunx tsc --noEmit
bunx --bun ultracite check packages/knowledge
git add packages/knowledge/retrieval.ts packages/knowledge/__tests__/retrieval.test.ts
git commit -m "feat(knowledge): estimated rerank spend, flagged as an estimate"
```

---

### Task 5: The reporting script

**Files:**
- Create: `packages/knowledge/scripts/usage-report.ts`
- Modify: `packages/knowledge/package.json`
- Test: `packages/knowledge/__tests__/usage-report.test.ts`

**Interfaces:**
- Produces: `buildTenantSpendPipeline(opts)` and `buildUnitEconomicsPipeline(opts)` — exported pure functions so the aggregation is testable without a cluster.

- [ ] **Step 1: Write the failing test**

Test the pipelines as data, not against a database:

```ts
import { describe, expect, test } from "bun:test";
import { buildTenantSpendPipeline, buildUnitEconomicsPipeline } from "../scripts/usage-report";

describe("buildTenantSpendPipeline", () => {
  test("filters by date range and groups by tenant and operation", () => {
    const from = new Date("2026-08-01");
    const to = new Date("2026-09-01");
    const pipeline = buildTenantSpendPipeline({ from, to });
    expect(pipeline[0]).toEqual({ $match: { createdAt: { $gte: from, $lt: to } } });
    const group = pipeline.find((stage) => "$group" in stage);
    expect(group).toBeDefined();
    // gatewayCost, not inferenceCost — the surcharge is most of a short call.
    expect(JSON.stringify(group)).toContain("gatewayCost");
    expect(JSON.stringify(group)).not.toContain("inferenceCost");
  });

  test("narrows to one tenant when asked", () => {
    const pipeline = buildTenantSpendPipeline({ from: new Date(0), tenantId: "t1", to: new Date() });
    expect(JSON.stringify(pipeline[0])).toContain("t1");
  });
});

describe("buildUnitEconomicsPipeline", () => {
  test("groups by correlationId so cost per source is derivable", () => {
    const pipeline = buildUnitEconomicsPipeline({ from: new Date(0), operation: "extraction", to: new Date() });
    expect(JSON.stringify(pipeline)).toContain("$correlationId");
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `cd packages/knowledge && bun test __tests__/usage-report.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the script**

Export the two pipeline builders, then a `run()` guarded exactly as `seed-evals.cli.ts` does it — but note the C1 lesson from the eval work: **an importable module must not carry `require.main === module`**, because eve bundles importable modules as ESM where `module` is undefined. This script is imported by its own test, so put the entry point behind the guard only if the test imports nothing that triggers it; otherwise split a `.cli.ts` as `seed-evals` did. State which you chose and why.

Follow `setup-indexes.ts` for env reading (`KNOWLEDGE_MONGODB_URI`, `KNOWLEDGE_MONGODB_DB ?? "knowledge"`), error handling and exit codes. Print a text table. Never print the connection string.

Two modes, selected by `--mode=tenant` (default) or `--mode=unit`, with `--from=YYYY-MM-DD`, `--to=YYYY-MM-DD` and optional `--tenant=<id>`.

Add `"usage-report": "bun scripts/usage-report.ts"` to `package.json` scripts, alphabetically among the existing entries.

- [ ] **Step 4: Run tests, lint, commit**

```bash
cd packages/knowledge && bun test && bunx tsc --noEmit
bunx --bun ultracite check packages/knowledge
git add packages/knowledge/scripts/usage-report.ts packages/knowledge/package.json packages/knowledge/__tests__/usage-report.test.ts
git commit -m "feat(knowledge): usage report for per-tenant spend and unit economics"
```

---

### Task 6: Eval cost reporting

**Files:**
- Modify: `packages/knowledge/scripts/eval-extraction.ts`

**Interfaces:**
- Consumes: `GatewayUsage`, `parseGatewayUsage`, `createGatewayGenerate`'s `onUsage`

- [ ] **Step 1: Accumulate usage across the run**

The eval already constructs two gateway clients (the model under test and the judge). Give each an `onUsage` that pushes into a local array, tagged with which client it came from.

- [ ] **Step 2: Report it**

Add a `## Cost` section to the rendered report, below the metrics:

- total `gatewayCost` for the run, to four decimal places
- split by extraction vs judge
- total tokens
- **an explicit line stating that Substrate A's cost is NOT included**, because those calls go through eve rather than this client. A cost figure that silently covers half the run is worse than no figure — this branch has already shipped two defects where prose claimed something the code did not do.

- [ ] **Step 3: Verify with the existing stub dry run**

The script already has a stub-driven test path. Extend a stub response to carry a `usage` block and assert the cost lines render, so this is covered without a live call.

- [ ] **Step 4: Run tests, lint, commit**

```bash
cd packages/knowledge && bun test && bunx tsc --noEmit
bunx --bun ultracite check packages/knowledge
git add packages/knowledge/scripts/eval-extraction.ts packages/knowledge/__tests__/
git commit -m "feat(knowledge): report what an eval run cost"
```

---

### Task 7: Wire the cron callers

**Files:**
- Modify: `apps/api/app/cron/knowledge-pipeline/route.ts`
- Modify: `apps/api/app/cron/knowledge-consolidation/route.ts`

- [ ] **Step 1: Pass a recorder to each gateway client**

Both routes already have a `db`. Replace `createGatewayGenerate()` with:

```ts
const generate = createGatewayGenerate({ onUsage: createUsageRecorder(db) });
```

Read each route first — `knowledge-pipeline/route.ts:44` constructs it inline inside the `sweepPipeline` call, `knowledge-consolidation/route.ts:20` assigns it to a local first. Match what is there.

- [ ] **Step 2: Verify**

```bash
cd apps/api && bunx tsc --noEmit
cd ../../packages/knowledge && bun test
```

- [ ] **Step 3: Update the spec's Capture section**

`docs/superpowers/specs/2026-08-04-model-spend-tracking-design.md` describes `onUsage` receiving the tenant from a client-scoped config. That is wrong — one `generate` is shared across all tenants in a sweep, so the context is per-call. Correct the Capture section to match what was built. Do not append a contradiction; fix the sentences.

- [ ] **Step 4: Lint and commit**

```bash
bunx --bun ultracite check packages/knowledge apps/api
git add apps/api docs/superpowers/specs/2026-08-04-model-spend-tracking-design.md
git commit -m "feat(api): record pipeline spend from the cron sweeps"
```

---

## Self-review

**Spec coverage.** Capture → Task 1. Storage + TTL → Task 2. Recording and per-tenant attribution → Task 3. Rerank estimate → Task 4. Reporting (both modes) → Task 5. Eval cost → Task 6. Cron wiring → Task 7. Out-of-scope items (tenant UI, quotas, chat attribution, autoEmbed/AssemblyAI, billing reconciliation) have no tasks, correctly.

**Type consistency.** `GatewayUsage` and `UsageContext` (Task 1) are used unchanged in Tasks 3, 4, 6, 7. `usageOperationValues` (Task 2) supplies `operation` in Task 3 and is asserted in Task 5's pipeline test. `createUsageRecorder` (Task 3) is what Task 7 passes.

**Known soft spots, flagged not hidden:**
- Task 3 Step 4 names the three call sites but not their exact local variable names; the implementer must read each function. This is deliberate — guessing identifiers in a plan is how a plan produces confidently wrong code.
- Task 5 Step 3 leaves the CLI-split decision to the implementer, with the C1 precedent stated. Either answer is defensible; silently repeating C1 is not.
- The rerank rate constant will go stale. It is isolated to one exported constant with a dated comment, and every row it produces is flagged `estimated`.

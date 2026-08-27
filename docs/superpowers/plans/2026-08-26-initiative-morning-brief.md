# Initiative Loop v1 — Morning Brief Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A weekday cron that emails each enabled tenant a deterministic "morning brief" (last-24h captures, waiting reviews, going-quiet contacts) built entirely from existing data — the product's first outbound loop.

**Architecture:** A new `initiative.ts` module in `@repo/knowledge` (gather → compose → sweep, side-effects injected), two new operational collections (`initiativeSettings`, `initiativeDeliveries`) with claim-then-send idempotency, and a thin cron route in `apps/api` following the `knowledge-consolidation` pattern. No LLM, no eve, no new dependencies.

**Tech Stack:** TypeScript (strict, NodeNext), MongoDB driver 7 via `@repo/knowledge`, Zod v4, Bun test runner, Resend via `@repo/email`, Vercel Cron.

**Spec:** `docs/superpowers/specs/2026-08-26-one-truth-three-projections-four-loops-design.md` (§5 is the contract this plan implements)

## Global Constraints

- Run all knowledge-package commands from `packages/knowledge/`; run api commands from `apps/api/`.
- DB-backed tests need `MONGODB_TEST_URI`; they must skip cleanly without it (`describe.skipIf(!uri)`, house pattern — see `__tests__/review.test.ts`).
- Every Mongo index leads with `tenantId` (house rule; see `collections.ts` header comment).
- Zod v4 idioms: `z.email()`, `z.enum([...] as const)`, spread `baseDocFields` from `schemas/shared.ts`.
- Do not import `@repo/email` at module scope anywhere reachable by tests — it validates env when the module loads. Lazy-import inside the send closure (pattern: `packages/auth/emails.ts`).
- Comments explain *why*, matching house density; no narrating-the-next-line comments.
- Attention-budget rules are hard product rules (spec §5): no news → no send; going-quiet alone → no send; at most one send per tenant per UTC day.
- Commit format: conventional (`feat(knowledge): …`), each ending with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- Biome via ultracite: `bun run fix` at repo root before each commit if the linter complains.

---

### Task 1: Schemas and collections

**Files:**
- Create: `packages/knowledge/schemas/initiative.ts`
- Modify: `packages/knowledge/collections.ts` (interface, `getCollections`, `ensureIndexes`)
- Modify: `packages/knowledge/index.ts` (barrel exports)
- Test: `packages/knowledge/__tests__/initiative.test.ts` (new file; later tasks append to it)

**Interfaces:**
- Consumes: `baseDocFields`, `zodObjectId` from `schemas/shared.ts`.
- Produces (later tasks rely on these exact names):
  - `initiativeSettingsSchema` / type `InitiativeSettings = { _id, tenantId, createdAt, updatedAt, enabled: boolean, recipients: string[] }`
  - `deliveryOutcomeValues = ["claimed", "sent", "no-news", "failed"] as const`
  - `initiativeDeliverySchema` / type `InitiativeDelivery = { _id, tenantId, createdAt, updatedAt, date: string, outcome: DeliveryOutcome, recipients: string[], error?: string }`
  - `KnowledgeCollections` gains `initiativeSettings: Collection<InitiativeSettings>` and `initiativeDeliveries: Collection<InitiativeDelivery>`.

- [ ] **Step 1: Write the failing test**

Create `packages/knowledge/__tests__/initiative.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { ObjectId } from "mongodb";
import {
  deliveryOutcomeValues,
  initiativeDeliverySchema,
  initiativeSettingsSchema,
} from "../schemas/initiative";

const now = () => ({ createdAt: new Date(), updatedAt: new Date() });

describe("initiativeSettingsSchema", () => {
  test("accepts an enabled tenant with recipients", () => {
    const parsed = initiativeSettingsSchema.parse({
      _id: new ObjectId(),
      ...now(),
      enabled: true,
      recipients: ["founder@example.com"],
      tenantId: "tenant-a",
    });
    expect(parsed.enabled).toBe(true);
  });

  test("rejects empty recipients", () => {
    const result = initiativeSettingsSchema.safeParse({
      _id: new ObjectId(),
      ...now(),
      enabled: true,
      recipients: [],
      tenantId: "tenant-a",
    });
    expect(result.success).toBe(false);
  });

  test("rejects a non-email recipient", () => {
    const result = initiativeSettingsSchema.safeParse({
      _id: new ObjectId(),
      ...now(),
      enabled: true,
      recipients: ["not-an-email"],
      tenantId: "tenant-a",
    });
    expect(result.success).toBe(false);
  });
});

describe("initiativeDeliverySchema", () => {
  test("accepts a claimed delivery", () => {
    const parsed = initiativeDeliverySchema.parse({
      _id: new ObjectId(),
      ...now(),
      date: "2026-08-26",
      outcome: "claimed",
      recipients: [],
      tenantId: "tenant-a",
    });
    expect(parsed.outcome).toBe("claimed");
  });

  test("rejects a malformed date key", () => {
    const result = initiativeDeliverySchema.safeParse({
      _id: new ObjectId(),
      ...now(),
      date: "26.08.2026",
      outcome: "sent",
      recipients: [],
      tenantId: "tenant-a",
    });
    expect(result.success).toBe(false);
  });

  test("outcome enum is exactly the four lifecycle states", () => {
    expect(deliveryOutcomeValues).toEqual([
      "claimed",
      "sent",
      "no-news",
      "failed",
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/knowledge && bun test initiative`
Expected: FAIL — cannot resolve `../schemas/initiative`.

- [ ] **Step 3: Write the schemas**

Create `packages/knowledge/schemas/initiative.ts`:

```ts
import { z } from "zod";
import { baseDocFields } from "./shared";

// Operational collections for the initiative loop (spec §5). These are not
// knowledge: nothing here is extracted, reviewed, or erased — settings say who
// wants outbound mail, deliveries record that we sent (or deliberately did not
// send) it. Both live in the knowledge DB because the sweep is tenant-scoped
// the same way every knowledge query is.

export const initiativeSettingsSchema = z.object({
  ...baseDocFields,
  enabled: z.boolean(),
  // Stored directly rather than resolved from the auth DB at send time: the
  // cron must not depend on a second database to deliver mail (spec §10).
  recipients: z.array(z.email()).min(1),
});
export type InitiativeSettings = z.infer<typeof initiativeSettingsSchema>;

export const deliveryOutcomeValues = [
  "claimed",
  "sent",
  "no-news",
  "failed",
] as const;
export type DeliveryOutcome = (typeof deliveryOutcomeValues)[number];

export const initiativeDeliverySchema = z.object({
  ...baseDocFields,
  // UTC day key; combined with tenantId it seeds the deterministic _id that
  // makes "at most one send per tenant per day" an insert-time guarantee.
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  error: z.string().optional(),
  outcome: z.enum(deliveryOutcomeValues),
  recipients: z.array(z.string()),
});
export type InitiativeDelivery = z.infer<typeof initiativeDeliverySchema>;
```

- [ ] **Step 4: Wire the collections**

In `packages/knowledge/collections.ts`:

Add to the imports:

```ts
import type {
  InitiativeDelivery,
  InitiativeSettings,
} from "./schemas/initiative";
```

Add to `KnowledgeCollections` (keep alphabetical position after `facts`):

```ts
  initiativeDeliveries: Collection<InitiativeDelivery>;
  initiativeSettings: Collection<InitiativeSettings>;
```

Add to the `getCollections` object literal:

```ts
  initiativeDeliveries: db.collection<InitiativeDelivery>(
    "initiativeDeliveries"
  ),
  initiativeSettings: db.collection<InitiativeSettings>("initiativeSettings"),
```

In `ensureIndexes`, add both to the destructuring and append to the `Promise.all` array:

```ts
    initiativeSettings.createIndexes([
      { key: { tenantId: 1 }, name: "tenant", unique: true },
    ]),
    initiativeDeliveries.createIndexes([
      // The deterministic _id already dedupes; this serves "what did we send
      // this tenant lately" reads.
      { key: { tenantId: 1, date: -1 }, name: "tenant_date" },
    ]),
```

- [ ] **Step 5: Export from the barrel**

In `packages/knowledge/index.ts`, after the `inbound` exports (alphabetical by module path), add:

```ts
export type {
  DeliveryOutcome,
  InitiativeDelivery,
  InitiativeSettings,
} from "./schemas/initiative";
export {
  deliveryOutcomeValues,
  initiativeDeliverySchema,
  initiativeSettingsSchema,
} from "./schemas/initiative";
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `cd packages/knowledge && bun test initiative && bun run typecheck`
Expected: PASS (6 tests), clean typecheck. Also run `bun test collections` — the existing index test must still pass with the two new collections.

- [ ] **Step 7: Commit**

```bash
git add packages/knowledge/schemas/initiative.ts packages/knowledge/collections.ts packages/knowledge/index.ts packages/knowledge/__tests__/initiative.test.ts
git commit -m "feat(knowledge): initiative settings and delivery collections

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Gather the morning-brief data

**Files:**
- Create: `packages/knowledge/initiative.ts`
- Test: `packages/knowledge/__tests__/initiative.test.ts` (append)

**Interfaces:**
- Consumes: `getCollections` (Task 1 shape), `currentlyValidFilter` from `schemas/facts`, `truncatePreview` from `receipt.ts`.
- Produces (Tasks 3–4 rely on these exact names):

```ts
export const COLD_AFTER_DAYS = 28;
export const GOING_COLD_LIMIT = 3;
export const CAPTURE_PREVIEW_LIMIT = 3;

export interface MorningBriefData {
  captures: {
    count: number;
    newFactCount: number;
    latest: { excerpt: string | null; type: string; when: Date }[];
  };
  reviewQueue: {
    contradictionCount: number;
    count: number;
    oldestCreatedAt: Date | null;
  };
  goingCold: { lastActivity: Date; name: string; personId: ObjectId }[];
}

export const gatherMorningBriefData: (
  db: Db,
  tenantId: string,
  now: Date
) => Promise<MorningBriefData>;
```

- [ ] **Step 1: Write the failing tests**

Append to `packages/knowledge/__tests__/initiative.test.ts`:

```ts
import { MongoClient } from "mongodb";
import { getCollections } from "../collections";
import { gatherMorningBriefData } from "../initiative";

const uri = process.env.MONGODB_TEST_URI;
const TENANT = "tenant-a";
const OTHER_TENANT = "tenant-b";
const NOW = new Date("2026-08-26T05:00:00Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const at = (msAgo: number) => new Date(NOW.getTime() - msAgo);

describe.skipIf(!uri)("gatherMorningBriefData", () => {
  const client = new MongoClient(uri ?? "mongodb://localhost:27017");
  const db = client.db("knowledge_test_initiative_gather");

  beforeAll(async () => {
    await client.connect();
    await db.dropDatabase();
    const { facts, people, proposals, sources } = getCollections(db);
    const doc = (msAgo: number) => ({
      createdAt: at(msAgo),
      updatedAt: at(msAgo),
    });

    const fresh = new ObjectId();
    const cold = new ObjectId();
    const colder = new ObjectId();
    await people.insertMany([
      { _id: fresh, ...doc(90 * DAY), name: "Frida Frisch", tenantId: TENANT },
      { _id: cold, ...doc(90 * DAY), name: "Karl Kalt", tenantId: TENANT },
      { _id: colder, ...doc(90 * DAY), name: "Elke Eis", tenantId: TENANT },
    ]);
    await facts.insertMany([
      // Fresh activity (2 days) — must not appear in goingCold. Also created
      // inside the 24h window? No: createdAt 2 days ago, so newFactCount
      // counts only the one below.
      {
        _id: new ObjectId(),
        ...doc(2 * DAY),
        anchors: { personId: fresh },
        category: "preference",
        confidence: 0.9,
        confirmedBy: "reviewer",
        sourceId: new ObjectId(),
        tenantId: TENANT,
        text: "Frida bevorzugt Vormittagstermine.",
      },
      // Confirmed 1h ago → newFactCount = 1.
      {
        _id: new ObjectId(),
        ...doc(1 * HOUR),
        anchors: { personId: fresh },
        category: "logistics",
        confidence: 0.9,
        confirmedBy: "reviewer",
        sourceId: new ObjectId(),
        tenantId: TENANT,
        text: "Frida ist diese Woche in Berlin.",
      },
      // 40 days cold.
      {
        _id: new ObjectId(),
        ...doc(40 * DAY),
        anchors: { personId: cold },
        category: "background",
        confidence: 0.8,
        confirmedBy: "reviewer",
        sourceId: new ObjectId(),
        tenantId: TENANT,
        text: "Karl leitet den Einkauf.",
      },
      // 60 days cold — oldest first in the result.
      {
        _id: new ObjectId(),
        ...doc(60 * DAY),
        anchors: { personId: colder },
        category: "background",
        confidence: 0.8,
        confirmedBy: "reviewer",
        sourceId: new ObjectId(),
        tenantId: TENANT,
        text: "Elke entscheidet über Budgets.",
      },
      // Superseded 90-day fact for the fresh person must not drag her cold.
      {
        _id: new ObjectId(),
        ...doc(90 * DAY),
        anchors: { personId: fresh },
        category: "preference",
        confidence: 0.9,
        confirmedBy: "reviewer",
        sourceId: new ObjectId(),
        supersededBy: new ObjectId(),
        tenantId: TENANT,
        text: "Frida bevorzugte Nachmittage.",
      },
    ]);
    await sources.insertMany([
      {
        _id: new ObjectId(),
        ...doc(2 * HOUR),
        capturedBy: "user-1",
        content: "Notiz aus dem Kundengespräch mit Karl.",
        status: "reviewed",
        tenantId: TENANT,
        type: "manual",
      },
      {
        _id: new ObjectId(),
        ...doc(3 * HOUR),
        capturedBy: "user-1",
        status: "received",
        tenantId: TENANT,
        type: "voice",
      },
      // Outside the 24h window.
      {
        _id: new ObjectId(),
        ...doc(30 * HOUR),
        capturedBy: "user-1",
        content: "Alte Notiz.",
        status: "reviewed",
        tenantId: TENANT,
        type: "manual",
      },
      // Other tenant, inside the window — must not leak.
      {
        _id: new ObjectId(),
        ...doc(1 * HOUR),
        capturedBy: "user-9",
        content: "Fremder Mandant.",
        status: "received",
        tenantId: OTHER_TENANT,
        type: "manual",
      },
    ]);
    await proposals.insertMany([
      {
        _id: new ObjectId(),
        ...doc(5 * DAY),
        entityDrafts: [],
        factDrafts: [],
        kind: "ingestion",
        status: "open",
        tenantId: TENANT,
      },
      {
        _id: new ObjectId(),
        ...doc(1 * DAY),
        entityDrafts: [],
        factDrafts: [],
        kind: "contradiction",
        status: "open",
        tenantId: TENANT,
      },
      // Skipped → not reviewable, excluded from the count.
      {
        _id: new ObjectId(),
        ...doc(1 * DAY),
        entityDrafts: [],
        factDrafts: [],
        kind: "ingestion",
        skipReason: "nothing worth recording",
        status: "open",
        tenantId: TENANT,
      },
      // Resolved → excluded.
      {
        _id: new ObjectId(),
        ...doc(10 * DAY),
        entityDrafts: [],
        factDrafts: [],
        kind: "ingestion",
        status: "resolved",
        tenantId: TENANT,
      },
    ]);
  });

  afterAll(async () => {
    await client.close();
  });

  test("counts captures and new facts inside the 24h window", async () => {
    const data = await gatherMorningBriefData(db, TENANT, NOW);
    expect(data.captures.count).toBe(2);
    expect(data.captures.newFactCount).toBe(1);
    expect(data.captures.latest).toHaveLength(2);
    expect(data.captures.latest[0]?.type).toBe("manual");
    expect(data.captures.latest[0]?.excerpt).toContain("Kundengespräch");
    expect(data.captures.latest[1]?.excerpt).toBeNull();
  });

  test("counts reviewable proposals with oldest age and contradictions", async () => {
    const data = await gatherMorningBriefData(db, TENANT, NOW);
    expect(data.reviewQueue.count).toBe(2);
    expect(data.reviewQueue.contradictionCount).toBe(1);
    expect(data.reviewQueue.oldestCreatedAt?.getTime()).toBe(
      at(5 * DAY).getTime()
    );
  });

  test("lists cold people oldest-first from currently valid facts only", async () => {
    const data = await gatherMorningBriefData(db, TENANT, NOW);
    expect(data.goingCold.map((p) => p.name)).toEqual([
      "Elke Eis",
      "Karl Kalt",
    ]);
  });

  test("is tenant-isolated", async () => {
    const data = await gatherMorningBriefData(db, OTHER_TENANT, NOW);
    expect(data.captures.count).toBe(1);
    expect(data.reviewQueue.count).toBe(0);
    expect(data.goingCold).toEqual([]);
  });
});
```

Merge the new imports into the existing import lines at the top of the file (`beforeAll`, `afterAll` from `bun:test`; `MongoClient` from `mongodb`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/knowledge && bun test initiative`
Expected: FAIL — cannot resolve `../initiative`. (Without `MONGODB_TEST_URI` the new describe skips; export the URI for this milestone's work.)

- [ ] **Step 3: Implement the gatherer**

Create `packages/knowledge/initiative.ts`:

```ts
import type { Db, ObjectId } from "mongodb";
import { getCollections } from "./collections";
import { truncatePreview } from "./receipt";
import { currentlyValidFilter } from "./schemas/facts";

// The initiative loop, increment ① (spec §5): the morning brief. Everything
// here is deterministic — outbound mail quotes captured material, and captured
// material is untrusted input, so composition stays a pure function instead of
// an LLM call. Side effects (mail, clock) are injected the way process-source
// injects generate/transcribe.

export const COLD_AFTER_DAYS = 28;
export const GOING_COLD_LIMIT = 3;
export const CAPTURE_PREVIEW_LIMIT = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface MorningBriefData {
  captures: {
    count: number;
    latest: { excerpt: string | null; type: string; when: Date }[];
    newFactCount: number;
  };
  goingCold: { lastActivity: Date; name: string; personId: ObjectId }[];
  reviewQueue: {
    contradictionCount: number;
    count: number;
    oldestCreatedAt: Date | null;
  };
}

export const gatherMorningBriefData = async (
  db: Db,
  tenantId: string,
  now: Date
): Promise<MorningBriefData> => {
  const { facts, people, proposals, sources } = getCollections(db);
  const since = new Date(now.getTime() - DAY_MS);
  const coldBefore = new Date(now.getTime() - COLD_AFTER_DAYS * DAY_MS);

  const inWindow = { createdAt: { $gte: since }, tenantId };
  const reviewable = {
    skipReason: { $exists: false },
    status: "open" as const,
    tenantId,
  };

  const [captureCount, latestSources, newFactCount] = await Promise.all([
    sources.countDocuments(inWindow),
    sources
      .find(inWindow, {
        projection: { content: 1, createdAt: 1, type: 1 },
        sort: { createdAt: -1 },
      })
      .limit(CAPTURE_PREVIEW_LIMIT)
      .toArray(),
    facts.countDocuments(inWindow),
  ]);

  const [reviewCount, contradictionCount, oldestOpen] = await Promise.all([
    proposals.countDocuments(reviewable),
    proposals.countDocuments({ ...reviewable, kind: "contradiction" }),
    proposals.findOne(reviewable, {
      projection: { createdAt: 1 },
      sort: { createdAt: 1 },
    }),
  ]);

  // Latest currently-valid fact activity per person. Sources carry no entity
  // anchors, so facts are the only recency signal — which means an unreviewed
  // backlog reads as coldness until trust tiers land (spec §5, known limit).
  const coldRows = (await facts
    .aggregate([
      {
        $match: {
          "anchors.personId": { $exists: true },
          ...currentlyValidFilter,
          tenantId,
        },
      },
      {
        $group: {
          _id: "$anchors.personId",
          lastActivity: { $max: { $ifNull: ["$validFrom", "$createdAt"] } },
        },
      },
      { $match: { lastActivity: { $lte: coldBefore } } },
      { $sort: { lastActivity: 1 } },
      { $limit: GOING_COLD_LIMIT },
    ])
    .toArray()) as { _id: ObjectId; lastActivity: Date }[];

  const coldPeople = await people
    .find(
      { _id: { $in: coldRows.map((row) => row._id) }, tenantId },
      { projection: { name: 1 } }
    )
    .toArray();
  const nameOf = new Map(
    coldPeople.map((person) => [person._id.toHexString(), person.name])
  );

  return {
    captures: {
      count: captureCount,
      latest: latestSources.map((source) => ({
        excerpt: source.content ? truncatePreview(source.content) : null,
        type: source.type,
        when: source.createdAt,
      })),
      newFactCount,
    },
    goingCold: coldRows.flatMap((row) => {
      const name = nameOf.get(row._id.toHexString());
      return name
        ? [{ lastActivity: row.lastActivity, name, personId: row._id }]
        : [];
    }),
    reviewQueue: {
      contradictionCount,
      count: reviewCount,
      oldestCreatedAt: oldestOpen?.createdAt ?? null,
    },
  };
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/knowledge && bun test initiative && bun run typecheck`
Expected: PASS (all describes), clean typecheck.

- [ ] **Step 5: Commit**

```bash
git add packages/knowledge/initiative.ts packages/knowledge/__tests__/initiative.test.ts
git commit -m "feat(knowledge): gather morning-brief data per tenant

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Compose the morning brief

**Files:**
- Modify: `packages/knowledge/initiative.ts` (append)
- Test: `packages/knowledge/__tests__/initiative.test.ts` (append)

**Interfaces:**
- Consumes: `MorningBriefData` (Task 2).
- Produces (Task 4 relies on these exact names):

```ts
export interface MorningBriefEmail {
  html: string;
  subject: string;
  text: string;
}
export const composeMorningBrief: (
  data: MorningBriefData,
  options: { appOrigin: string; now: Date }
) => MorningBriefEmail | null;
```

- [ ] **Step 1: Write the failing tests**

Append to `packages/knowledge/__tests__/initiative.test.ts` (pure — runs without a DB):

```ts
import { composeMorningBrief } from "../initiative";

const NO_NEWS = {
  captures: { count: 0, latest: [], newFactCount: 0 },
  goingCold: [],
  reviewQueue: { contradictionCount: 0, count: 0, oldestCreatedAt: null },
};

describe("composeMorningBrief", () => {
  const options = { appOrigin: "https://app.example.com", now: NOW };

  test("returns null when there is no news", () => {
    expect(composeMorningBrief(NO_NEWS, options)).toBeNull();
  });

  test("going-quiet alone never triggers a send", () => {
    const email = composeMorningBrief(
      {
        ...NO_NEWS,
        goingCold: [
          {
            lastActivity: at(40 * DAY),
            name: "Karl Kalt",
            personId: new ObjectId(),
          },
        ],
      },
      options
    );
    expect(email).toBeNull();
  });

  test("composes subject, text and html with review link", () => {
    const email = composeMorningBrief(
      {
        captures: {
          count: 2,
          latest: [
            { excerpt: "Notiz aus dem Gespräch", type: "manual", when: at(2 * HOUR) },
            { excerpt: null, type: "voice", when: at(3 * HOUR) },
          ],
          newFactCount: 1,
        },
        goingCold: [
          {
            lastActivity: at(40 * DAY),
            name: "Karl Kalt",
            personId: new ObjectId(),
          },
        ],
        reviewQueue: {
          contradictionCount: 1,
          count: 3,
          oldestCreatedAt: at(5 * DAY),
        },
      },
      options
    );
    expect(email?.subject).toBe(
      "Morning brief: 2 new captures · 3 waiting for review"
    );
    expect(email?.text).toContain("https://app.example.com/review");
    expect(email?.text).toContain("Karl Kalt");
    expect(email?.text).toContain("40 days");
    expect(email?.text).toContain("1 contradiction");
    expect(email?.html).toContain("Notiz aus dem Gespräch");
  });

  test("escapes captured material in html", () => {
    const email = composeMorningBrief(
      {
        ...NO_NEWS,
        captures: {
          count: 1,
          latest: [
            { excerpt: "<script>alert(1)</script>", type: "manual", when: at(HOUR) },
          ],
          newFactCount: 0,
        },
      },
      options
    );
    expect(email?.html).not.toContain("<script>");
    expect(email?.html).toContain("&lt;script&gt;");
  });

  test("singularizes counts", () => {
    const email = composeMorningBrief(
      {
        ...NO_NEWS,
        captures: { count: 1, latest: [], newFactCount: 1 },
      },
      options
    );
    expect(email?.subject).toBe("Morning brief: 1 new capture");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/knowledge && bun test initiative`
Expected: FAIL — `composeMorningBrief` is not exported.

- [ ] **Step 3: Implement the composer**

Append to `packages/knowledge/initiative.ts`:

```ts
export interface MorningBriefEmail {
  html: string;
  subject: string;
  text: string;
}

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const plural = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

const daysAgo = (from: Date, now: Date): number =>
  Math.max(0, Math.floor((now.getTime() - from.getTime()) / DAY_MS));

const typeLabels: Record<string, string> = {
  email: "Forwarded email",
  manual: "Note",
  voice: "Voice memo",
};

export const composeMorningBrief = (
  data: MorningBriefData,
  { appOrigin, now }: { appOrigin: string; now: Date }
): MorningBriefEmail | null => {
  const { captures, goingCold, reviewQueue } = data;

  // The attention budget (spec §5): silence is a feature. Going-quiet alone
  // would fire daily forever about the same cold trio, so it only rides along
  // when something actually happened.
  const hasNews =
    captures.count > 0 || captures.newFactCount > 0 || reviewQueue.count > 0;
  if (!hasNews) {
    return null;
  }

  const subjectParts: string[] = [];
  if (captures.count > 0) {
    subjectParts.push(`${plural(captures.count, "new capture")}`);
  }
  if (reviewQueue.count > 0) {
    subjectParts.push(`${reviewQueue.count} waiting for review`);
  }
  if (subjectParts.length === 0) {
    subjectParts.push(`${plural(captures.newFactCount, "new fact")}`);
  }
  const subject = `Morning brief: ${subjectParts.join(" · ")}`;

  const textLines: string[] = [];
  const htmlBlocks: string[] = [];

  if (captures.count > 0 || captures.newFactCount > 0) {
    textLines.push("Captured in the last 24 hours");
    textLines.push(
      `${plural(captures.count, "capture")}, ${plural(captures.newFactCount, "new confirmed fact")}.`
    );
    const captureItems = captures.latest.map((capture) => {
      const label = typeLabels[capture.type] ?? capture.type;
      return capture.excerpt ? `${label}: "${capture.excerpt}"` : label;
    });
    textLines.push(...captureItems.map((item) => `- ${item}`), "");
    htmlBlocks.push(
      `<h2>Captured in the last 24 hours</h2><p>${plural(captures.count, "capture")}, ${plural(captures.newFactCount, "new confirmed fact")}.</p><ul>${captureItems
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join("")}</ul>`
    );
  }

  if (reviewQueue.count > 0) {
    const oldest = reviewQueue.oldestCreatedAt
      ? `, oldest ${plural(daysAgo(reviewQueue.oldestCreatedAt, now), "day")} old`
      : "";
    const contradictions =
      reviewQueue.contradictionCount > 0
        ? ` ${plural(reviewQueue.contradictionCount, "contradiction")} await${reviewQueue.contradictionCount === 1 ? "s" : ""} resolution.`
        : "";
    const line = `${plural(reviewQueue.count, "item")} waiting${oldest}.${contradictions}`;
    textLines.push("Waiting for you", line, `${appOrigin}/review`, "");
    htmlBlocks.push(
      `<h2>Waiting for you</h2><p>${escapeHtml(line)} <a href="${appOrigin}/review">Open the review queue</a></p>`
    );
  }

  if (goingCold.length > 0) {
    textLines.push("Going quiet");
    const coldItems = goingCold.map(
      (person) =>
        `${person.name} — ${plural(daysAgo(person.lastActivity, now), "day")} since the last confirmed activity`
    );
    textLines.push(...coldItems.map((item) => `- ${item}`), "");
    htmlBlocks.push(
      `<h2>Going quiet</h2><ul>${coldItems
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join("")}</ul>`
    );
  }

  textLines.push(`Open memorynine: ${appOrigin}/`);
  htmlBlocks.push(
    `<p><a href="${appOrigin}/">Open memorynine</a></p><p style="color:#6b7280;font-size:12px">You receive this because morning briefs are enabled for your workspace.</p>`
  );

  return {
    html: htmlBlocks.join(""),
    subject,
    text: textLines.join("\n"),
  };
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/knowledge && bun test initiative && bun run typecheck`
Expected: PASS, clean typecheck.

- [ ] **Step 5: Commit**

```bash
git add packages/knowledge/initiative.ts packages/knowledge/__tests__/initiative.test.ts
git commit -m "feat(knowledge): deterministic morning-brief composition

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: The sweep — claim, compose, send, record

**Files:**
- Modify: `packages/knowledge/initiative.ts` (append)
- Modify: `packages/knowledge/index.ts` (barrel: add module exports)
- Test: `packages/knowledge/__tests__/initiative.test.ts` (append)

**Interfaces:**
- Consumes: Tasks 1–3 plus `deterministicId` from `idempotency.ts`.
- Produces (Task 5 relies on these exact names):

```ts
export type SendMorningBrief = (email: {
  html: string;
  subject: string;
  text: string;
  to: string[];
}) => Promise<void>;

export interface MorningBriefSweepReport {
  alreadyDelivered: number;
  failed: number;
  failures: string[];
  noNews: number;
  sent: number;
}

export const runMorningBriefSweep: (
  db: Db,
  options: { appOrigin: string; now: Date; send: SendMorningBrief }
) => Promise<MorningBriefSweepReport>;
```

- [ ] **Step 1: Write the failing tests**

Append to `packages/knowledge/__tests__/initiative.test.ts`:

```ts
import { runMorningBriefSweep } from "../initiative";

describe.skipIf(!uri)("runMorningBriefSweep", () => {
  const client = new MongoClient(uri ?? "mongodb://localhost:27017");
  const db = client.db("knowledge_test_initiative_sweep");
  const sent: { subject: string; to: string[] }[] = [];
  const send = async (email: { subject: string; to: string[] }) => {
    sent.push({ subject: email.subject, to: email.to });
  };
  const options = { appOrigin: "https://app.example.com", now: NOW, send };

  beforeAll(async () => {
    await client.connect();
  });

  beforeEach(async () => {
    await db.dropDatabase();
    sent.length = 0;
    const { initiativeSettings, sources } = getCollections(db);
    const doc = (msAgo: number) => ({
      createdAt: at(msAgo),
      updatedAt: at(msAgo),
    });
    await initiativeSettings.insertMany([
      {
        _id: new ObjectId(),
        ...doc(30 * DAY),
        enabled: true,
        recipients: ["a@example.com"],
        tenantId: TENANT,
      },
      {
        _id: new ObjectId(),
        ...doc(30 * DAY),
        enabled: true,
        recipients: ["b@example.com"],
        tenantId: OTHER_TENANT,
      },
      {
        _id: new ObjectId(),
        ...doc(30 * DAY),
        enabled: false,
        recipients: ["c@example.com"],
        tenantId: "tenant-disabled",
      },
    ]);
    // Only TENANT has news; OTHER_TENANT is quiet; disabled has news that
    // must never send.
    await sources.insertMany([
      {
        _id: new ObjectId(),
        ...doc(2 * HOUR),
        capturedBy: "u",
        content: "Frische Notiz",
        status: "received",
        tenantId: TENANT,
        type: "manual",
      },
      {
        _id: new ObjectId(),
        ...doc(2 * HOUR),
        capturedBy: "u",
        content: "Sollte nie ankommen",
        status: "received",
        tenantId: "tenant-disabled",
        type: "manual",
      },
    ]);
  });

  afterAll(async () => {
    await client.close();
  });

  test("sends to enabled tenants with news, records outcomes", async () => {
    const report = await runMorningBriefSweep(db, options);
    expect(report).toEqual({
      alreadyDelivered: 0,
      failed: 0,
      failures: [],
      noNews: 1,
      sent: 1,
    });
    expect(sent).toEqual([
      {
        subject: "Morning brief: 1 new capture",
        to: ["a@example.com"],
      },
    ]);
    const { initiativeDeliveries } = getCollections(db);
    const outcomes = await initiativeDeliveries
      .find({}, { projection: { outcome: 1, tenantId: 1 } })
      .toArray();
    expect(
      outcomes.map((d) => [d.tenantId, d.outcome]).sort()
    ).toEqual([
      [OTHER_TENANT, "no-news"],
      [TENANT, "sent"],
    ]);
  });

  test("second run on the same day delivers nothing", async () => {
    await runMorningBriefSweep(db, options);
    sent.length = 0;
    const report = await runMorningBriefSweep(db, options);
    expect(sent).toEqual([]);
    expect(report.sent).toBe(0);
    expect(report.alreadyDelivered).toBe(2);
  });

  test("one tenant's send failure never blocks another's", async () => {
    const failingSend = async (email: { to: string[] }) => {
      if (email.to[0] === "a@example.com") {
        throw new Error("mailbox on fire");
      }
      await send(email as never);
    };
    const report = await runMorningBriefSweep(db, {
      ...options,
      send: failingSend as never,
    });
    expect(report.failed).toBe(1);
    expect(report.failures[0]).toContain(TENANT);
    expect(report.failures[0]).toContain("mailbox on fire");
    expect(report.noNews).toBe(1);
    const { initiativeDeliveries } = getCollections(db);
    const failedDelivery = await initiativeDeliveries.findOne({
      tenantId: TENANT,
    });
    expect(failedDelivery?.outcome).toBe("failed");
    expect(failedDelivery?.error).toContain("mailbox on fire");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/knowledge && bun test initiative`
Expected: FAIL — `runMorningBriefSweep` is not exported.

- [ ] **Step 3: Implement the sweep**

Append to `packages/knowledge/initiative.ts` (extend the imports at the top of the file):

```ts
import { MongoServerError } from "mongodb";
import { deterministicId } from "./idempotency";
import type { DeliveryOutcome } from "./schemas/initiative";
```

```ts
export type SendMorningBrief = (email: {
  html: string;
  subject: string;
  text: string;
  to: string[];
}) => Promise<void>;

export interface MorningBriefSweepReport {
  alreadyDelivered: number;
  failed: number;
  failures: string[];
  noNews: number;
  sent: number;
}

// Claim-then-send: inserting the deterministic delivery row IS the day's lock.
// A crash between claim and send costs that tenant one brief; the alternative
// (send-then-record) risks a double send on retry, which is worse for a
// product whose whole pitch is respecting attention (spec §5).
const claimDelivery = async (
  db: Db,
  tenantId: string,
  date: string,
  now: Date
): Promise<boolean> => {
  const { initiativeDeliveries } = getCollections(db);
  try {
    await initiativeDeliveries.insertOne({
      _id: deterministicId(`morning-brief:${tenantId}:${date}`),
      createdAt: now,
      date,
      outcome: "claimed",
      recipients: [],
      tenantId,
      updatedAt: now,
    });
    return true;
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11_000) {
      return false;
    }
    throw error;
  }
};

const recordOutcome = async (
  db: Db,
  tenantId: string,
  date: string,
  now: Date,
  outcome: DeliveryOutcome,
  extra: { error?: string; recipients?: string[] } = {}
): Promise<void> => {
  const { initiativeDeliveries } = getCollections(db);
  await initiativeDeliveries.updateOne(
    { _id: deterministicId(`morning-brief:${tenantId}:${date}`) },
    { $set: { ...extra, outcome, updatedAt: now } }
  );
};

export const runMorningBriefSweep = async (
  db: Db,
  {
    appOrigin,
    now,
    send,
  }: { appOrigin: string; now: Date; send: SendMorningBrief }
): Promise<MorningBriefSweepReport> => {
  const { initiativeSettings } = getCollections(db);
  const date = now.toISOString().slice(0, 10);
  const report: MorningBriefSweepReport = {
    alreadyDelivered: 0,
    failed: 0,
    failures: [],
    noNews: 0,
    sent: 0,
  };

  const enabled = await initiativeSettings.find({ enabled: true }).toArray();
  for (const settings of enabled) {
    const { recipients, tenantId } = settings;
    // Sequential on purpose: tenant counts are small, and one slow tenant
    // holding a connection beats a burst of parallel aggregation load at
    // 05:00 UTC.
    if (!(await claimDelivery(db, tenantId, date, now))) {
      report.alreadyDelivered += 1;
      continue;
    }
    try {
      const data = await gatherMorningBriefData(db, tenantId, now);
      const email = composeMorningBrief(data, { appOrigin, now });
      if (!email) {
        report.noNews += 1;
        await recordOutcome(db, tenantId, date, now, "no-news");
        continue;
      }
      await send({ ...email, to: recipients });
      report.sent += 1;
      await recordOutcome(db, tenantId, date, now, "sent", { recipients });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      report.failed += 1;
      report.failures.push(`${tenantId}: ${message}`);
      await recordOutcome(db, tenantId, date, now, "failed", {
        error: message,
      });
    }
  }
  return report;
};
```

- [ ] **Step 4: Export the module from the barrel**

In `packages/knowledge/index.ts`, add (alphabetical by module path, near the `inbound` block):

```ts
export type {
  MorningBriefData,
  MorningBriefEmail,
  MorningBriefSweepReport,
  SendMorningBrief,
} from "./initiative";
export {
  CAPTURE_PREVIEW_LIMIT,
  COLD_AFTER_DAYS,
  composeMorningBrief,
  gatherMorningBriefData,
  GOING_COLD_LIMIT,
  runMorningBriefSweep,
} from "./initiative";
```

- [ ] **Step 5: Run the full package suite**

Run: `cd packages/knowledge && bun test && bun run typecheck`
Expected: PASS across the package (including `public-api.test.ts`, which may assert on barrel exports — if it enumerates them, add the new exports there following its existing pattern).

- [ ] **Step 6: Commit**

```bash
git add packages/knowledge/initiative.ts packages/knowledge/index.ts packages/knowledge/__tests__/initiative.test.ts
git commit -m "feat(knowledge): morning-brief sweep with claim-then-send idempotency

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Cron route and schedule

**Files:**
- Create: `apps/api/app/cron/morning-brief/route.ts`
- Modify: `apps/api/vercel.json` (crons array)
- Test: `apps/api/__tests__/morning-brief-route.test.ts`

**Interfaces:**
- Consumes: `runMorningBriefSweep`, `SendMorningBrief` (Task 4), `getKnowledgeDb` from `@repo/knowledge/client`, `requireCronSecret` from `../auth`, `appOrigin` from `@repo/auth/emails`, `resend` from `@repo/email` (lazy).
- Produces: `GET /cron/morning-brief`, JSON `MorningBriefSweepReport`, 207 on partial failure.

- [ ] **Step 1: Write the failing test**

Create `apps/api/__tests__/morning-brief-route.test.ts`:

```ts
import { afterEach, describe, expect, test } from "bun:test";

// The route must be importable with no mail or DB env: @repo/email validates
// env at module load, so the route may only lazy-import it inside the send
// closure (pattern: packages/auth/emails.ts).
import { GET } from "../app/cron/morning-brief/route";

const originalSecret = process.env.CRON_SECRET;
const originalFrom = process.env.RESEND_FROM;

afterEach(() => {
  process.env.CRON_SECRET = originalSecret;
  process.env.RESEND_FROM = originalFrom;
});

describe("GET /cron/morning-brief", () => {
  test("503 when CRON_SECRET is unset (fail closed)", async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(new Request("http://api/cron/morning-brief"));
    expect(response.status).toBe(503);
  });

  test("401 on a wrong bearer token", async () => {
    process.env.CRON_SECRET = "right";
    const response = await GET(
      new Request("http://api/cron/morning-brief", {
        headers: { authorization: "Bearer wrong" },
      })
    );
    expect(response.status).toBe(401);
  });

  test("503 when RESEND_FROM is unset (fail closed before any work)", async () => {
    process.env.CRON_SECRET = "right";
    delete process.env.RESEND_FROM;
    const response = await GET(
      new Request("http://api/cron/morning-brief", {
        headers: { authorization: "Bearer right" },
      })
    );
    expect(response.status).toBe(503);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && bun test morning-brief`
Expected: FAIL — cannot resolve `../app/cron/morning-brief/route`.

- [ ] **Step 3: Implement the route**

Create `apps/api/app/cron/morning-brief/route.ts`:

```ts
import { appOrigin } from "@repo/auth/emails";
import { runMorningBriefSweep, type SendMorningBrief } from "@repo/knowledge";
import { getKnowledgeDb } from "@repo/knowledge/client";
import { requireCronSecret } from "../auth";

// The initiative loop's first delivery surface (spec §5): one deterministic
// email per enabled tenant per weekday. Mail volume scales with tenants, not
// data, so the consolidation cron's duration budget is more than enough.
export const maxDuration = 300;

export const GET = async (request: Request) => {
  const unauthorized = requireCronSecret(request);
  if (unauthorized) {
    return unauthorized;
  }

  // Same fail-closed posture as CRON_SECRET: an unconfigured sender must
  // close the route, not send from "".
  const from = process.env.RESEND_FROM;
  if (!from) {
    return new Response("RESEND_FROM is not configured", { status: 503 });
  }

  const send: SendMorningBrief = async (email) => {
    // Lazy: @repo/email validates its env at module scope, and this route
    // must stay importable (tests, builds) without mail credentials.
    const { resend } = await import("@repo/email");
    const { error } = await resend.emails.send({ from, ...email });
    if (error) {
      throw new Error(error.message);
    }
  };

  const report = await runMorningBriefSweep(getKnowledgeDb(), {
    appOrigin: appOrigin(),
    now: new Date(),
    send,
  });

  return Response.json(report, {
    status: report.failures.length > 0 ? 207 : 200,
  });
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && bun test morning-brief`
Expected: PASS (3 tests).

- [ ] **Step 5: Register the cron**

In `apps/api/vercel.json`, append to the `crons` array (Vercel evaluates cron in UTC; 05:00 UTC = 07:00 CEST, weekdays only per spec §5):

```json
    {
      "path": "/cron/morning-brief",
      "schedule": "0 5 * * 1-5"
    }
```

- [ ] **Step 6: Run the api suite and typecheck**

Run: `cd apps/api && bun test && bunx tsc --noEmit`
Expected: PASS / clean. (If `apps/api` has no `typecheck` script, the `tsc --noEmit` form is the check.)

- [ ] **Step 7: Commit**

```bash
git add apps/api/app/cron/morning-brief/route.ts apps/api/vercel.json apps/api/__tests__/morning-brief-route.test.ts
git commit -m "feat(api): morning-brief cron route, weekdays 05:00 UTC

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Beta enablement script

**Files:**
- Create: `packages/knowledge/scripts/enable-morning-brief.ts`
- Modify: `packages/knowledge/package.json` (scripts)

**Interfaces:**
- Consumes: `getKnowledgeDb` from `../client`, `ensureIndexes` + `getCollections` (Task 1), `initiativeSettingsSchema` (Task 1).
- Produces: `bun enable-morning-brief <tenantId> <email> [email...]` — upserts a tenant's settings. (DB-backed enablement from day one; the deploy-time env-JSON pattern is exactly what this design retires.)

- [ ] **Step 1: Write the script**

Create `packages/knowledge/scripts/enable-morning-brief.ts`:

```ts
import { ObjectId } from "mongodb";
import { ensureIndexes, getCollections } from "../collections";
import { getKnowledgeDb } from "../client";
import { initiativeSettingsSchema } from "../schemas/initiative";

// Beta onboarding for the morning brief (spec §5): settings live in the DB so
// enabling a tenant is an operation, not a deploy. Usage:
//   bun enable-morning-brief <tenantId> <email> [email...]
// Re-running replaces the recipient list. Disable by hand for now:
//   db.initiativeSettings.updateOne({ tenantId }, { $set: { enabled: false } })

const [tenantId, ...recipients] = process.argv.slice(2);
if (!tenantId || recipients.length === 0) {
  console.error(
    "usage: bun enable-morning-brief <tenantId> <email> [email...]"
  );
  process.exit(1);
}

const now = new Date();
// Parse a full candidate document so bad emails fail here, loudly, instead of
// at 05:00 UTC in the sweep.
const candidate = initiativeSettingsSchema.parse({
  _id: new ObjectId(),
  createdAt: now,
  enabled: true,
  recipients,
  tenantId,
  updatedAt: now,
});

const db = getKnowledgeDb();
await ensureIndexes(db);
const { initiativeSettings } = getCollections(db);
const result = await initiativeSettings.updateOne(
  { tenantId },
  {
    $set: {
      enabled: candidate.enabled,
      recipients: candidate.recipients,
      updatedAt: now,
    },
    $setOnInsert: {
      _id: candidate._id,
      createdAt: now,
      tenantId,
    },
  },
  { upsert: true }
);
console.log(
  `${result.upsertedCount === 1 ? "enabled" : "updated"} morning brief for ${tenantId} → ${recipients.join(", ")}`
);
process.exit(0);
```

- [ ] **Step 2: Register the package script**

In `packages/knowledge/package.json`, add to `scripts` (alphabetical order):

```json
    "enable-morning-brief": "bun scripts/enable-morning-brief.ts",
```

- [ ] **Step 3: Verify usage errors and typecheck**

Run: `cd packages/knowledge && bun enable-morning-brief 2>&1 | head -2 && bun run typecheck`
Expected: the usage line (exit 1, no DB touched), then a clean typecheck.

- [ ] **Step 4: Run the full monorepo gate**

Run: from the repo root, `bun run check && bun test`
Expected: Biome clean (run `bun run fix` for autofixables), all workspaces green.

- [ ] **Step 5: Commit**

```bash
git add packages/knowledge/scripts/enable-morning-brief.ts packages/knowledge/package.json
git commit -m "chore(knowledge): beta enablement script for morning briefs

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Plan self-review (performed at write time)

- **Spec coverage (§5):** trigger data → Task 2; attention-budget rules → Task 3 (no-news, going-quiet-alone) and Task 4 (one-per-day claim); composition/escaping/English/links → Task 3; delivery via Resend + `RESEND_FROM` fail-closed → Task 5; settings collection + seeding script → Tasks 1 and 6; delivery recording + failure isolation + 207 → Tasks 4–5; schedule `0 5 * * 1-5` → Task 5. Not in ① (LLM, Knock, per-user opt-in, timezones) — correctly absent.
- **Placeholder scan:** every code step carries complete code; no TBDs.
- **Type consistency:** `MorningBriefData` / `composeMorningBrief(data, {appOrigin, now})` / `SendMorningBrief` / `MorningBriefSweepReport` names and shapes match across Tasks 2–5; `deliveryOutcomeValues` spelling matches Task 1 ↔ Task 4 (`"no-news"`).
- **Known judgment call, flagged for the executor:** `__tests__/initiative.test.ts` accumulates imports across Tasks 2–4 — merge them into the existing import statements rather than duplicating; Biome will flag duplicates. If `public-api.test.ts` enumerates barrel exports, extend it in Task 4 Step 5 following its own pattern.

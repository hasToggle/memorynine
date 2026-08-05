# Lossless Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop extraction from silently discarding output — one malformed fact should not destroy a whole reply, and a skip should be visible and reversible rather than terminal.

**Architecture:** Parsing validates each draft individually and records the rejects. A skip writes a zero-draft proposal carrying its reason instead of closing the source. Proposal ids become generation-scoped so a source can be extracted more than once, which makes re-extraction possible from the review UI and from a bulk operator script.

**Tech Stack:** Bun test runner, MongoDB driver 7.x, Zod v4, Next.js 16 App Router server actions.

**Spec:** `docs/superpowers/specs/2026-08-05-lossless-extraction-design.md`
**Branch:** `Kheirah/lossless-extraction`

## Global Constraints

- Lint scoped, never the root one: `bunx --bun ultracite check packages/knowledge apps/app`. The root `bun run check` has ~497 pre-existing errors in files this branch never touched (finding F6). Do not fix them.
- Biome/ultracite enforces `useSortedKeys` — write object literals alphabetically sorted.
- Repo is `noUncheckedIndexedAccess`-strict: index access yields `T | undefined`.
- **Naming is fixed and must not drift.** `sourceSchema` already has `extractionAttempts` — the *failure budget*, incremented on error, reset on success. The new counter is `extractionGeneration` on both the source and the proposal. Nothing new may be called `attempt`.
- **Extraction proposes; it never discards.** Any code path that drops model output must record what it dropped and why.
- Knowledge DB tests need `MONGODB_TEST_URI` and the `knowledge-test-mongo` Docker container; they skip cleanly without it. New pure-logic tests must NOT need it.
- Do not touch consolidation. It merges with zero information loss; it is not being given a discard power.

---

### Task 1: Partial-tolerant parsing

**Files:**
- Modify: `packages/knowledge/extraction.ts`
- Test: `packages/knowledge/__tests__/extraction.test.ts`

**Interfaces:**
- Produces: `RejectedDraft`, `rejectedDraftSchema`, and a widened `ParsedExtraction` whose `proposal` variant carries `rejected: RejectedDraft[]`. Tasks 2, 3 and 7 depend on these names.

- [ ] **Step 1: Write the failing tests**

The fixture is the verbatim reply that failed in the live eval run — three facts, the third with an array-valued `personId` the schema cannot express. Do not "correct" it.

```ts
const SOURCE_13_REPLY = JSON.stringify({
  entities: [],
  facts: [
    {
      anchors: { organizationId: "a10000000000000000000001", personId: "a20000000000000000000004" },
      category: "relationship",
      confidence: 0.8,
      supersedes: [],
      text: "Martin Kowalski verantwortet bei Hafenlogistik Nord GmbH seit letzter Woche zusätzlich die Verhandlung der Rahmenverträge mit Lieferanten.",
    },
    {
      anchors: { organizationId: "a10000000000000000000001" },
      category: "logistics",
      confidence: 0.7,
      supersedes: [],
      text: "Die Rahmenverträge mit Lieferanten werden bei Hafenlogistik Nord künftig quartalsweise überprüft.",
    },
    {
      // Two people in one fact. factAnchorsSchema allows exactly one.
      anchors: {
        engagementId: "a30000000000000000000003",
        organizationId: "a10000000000000000000003",
        personId: ["a20000000000000000000006", "a20000000000000000000007"],
      },
      category: "logistics",
      confidence: 0.8,
      supersedes: [],
      text: "Für Prozessoptimierung Fertigung bei Vogelsang Maschinenbau ist ein wöchentliches Steering-Meeting mit Katrin Suhrbier und Bjarne Petersen angedacht.",
    },
  ],
});

describe("parseExtractionResponse — partial tolerance", () => {
  test("keeps the valid facts and reports the rejected one", () => {
    const parsed = parseExtractionResponse(SOURCE_13_REPLY);
    expect(parsed.kind).toBe("proposal");
    if (parsed.kind !== "proposal") { throw new Error("expected a proposal"); }
    expect(parsed.facts).toHaveLength(2);
    expect(parsed.rejected).toHaveLength(1);
    // The reason must name the offending field, or a reviewer cannot act on it.
    expect(parsed.rejected[0]?.reason).toContain("personId");
    // The raw draft is preserved verbatim so nothing is lost.
    expect(parsed.rejected[0]?.raw).toMatchObject({ category: "logistics" });
  });

  test("all drafts rejected is a FAILURE, not a skip", () => {
    // A failure consumes the retry budget and runs again; a skip is terminal.
    // Malformed output deserves a retry, judged-empty does not.
    const allBad = JSON.stringify({ facts: [{ text: "x" }, { text: "y" }] });
    const parsed = parseExtractionResponse(allBad);
    expect(parsed.kind).toBe("failure");
  });

  test("an explicit skip is unchanged", () => {
    const parsed = parseExtractionResponse('{"skip": true, "reason": "Terminchatter"}');
    expect(parsed).toEqual({ kind: "skip", reason: "Terminchatter" });
  });

  test("an empty proposal is still a skip", () => {
    const parsed = parseExtractionResponse('{"entities": [], "facts": []}');
    expect(parsed.kind).toBe("skip");
  });

  test("a narration fragment with no recognized key is still rejected", () => {
    // The anti-narration guard: with loose objects plus defaults, ANY {} would
    // validate as an empty proposal. A live DeepSeek run once turned a
    // narration fragment into a false skip exactly that way.
    expect(parseExtractionResponse("Ich denke nach... {} ...fertig").kind).toBe("failure");
  });

  test("the real reply still wins over an echoed prompt example", () => {
    // extractLastValidObject keeps the LAST schema-valid object. Loosening the
    // element types must not let an earlier echo beat the real answer.
    const echo = '{"entities": [], "facts": []}';
    const real = JSON.stringify({ facts: [{
      anchors: { organizationId: "a10000000000000000000001" },
      category: "logistics", confidence: 0.5, text: "Echt.",
    }] });
    const parsed = parseExtractionResponse(`${echo}\nblah\n${real}`);
    expect(parsed.kind).toBe("proposal");
    if (parsed.kind !== "proposal") { throw new Error("expected a proposal"); }
    expect(parsed.facts).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to confirm they fail**

Run: `cd packages/knowledge && bun test __tests__/extraction.test.ts`
Expected: FAIL — `rejected` does not exist on the proposal variant.

- [ ] **Step 3: Implement**

Add the reject type and a loose envelope, then validate elements individually:

```ts
export const rejectedDraftSchema = z.object({
  /** Why it failed validation, from the Zod error. Must name the field. */
  reason: z.string().min(1),
  /** What the model emitted, verbatim, so a reviewer can read it. */
  raw: z.unknown(),
});
export type RejectedDraft = z.infer<typeof rejectedDraftSchema>;

// Loose ONLY in the element types. Still a strictObject union that requires a
// recognized key, because that is what stops a bare `{}` in the narration
// validating as an empty proposal.
const looseExtractionSchema = z.union([
  z.strictObject({ reason: z.string().default(""), skip: z.literal(true) }),
  z
    .strictObject({
      entities: z.array(z.unknown()).optional(),
      facts: z.array(z.unknown()).optional(),
    })
    .refine((data) => data.entities !== undefined || data.facts !== undefined, {
      message: "A proposal needs an entities or facts key",
    }),
]);
```

`parseExtractionResponse` becomes: strip fences → refusal gate (unchanged) →
`extractLastValidObject(text, looseExtractionSchema)` → if undefined, failure
(unchanged) → if `skip`, skip (unchanged) → otherwise validate each element:

```ts
const entities: LlmEntityDraft[] = [];
const facts: LlmFactDraft[] = [];
const rejected: RejectedDraft[] = [];

for (const raw of data.entities ?? []) {
  const result = llmEntityDraftSchema.safeParse(raw);
  if (result.success) { entities.push(result.data); }
  else { rejected.push({ raw, reason: describeZodError(result.error) }); }
}
// …same for facts against llmFactDraftSchema…

// Nothing usable at all: an empty reply is a skip, but a reply whose every
// draft was malformed is a FAILURE — it deserves a retry, unlike a judgment
// that there was nothing to record.
if (entities.length === 0 && facts.length === 0) {
  return rejected.length > 0
    ? { kind: "failure", reason: `every draft failed validation: ${rejected.map((r) => r.reason).join("; ")}` }
    : { kind: "skip", reason: "empty proposal" };
}
return { entities, facts, kind: "proposal", rejected };
```

Write `describeZodError` as a small local helper producing `path: message`
pairs joined by `, ` — the test requires the reason to contain `personId`, so
the path must be included, not just the message.

- [ ] **Step 4: Run the tests**

Run: `cd packages/knowledge && bun test __tests__/extraction.test.ts`
Expected: PASS. Then run the whole package — `parseExtractionResponse` has
existing callers and tests: `bun test`.

- [ ] **Step 5: Lint and commit**

```bash
bunx --bun ultracite check packages/knowledge
git add packages/knowledge/extraction.ts packages/knowledge/__tests__/extraction.test.ts
git commit -m "fix(knowledge): keep the valid facts when one draft is malformed"
```

---

### Task 2: Schema changes

**Files:**
- Modify: `packages/knowledge/schemas/proposals.ts`
- Modify: `packages/knowledge/schemas/sources.ts`
- Modify: `packages/knowledge/index.ts`
- Test: `packages/knowledge/__tests__/proposals.test.ts`

**Interfaces:**
- Consumes: `rejectedDraftSchema` (Task 1)
- Produces: `proposalSchema` with `skipReason`, `extractionGeneration`, `hint`, `rejectedDrafts`, and `status: "open" | "resolved" | "superseded"`; `sourceSchema` with `extractionGeneration`. Tasks 3–7 depend on these.

- [ ] **Step 1: Write the failing tests**

```ts
describe("proposalSchema — lossless extraction fields", () => {
  const base = {
    _id: new ObjectId(), createdAt: new Date(), entityDrafts: [], factDrafts: [],
    kind: "ingestion" as const, status: "open" as const,
    tenantId: "t1", updatedAt: new Date(),
  };

  test("accepts a skip proposal: a reason, no drafts", () => {
    const parsed = proposalSchema.parse({ ...base, skipReason: "Terminchatter" });
    expect(parsed.skipReason).toBe("Terminchatter");
  });

  test("skipReason is absent — not false, not null — on an ordinary proposal", () => {
    // listOpenProposals filters on { $exists: false }, so an explicitly
    // present undefined would silently hide every ordinary proposal.
    expect(proposalSchema.parse(base)).not.toHaveProperty("skipReason");
  });

  test("accepts superseded, which resolved must not be overloaded to mean", () => {
    expect(() => proposalSchema.parse({ ...base, status: "superseded" })).not.toThrow();
  });

  test("rejects an unknown status", () => {
    expect(() => proposalSchema.parse({ ...base, status: "archived" })).toThrow();
  });

  test("carries rejected drafts with a readable reason", () => {
    const parsed = proposalSchema.parse({
      ...base,
      rejectedDrafts: [{ raw: { text: "x" }, reason: "anchors.personId: expected string" }],
    });
    expect(parsed.rejectedDrafts?.[0]?.reason).toContain("personId");
  });

  test("extractionGeneration is a positive integer when present", () => {
    expect(() => proposalSchema.parse({ ...base, extractionGeneration: 2 })).not.toThrow();
    expect(() => proposalSchema.parse({ ...base, extractionGeneration: 0 })).toThrow();
  });
});
```

Add one to the sources test file asserting `sourceSchema` accepts
`extractionGeneration: 2` and rejects `0`.

- [ ] **Step 2: Run to confirm they fail**

Run: `cd packages/knowledge && bun test __tests__/proposals.test.ts`
Expected: FAIL — unknown keys / `superseded` not in the enum.

- [ ] **Step 3: Implement**

In `proposalSchema`, add — keeping keys alphabetically sorted:

```ts
/** Which extraction pass produced this. 1 for the original. Absent on
 *  consolidation and contradiction proposals, which have no generation. */
extractionGeneration: z.number().int().min(1).optional(),
/** Reviewer-supplied context for this pass, when a re-extraction asked for it. */
hint: z.string().min(1).optional(),
/** Drafts the model produced that failed validation. Recorded rather than
 *  dropped, so a reviewer can see what extraction could not use. */
rejectedDrafts: z.array(rejectedDraftSchema).optional(),
/** Present ⇒ extraction judged there was nothing worth recording; drafts are
 *  empty. Absent on every ordinary proposal — listOpenProposals filters on
 *  { $exists: false }. */
skipReason: z.string().min(1).optional(),
```

and widen `status` to `z.enum(["open", "resolved", "superseded"])`.

In `sourceSchema` add:

```ts
/** How many times extraction has deliberately been run on this source.
 *  NOT extractionAttempts, which is the failure budget for retries. */
extractionGeneration: z.number().int().min(1).optional(),
```

Export `rejectedDraftSchema` and `RejectedDraft` from `index.ts` in the
correct alphabetical block.

- [ ] **Step 4: Run tests and typecheck**

Run: `cd packages/knowledge && bun test && bunx tsc --noEmit`
Then `cd ../../apps/app && bunx tsc --noEmit` — it consumes `Proposal`, and a
widened status enum can break an exhaustive switch.

- [ ] **Step 5: Lint and commit**

```bash
bunx --bun ultracite check packages/knowledge
git add packages/knowledge/schemas packages/knowledge/index.ts packages/knowledge/__tests__
git commit -m "feat(knowledge): proposal fields for skips, rejects and generations"
```

---

### Task 3: A skip writes a proposal, and ids become generation-scoped

**Files:**
- Modify: `packages/knowledge/extraction-run.ts`
- Modify: `packages/knowledge/extraction.ts` (the `hint` prompt parameter)
- Test: `packages/knowledge/__tests__/run-extraction.test.ts`

**Interfaces:**
- Consumes: Tasks 1 and 2
- Produces: `proposalIdFor(tenantId, sourceId, generation): ObjectId`, exported so Task 4 and the tests can derive the same id. `RunExtractionOptions` gains `hint?: string`.

- [ ] **Step 1: Write the failing tests**

These need a database — follow the existing conventions in this file, which
skip without `MONGODB_TEST_URI`.

```ts
test("generation 1 keeps the id it has today, so existing proposals are not orphaned", () => {
  const tenantId = "t1";
  const sourceId = new ObjectId();
  expect(proposalIdFor(tenantId, sourceId, 1).toHexString()).toBe(
    deterministicId(`${tenantId}:${sourceId.toHexString()}:extraction`).toHexString()
  );
});

test("generation 2 gets a distinct id", () => {
  const tenantId = "t1";
  const sourceId = new ObjectId();
  expect(proposalIdFor(tenantId, sourceId, 2).toHexString()).not.toBe(
    proposalIdFor(tenantId, sourceId, 1).toHexString()
  );
});
```

Plus DB-backed tests: a skip now writes a proposal with `skipReason`, zero
drafts and `extractionGeneration: 1`, and leaves the source on `"proposed"`
(not `"reviewed"`); and a proposal carrying rejected drafts persists them.

- [ ] **Step 2: Run to confirm they fail**

Run: `cd packages/knowledge && bun test __tests__/run-extraction.test.ts`
Expected: FAIL — `proposalIdFor` is not exported.

- [ ] **Step 3: Implement**

```ts
/**
 * Proposal identity is per (source, generation). Generation 1 deliberately
 * keeps the original seed so every proposal written before re-extraction
 * existed keeps its id; only later generations get a suffix.
 */
export const proposalIdFor = (
  tenantId: string,
  sourceId: ObjectId,
  generation: number
): ObjectId =>
  deterministicId(
    generation <= 1
      ? `${tenantId}:${sourceId.toHexString()}:extraction`
      : `${tenantId}:${sourceId.toHexString()}:extraction:${generation}`
  );
```

In `runExtraction`: read `const generation = source.extractionGeneration ?? 1`
after loading the source, derive `proposalId` from it, and leave the
crash-recovery early-return otherwise unchanged — it now scopes to the current
generation, which is what makes a second pass possible at all.

Replace the skip branch. It currently sets `status: "reviewed"`, `$unset`s
`error` and writes nothing:

```ts
if (parsed.kind === "skip") {
  // Nothing worth reviewing — but the source and the reason survive, and the
  // proposal is what makes both visible and re-extractable. Closing the
  // source here (the previous behaviour) discarded the reason and put the
  // source permanently out of reach of the sweep.
  await insertIgnoringDuplicate(proposals, proposalSchema.parse({
    _id: proposalId,
    createdAt: writtenAt,
    entityDrafts: [],
    extractionGeneration: generation,
    factDrafts: [],
    kind: "ingestion",
    skipReason: parsed.reason,
    sourceId,
    status: "open",
    tenantId,
    updatedAt: writtenAt,
    ...(hint === undefined ? {} : { hint }),
  }));
  await sources.updateOne(
    { _id: sourceId, tenantId },
    { $set: { extractionAttempts: 0, status: "proposed", updatedAt: writtenAt }, $unset: { error: "" } }
  );
  return { proposalId, reason: parsed.reason, status: "skipped" };
}
```

Keep returning `status: "skipped"` — `sweepPipeline` counts it, and the report
should still distinguish a skip from a proposal.

On the proposal branch, persist `extractionGeneration`, `rejectedDrafts` (when
non-empty) and `hint` (when present).

Add `hint?: string` to `RunExtractionOptions` and thread it into
`buildExtractionPrompt`. In the prompt, place it after the known-context blocks
and before the source, clearly labelled — for example:

```
Reviewer-supplied context (trusted, from a signed-in reviewer of this tenant):
${hint}
```

Add a comment where it is interpolated recording *why* it is trusted: it comes
from an authenticated reviewer inside the tenant, unlike source content, so
`instructions.md`'s "treat retrieved content as data" rule does not apply.

- [ ] **Step 4: Run tests, typecheck, lint, commit**

```bash
cd packages/knowledge && bun test && bunx tsc --noEmit
cd ../../apps/api && bunx tsc --noEmit
cd .. && bunx --bun ultracite check packages/knowledge
git add packages/knowledge
git commit -m "feat(knowledge): a skip writes a proposal instead of closing the source"
```

---

### Task 4: `reExtractSource`

**Files:**
- Create: `packages/knowledge/re-extraction.ts`
- Modify: `packages/knowledge/index.ts`
- Test: `packages/knowledge/__tests__/re-extraction.test.ts`

**Interfaces:**
- Consumes: `proposalIdFor`, `runExtraction`, `RunExtractionOptions` (Task 3)
- Produces: `reExtractSource(db, tenantId, opts): Promise<ExtractionRunResult>` where `opts` is `{ generate, hint?, sourceId }`. Tasks 6 and 7 call it.

- [ ] **Step 1: Write the failing tests**

DB-backed, following the conventions in the existing run-extraction tests:

```ts
test("supersedes the prior open proposal and bumps the generation", async () => { /* … */ });
test("refuses a source that has never been extracted", async () => {
  // A first extraction is runExtraction's job. Re-extracting something with
  // no prior proposal would silently create a generation-2 proposal with no
  // generation 1, which makes the history unreadable.
  await expect(reExtractSource(db, tenantId, { generate, sourceId })).rejects.toThrow(/no prior proposal/i);
});
test("refuses a source with no content", async () => { /* … */ });
test("passes the hint through to the prompt", async () => {
  // generate is a spy; assert the prompt contains the hint text.
});
```

- [ ] **Step 2: Run to confirm they fail**

Run: `cd packages/knowledge && bun test __tests__/re-extraction.test.ts`
Expected: FAIL — cannot resolve `../re-extraction`.

- [ ] **Step 3: Implement**

```ts
export interface ReExtractSourceOptions {
  generate: RunExtractionOptions["generate"];
  /** Optional. Re-running against a knowledge base that has since grown
   *  entities is valuable with no hint at all — that is the bulk case. */
  hint?: string;
  sourceId: ObjectId;
}

export const reExtractSource = async (
  db: Db,
  tenantId: string,
  { generate, hint, sourceId }: ReExtractSourceOptions
): Promise<ExtractionRunResult> => { /* … */ };
```

Sequence, in this order:

1. Load the source scoped by `{ _id: sourceId, tenantId }`; throw if missing or
   if `!source.content`.
2. Require at least one existing proposal for the source; throw
   `"no prior proposal"` otherwise.
3. `proposals.updateMany({ sourceId, status: "open", tenantId }, { $set: { status: "superseded", updatedAt: now } })`.
   **`superseded`, not `resolved`** — no human resolved it, and `resolvedBy`
   exists to record that they did.
4. `const generation = (source.extractionGeneration ?? 1) + 1;` and write it to
   the source.
5. Reset the source to an extractable resting status — `"transcribed"` for
   `type === "voice"`, `"received"` otherwise — so `guardExtractable` passes.
6. Delegate to `runExtraction(db, tenantId, { generate, hint, sourceId })`,
   which reads the new generation off the source and does everything else.

Export from `index.ts` in the correct alphabetical block.

- [ ] **Step 4: Run tests, typecheck, lint, commit**

```bash
cd packages/knowledge && bun test && bunx tsc --noEmit
cd ../.. && bunx --bun ultracite check packages/knowledge
git add packages/knowledge
git commit -m "feat(knowledge): re-extract a source into a new generation"
```

---

### Task 5: Review queue filtering and a skipped view

**Files:**
- Modify: `apps/app/app/actions/knowledge/list-proposals.ts`
- Modify: `apps/app/app/(authenticated)/review/page.tsx`
- Test: none — these are thin data-shaping wrappers over a driver query; the behaviour worth testing (the filter) is asserted in Task 7's script tests and by manual verification here.

**Interfaces:**
- Produces: `listSkippedProposals(): Promise<ProposalListItem[]>`, and `ProposalListItem` gains `skipReason: string | null` and `rejectedCount: number`.

- [ ] **Step 1: Read the existing files first**

`list-proposals.ts` already filters `{ status: "open", tenantId: orgId }`,
sorts by `createdAt` descending, limits to 100, and joins `sources` for
`sourceType`. Follow that shape exactly rather than restructuring it — in
particular keep the tenant scoping on **both** queries.

- [ ] **Step 2: Add the filter and the second action**

`listOpenProposals` gains `skipReason: { $exists: false }` to its filter.

`listSkippedProposals` is the same query with `skipReason: { $exists: true }`.
Extract the shared body into a local helper taking the extra filter clause, so
the tenant scoping and the source join exist once.

Both return `ProposalListItem` widened with `skipReason: string | null` and
`rejectedCount: number` (from `proposal.rejectedDrafts?.length ?? 0`).

- [ ] **Step 3: Surface it on the page**

`review/page.tsx` currently renders one list. Add a second section below the
open list, headed "Skipped", rendering skipped proposals with their
`skipReason` as the card description. Keep it visually secondary — muted, and
collapsed or clearly separated — because it is a diagnostic view, not work.

Update the empty-state copy: the current text says captured sources "will show
up here once extraction proposes knowledge", which is now only half true.
Mention that sources extraction found nothing in appear under Skipped.

If a proposal has `rejectedCount > 0`, show a badge — this is how F10's
multi-person anchor limitation becomes visible rather than silent.

- [ ] **Step 4: Verify and commit**

```bash
cd apps/app && bunx tsc --noEmit && bun test
cd .. && bunx --bun ultracite check apps/app
git add apps/app
git commit -m "feat(app): show skipped proposals and their reasons"
```

---

### Task 6: Re-extract from the review UI

**Files:**
- Create: `apps/app/app/actions/knowledge/re-extract.ts`
- Modify: `apps/app/app/(authenticated)/review/[id]/page.tsx` and/or its `components/review-form.tsx`
- Test: none automated — see Step 4.

**Interfaces:**
- Consumes: `reExtractSource` (Task 4)
- Produces: a server action `reExtractProposal(proposalId: string, hint?: string)`

- [ ] **Step 1: Read the existing action and form**

`apps/app/app/actions/knowledge/` holds the existing knowledge actions —
follow their `"use server"` + `auth()` + `orgId` guard shape exactly. Read
`review/[id]/page.tsx` and `components/review-form.tsx` before adding UI;
do not invent component names.

- [ ] **Step 2: Write the action**

```ts
"use server";

export const reExtractProposal = async (proposalId: string, hint?: string) => {
  const { orgId } = await auth();
  if (!orgId) { throw new Error("No active organization"); }
  const db = getKnowledgeDb();
  const proposal = await getCollections(db).proposals.findOne({
    _id: new ObjectId(proposalId),
    tenantId: orgId,          // tenant scoping on the lookup, not just the update
  });
  if (!proposal?.sourceId) { throw new Error("Proposal has no source to re-extract"); }
  await reExtractSource(db, orgId, {
    generate: createGatewayGenerate({ onUsage: createUsageRecorder(db) }),
    ...(hint ? { hint } : {}),
    sourceId: proposal.sourceId,
  });
  revalidatePath("/review");
};
```

**`tenantId` comes from the verified session and is used in the lookup filter.**
Taking the proposal id from the client and looking it up unscoped would let any
signed-in user re-extract another tenant's source.

Pass `createUsageRecorder(db)` so re-extraction spend lands in the `usage`
collection like every other extraction — `bun run usage-report --mode=unit`
then shows what re-extraction costs.

- [ ] **Step 3: Add the UI**

On a skipped proposal's detail page, a "Re-extract" control with an optional
one-line context field. Disable it while the action is in flight — this makes a
real model call and takes seconds, and a double-click would spend twice.

- [ ] **Step 4: Verify manually**

There is no automated coverage for a server action that makes a live model
call. Verify by hand and record the result in the report:

```bash
bun dev
# capture a note, run the pipeline:
curl -s -H "authorization: Bearer $CRON_SECRET" http://localhost:3002/cron/knowledge-pipeline
# open /review, find it under Skipped, re-extract with a hint, confirm a new
# proposal appears and the old one left the list
```

- [ ] **Step 5: Commit**

```bash
cd apps/app && bunx tsc --noEmit && bun test
cd .. && bunx --bun ultracite check apps/app
git add apps/app
git commit -m "feat(app): re-extract a skipped source with optional context"
```

---

### Task 7: Bulk re-extraction script

**Files:**
- Create: `packages/knowledge/scripts/re-extract.ts` (pure)
- Create: `packages/knowledge/scripts/re-extract.cli.ts` (entry point)
- Modify: `packages/knowledge/package.json`
- Test: `packages/knowledge/__tests__/re-extract-script.test.ts`

**Interfaces:**
- Consumes: `reExtractSource` (Task 4)
- Produces: `buildSkippedSourcesPipeline(opts)` — a pure, exported aggregation builder so the selector is testable as data.

- [ ] **Step 1: Write the failing test**

```ts
test("selects only sources whose latest proposal was skipped", () => {
  const pipeline = buildSkippedSourcesPipeline({ before: new Date("2026-09-01"), tenantId: "t1" });
  const json = JSON.stringify(pipeline);
  expect(json).toContain("skipReason");
  expect(json).toContain("t1");        // tenant scoping is not optional
});
```

- [ ] **Step 2: Run to confirm it fails, then implement**

**The split is mandatory, not stylistic.** `re-extract.ts` must contain no
`require.main`, no `module`, no `process.argv`, no `process.exit` and no
`MongoClient` — an importable module carrying `require.main === module` once
broke the entire nine-eval suite, because eve bundles authored modules as ESM
where `module` is undefined, and discovery imports every eval before filtering.
The entry point lives in `re-extract.cli.ts`.

CLI contract:

- **Dry run by default.** `--apply` to write.
- **`--limit` is required.** This spends real money per source; refusing to run
  without an explicit bound is the safety rail.
- `--skipped-only` is the only selector. A broader "re-extract everything" would
  create competing proposals for already-reviewed material.
- `--tenant=<id>` optional; without it, all tenants.
- Never print the connection string.
- Report per source: id, generation, outcome, and the reason on a skip.

Follow `scripts/usage-report.cli.ts` and `scripts/seed-evals.cli.ts` for env
reading, error handling and exit codes.

Add `"re-extract": "bun scripts/re-extract.cli.ts"` to `package.json`,
alphabetically among the existing scripts.

- [ ] **Step 3: Verify, lint, commit**

```bash
cd packages/knowledge && bun test && bunx tsc --noEmit
bun scripts/re-extract.cli.ts            # must fail clearly: --limit is required
cd ../.. && bunx --bun ultracite check packages/knowledge
git add packages/knowledge
git commit -m "feat(knowledge): bulk re-extraction for skipped sources"
```

---

### Task 8: Close the findings

**Files:**
- Modify: `docs/knowledge-eval-findings.md`

- [ ] **Step 1: Mark F11 and F12 fixed**

Update each status line and add a resolution note naming the commits, keeping
the original narrative. Correct the sentences in place; do not append a
contradiction below them.

- [ ] **Step 2: Update F10**

F10 (the anchor schema cannot express a fact about two people) is **not** fixed
here, but its symptom is now visible rather than silent — rejected drafts are
recorded on the proposal and badged in the review UI. Add that to F10 so a
future reader knows where to look for real-world evidence of how often it bites
before deciding whether to widen the schema.

- [ ] **Step 3: Commit**

```bash
git add docs/knowledge-eval-findings.md
git commit -m "docs(knowledge): close F11 and F12"
```

---

## Self-review

**Spec coverage.** Part 1 → Task 1. Part 2 → Tasks 2, 3, 5. Part 3 → Tasks 3, 4, 6. Part 4 → Task 7. Testing section → the test steps in Tasks 1–4 and 7. Out-of-scope items (consolidation, manual fact entry, broader bulk selectors, F10's schema widening) have no tasks, correctly. Findings bookkeeping → Task 8.

**Type consistency.** `RejectedDraft`/`rejectedDraftSchema` (Task 1) are consumed by Task 2's `rejectedDrafts` and Task 5's `rejectedCount`. `proposalIdFor` (Task 3) is used by Task 4. `reExtractSource`'s signature (Task 4) matches its callers in Tasks 6 and 7. `extractionGeneration` is the name on both the source and the proposal; nothing is called `attempt`.

**Known soft spots, flagged rather than hidden:**
- Tasks 5 and 6 deliberately do not contain JSX. I have read `review/page.tsx` and `list-proposals.ts` but not `review-form.tsx`, and inventing component names for a file I have not read is how a plan produces confidently wrong code. Both tasks begin by reading the existing files.
- Task 6 has no automated test. A server action that makes a live model call is not usefully unit-testable, and mocking the gateway there would test the mock. Manual verification steps are given instead, and the result must be recorded.
- Task 1's `describeZodError` is specified by its required output (must contain the field path) rather than its implementation, because Zod v4's error shape is worth reading at the time rather than transcribing from memory.

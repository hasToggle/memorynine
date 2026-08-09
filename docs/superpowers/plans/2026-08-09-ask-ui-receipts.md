# Ask UI — Briefs and Receipts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Ask surface keep the promises the landing page's `Trace` component makes — an answer that is already there when you arrive, citations that open a readable receipt, and checked/unchecked distinguishable at a glance.

**Architecture:** Functional core, imperative shell. The two pieces that encode judgment — what a receipt says (`composeReceipt`) and what goes in a brief (`buildBrief`) — are pure functions in `@repo/knowledge`, unit-testable against plain objects with no database. Server actions in `apps/app` do the I/O and feed them. The React layer becomes a thin renderer: chips select, a panel displays.

**Tech Stack:** Bun 1.1.43 (workspaces + test runner), Turborepo, Next.js 16 App Router, React 19, TypeScript 5.9 (strict, NodeNext), MongoDB driver 7.x, Zod v4, Tailwind 4.1, Biome 2.3.1 with ultracite presets, eve (agent runtime).

**Spec:** `docs/superpowers/specs/2026-08-09-ask-ui-receipts-design.md`

## Global Constraints

- **UI chrome is English. Content is not.** Every user-facing string you write in `apps/app` is English. Fact text, source excerpts and the agent's prose stay in the language they were captured in. Do not translate stored content, ever.
- **Do not touch `apps/app/agent/instructions.md`.** Nine eval suites in `apps/app/evals/` depend on the `<fact id="…"/>` / `<source id="…"/>` protocol and on the current wording. This plan changes no part of it.
- **Verdicts and receipt rows are computed, never model-authored.** No LLM call may appear anywhere in this plan.
- **Brief lines are verbatim `fact.text`.** No summarising, translating, compressing or editorialising at render time.
- **Purity means purity.** `composeReceipt` and `buildBrief` take `now: Date` as a parameter. No `new Date()`, no `Date.now()`, no `Math.random()` inside them — they must be deterministic for the tests.
- **Tenant scoping is non-negotiable.** Every Mongo query in a server action filters on `tenantId` from `auth()`, never from a parameter. Follow the existing pattern in `apps/app/app/actions/knowledge/list-people.ts`.
- **Never show a raw identifier.** `fact.confirmedBy` values like `user_ceo1` and `eval-fixture` must resolve to a name or degrade to `"a teammate"`.
- **Biome:** run `bun run fix` before each commit; `bun run check` must be clean. Object keys are alphabetically sorted in this codebase (ultracite's `useSortedKeys`) except where a comment opts out.
- **Tests:** `bun test` from the repo root. The 62 existing tests must stay green. Database-backed tests use the `const uri = process.env.MONGODB_TEST_URI` + `describe.skipIf(!uri)` pattern — see `packages/knowledge/__tests__/dossier.test.ts:15`.
- **`apps/app` has no DOM test setup** (no happy-dom, no testing-library). Do not write tests that render React. Extract logic into pure modules and test those.

---

### Task 1: `composeReceipt` — the receipt composer

The pure function that turns a fact (or a raw source) plus its provenance into the four rows, the quote and the verdict. Everything else in this plan renders its output.

**Files:**
- Create: `packages/knowledge/receipt.ts`
- Test: `packages/knowledge/__tests__/receipt.test.ts`
- Modify: `packages/knowledge/index.ts` (add the export)

**Interfaces:**
- Consumes: `Fact` from `./schemas/facts`, `Source` from `./schemas/sources`.
- Produces: `composeReceipt(input: ComposeReceiptInput): Receipt`, plus the types `Receipt`, `ReceiptRow`, `ReceiptTier`, `ReceiptSource`. Tasks 2, 4, 6 and 7 all depend on these names.

- [ ] **Step 1: Write the failing test**

Create `packages/knowledge/__tests__/receipt.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { ObjectId } from "mongodb";
import { composeReceipt, type ReceiptSource } from "../receipt";
import type { Fact } from "../schemas/facts";

const TENANT = "test-tenant";
const NOW = new Date("2026-08-09T10:00:00Z");

const names: Record<string, string> = {
  "eric@example.com": "Eric Brandt",
  user_marie: "Marie Lang",
};
const nameOf = (key: string) => names[key] ?? "a teammate";

const makeFact = (overrides: Partial<Fact> = {}): Fact =>
  ({
    _id: new ObjectId("6a70f2dac615029be026bab7"),
    anchors: { organizationId: new ObjectId() },
    category: "preference",
    confidence: 0.9,
    confirmedBy: "user_marie",
    createdAt: new Date("2026-03-14T08:00:00Z"),
    sourceId: new ObjectId(),
    tenantId: TENANT,
    text: "Anna Bergmann entscheidet am späten Vormittag.",
    updatedAt: new Date("2026-03-14T08:00:00Z"),
    validFrom: new Date("2026-03-13T00:00:00Z"),
  }) as Fact;

const makeSource = (overrides: Partial<ReceiptSource> = {}): ReceiptSource => ({
  _id: new ObjectId(),
  capturedBy: "eric@example.com",
  createdAt: new Date("2026-03-13T17:20:00Z"),
  excerpt: "…und bitte nichts vor zehn, die Anna macht ihre Entscheidungen am liebsten morgens.",
  occurredAt: new Date("2026-03-13T00:00:00Z"),
  status: "reviewed",
  type: "voice",
  ...overrides,
});

const detail = (receipt: { rows: { detail: string; label: string }[] }, label: string) =>
  receipt.rows.find((row) => row.label === label)?.detail;

describe("composeReceipt — a confirmed, uncontested fact", () => {
  const receipt = composeReceipt({
    contested: false,
    fact: makeFact(),
    nameOf,
    now: NOW,
    source: makeSource(),
  });

  test("is the checked tier and says so out loud", () => {
    expect(receipt.tier).toBe("checked");
    expect(receipt.verdict).toBe("Safe to say out loud.");
  });

  test("cites the fact id, not the source id", () => {
    expect(receipt.id).toBe("6a70f2dac615029be026bab7");
    expect(receipt.kind).toBe("fact");
  });

  test("names where it came from and who captured it", () => {
    expect(detail(receipt, "Where it came from")).toBe("Voice memo, 13 March");
    expect(detail(receipt, "Who captured it")).toBe("Eric Brandt");
  });

  test("names who checked it and when", () => {
    expect(detail(receipt, "Who checked it")).toBe("Marie Lang, 14 March");
  });

  test("counts how long it has stood", () => {
    expect(detail(receipt, "Still good?")).toBe(
      "In place 5 months — nothing has contradicted it."
    );
  });

  test("quotes the source verbatim, in its own language", () => {
    expect(receipt.quote).toContain("bitte nichts vor zehn");
  });
});

describe("composeReceipt — a contested fact", () => {
  const receipt = composeReceipt({
    contested: true,
    fact: makeFact(),
    nameOf,
    now: NOW,
    source: makeSource(),
  });

  test("warns instead of clearing it", () => {
    expect(receipt.tier).toBe("checked-contested");
    expect(receipt.verdict).toBe(
      "Two versions on record. Settle it in Review before you quote it."
    );
    expect(detail(receipt, "Still good?")).toBe(
      "Disagrees with another fact on record — a review is open."
    );
  });
});

describe("composeReceipt — raw material", () => {
  test("an unreviewed source says nobody has checked it", () => {
    const receipt = composeReceipt({
      contested: false,
      nameOf,
      now: NOW,
      source: makeSource({ status: "proposed" }),
    });
    expect(receipt.kind).toBe("source");
    expect(receipt.tier).toBe("raw");
    expect(receipt.verdict).toBe("Worth knowing. Don't quote it to them yet.");
    expect(detail(receipt, "Who checked it")).toBe(
      "Nobody yet — it's in the review queue."
    );
  });

  test("a reviewed source is still raw wording, not a fact", () => {
    const receipt = composeReceipt({
      contested: false,
      nameOf,
      now: NOW,
      source: makeSource({ status: "reviewed" }),
    });
    expect(receipt.tier).toBe("raw-reviewed");
    expect(receipt.verdict).toBe(
      "Reviewed — but this is the raw wording, not a confirmed fact."
    );
  });

  test("an email names its subject", () => {
    const receipt = composeReceipt({
      contested: false,
      nameOf,
      now: NOW,
      source: makeSource({
        email: { subject: "Angebot Nordwind" },
        occurredAt: new Date("2026-07-01T09:00:00Z"),
        type: "email",
      }),
    });
    expect(detail(receipt, "Where it came from")).toBe(
      'Forwarded email — "Angebot Nordwind", 1 July'
    );
  });
});

describe("composeReceipt — degraded provenance", () => {
  test("an unresolvable reviewer is a teammate, never a raw id", () => {
    const receipt = composeReceipt({
      contested: false,
      fact: makeFact({ confirmedBy: "eval-fixture" }),
      nameOf,
      now: NOW,
      source: makeSource(),
    });
    const checked = detail(receipt, "Who checked it") ?? "";
    expect(checked).toContain("a teammate");
    expect(checked).not.toContain("eval-fixture");
  });

  test("a consolidated fact with no source says so and omits the capturer", () => {
    const receipt = composeReceipt({
      contested: false,
      fact: makeFact({ sourceId: undefined }),
      nameOf,
      now: NOW,
    });
    expect(detail(receipt, "Where it came from")).toBe(
      "Merged from earlier facts"
    );
    expect(detail(receipt, "Who captured it")).toBeUndefined();
    expect(receipt.quote).toBeNull();
  });

  test("a fact recorded this month reports a date, not a month count", () => {
    const receipt = composeReceipt({
      contested: false,
      fact: makeFact({ validFrom: new Date("2026-08-02T00:00:00Z") }),
      nameOf,
      now: NOW,
      source: makeSource(),
    });
    expect(detail(receipt, "Still good?")).toBe(
      "Recorded 2 August — nothing has contradicted it yet."
    );
  });

  test("a year-old fact carries its year", () => {
    const receipt = composeReceipt({
      contested: false,
      fact: makeFact(),
      nameOf,
      now: NOW,
      source: makeSource({ occurredAt: new Date("2024-11-05T00:00:00Z") }),
    });
    expect(detail(receipt, "Where it came from")).toBe(
      "Voice memo, 5 November 2024"
    );
  });

  test("a long excerpt is truncated with an ellipsis", () => {
    const receipt = composeReceipt({
      contested: false,
      nameOf,
      now: NOW,
      source: makeSource({ excerpt: "x".repeat(400) }),
    });
    expect(receipt.quote).toHaveLength(281);
    expect(receipt.quote?.endsWith("…")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/knowledge && bun test __tests__/receipt.test.ts`
Expected: FAIL — `Cannot find module '../receipt'`.

- [ ] **Step 3: Write the implementation**

Create `packages/knowledge/receipt.ts`:

```ts
import type { ObjectId } from "mongodb";
import type { Fact } from "./schemas/facts";
import type { Source } from "./schemas/sources";

// What a citation opens. The demo on the marketing site sets the contract:
// four plain-language rows, the original wording, and a verdict the reader can
// act on. Everything here is derived from stored fields — a model that wrote
// "safe to say out loud" would be asserting exactly the kind of unchecked
// claim the citation mechanism exists to prevent.
//
// Two of the demo's labels are deliberately not reproduced. "Who said it"
// implies a speaker, and we store none: `capturedBy` is whoever recorded the
// material, which in the demo's own scenario is the colleague dictating a memo
// about what the client said. See the design spec for the full argument.

export type ReceiptTier =
  | "checked"
  | "checked-contested"
  | "raw"
  | "raw-reviewed";

export interface ReceiptRow {
  detail: string;
  label: string;
}

export interface Receipt {
  id: string;
  kind: "fact" | "source";
  /** The source's own wording, truncated. Null when there is no source. */
  quote: string | null;
  rows: ReceiptRow[];
  tier: ReceiptTier;
  verdict: string;
}

/**
 * The subset of a source a receipt needs. Both `Source` (whole document) and
 * `SourceSearchHit` (the $project'd search result) satisfy it, so callers can
 * pass whichever they already hold.
 */
export interface ReceiptSource {
  _id: ObjectId;
  capturedBy: string;
  content?: string;
  createdAt?: Date;
  email?: { subject: string };
  excerpt?: string;
  occurredAt?: Date;
  status: Source["status"];
  type: Source["type"];
}

export interface ComposeReceiptInput {
  /** An open contradiction proposal supersedes this fact. */
  contested: boolean;
  fact?: Fact;
  /** Resolves a user id or an email to a display name. */
  nameOf: (idOrEmail: string) => string;
  now: Date;
  source?: ReceiptSource;
}

const TYPE_LABELS: Record<ReceiptSource["type"], string> = {
  email: "Forwarded email",
  manual: "Note",
  voice: "Voice memo",
};

/** Matches the hovercard's old budget; the excerpt is already truncated at 1500. */
const PREVIEW_LENGTH = 280;

/**
 * "13 March", or "5 November 2024" once the year stops being obvious. Explicit
 * en-GB so a server in another locale cannot reorder day and month.
 */
const formatDay = (date: Date, now: Date): string =>
  date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    ...(date.getUTCFullYear() === now.getUTCFullYear()
      ? {}
      : { year: "numeric" }),
  });

const wholeMonthsBetween = (from: Date, to: Date): number =>
  (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
  (to.getUTCMonth() - from.getUTCMonth());

const truncate = (text: string): string =>
  text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH)}…` : text;

const quoteOf = (source: ReceiptSource | undefined): string | null => {
  const raw = source?.excerpt ?? source?.content;
  return raw ? truncate(raw) : null;
};

const provenanceRow = (
  source: ReceiptSource | undefined,
  now: Date
): ReceiptRow => {
  if (!source) {
    // Consolidation and contradiction resolutions have `derivedFrom` instead
    // of a source; saying so beats an empty row.
    return { detail: "Merged from earlier facts", label: "Where it came from" };
  }
  const when = source.occurredAt ?? source.createdAt;
  const parts = [TYPE_LABELS[source.type]];
  if (source.email?.subject) {
    parts.push(`— "${source.email.subject}"`);
  }
  const head = parts.join(" ");
  return {
    detail: when ? `${head}, ${formatDay(when, now)}` : head,
    label: "Where it came from",
  };
};

const stillGoodRow = (
  fact: Fact,
  contested: boolean,
  now: Date
): ReceiptRow => {
  if (contested) {
    return {
      detail: "Disagrees with another fact on record — a review is open.",
      label: "Still good?",
    };
  }
  const since = fact.validFrom ?? fact.createdAt;
  const months = wholeMonthsBetween(since, now);
  return {
    detail:
      months >= 1
        ? `In place ${months} month${months === 1 ? "" : "s"} — nothing has contradicted it.`
        : `Recorded ${formatDay(since, now)} — nothing has contradicted it yet.`,
    label: "Still good?",
  };
};

const factReceipt = (
  fact: Fact,
  { contested, nameOf, now, source }: ComposeReceiptInput
): Receipt => {
  const rows: ReceiptRow[] = [provenanceRow(source, now)];
  if (source) {
    rows.push({ detail: nameOf(source.capturedBy), label: "Who captured it" });
  }
  rows.push(
    {
      detail: `${nameOf(fact.confirmedBy)}, ${formatDay(fact.createdAt, now)}`,
      label: "Who checked it",
    },
    stillGoodRow(fact, contested, now)
  );

  return {
    id: fact._id.toHexString(),
    kind: "fact",
    quote: quoteOf(source),
    rows,
    tier: contested ? "checked-contested" : "checked",
    verdict: contested
      ? "Two versions on record. Settle it in Review before you quote it."
      : "Safe to say out loud.",
  };
};

const sourceReceipt = (
  source: ReceiptSource,
  { nameOf, now }: ComposeReceiptInput
): Receipt => {
  const reviewed = source.status === "reviewed";
  return {
    id: source._id.toHexString(),
    kind: "source",
    quote: quoteOf(source),
    rows: [
      provenanceRow(source, now),
      { detail: nameOf(source.capturedBy), label: "Who captured it" },
      {
        detail: reviewed
          ? "Reviewed — a fact was distilled from it."
          : "Nobody yet — it's in the review queue.",
        label: "Who checked it",
      },
      {
        detail: reviewed
          ? "Quote the fact, not this wording."
          : "Nothing has confirmed it yet.",
        label: "Still good?",
      },
    ],
    tier: reviewed ? "raw-reviewed" : "raw",
    verdict: reviewed
      ? "Reviewed — but this is the raw wording, not a confirmed fact."
      : "Worth knowing. Don't quote it to them yet.",
  };
};

/**
 * A fact wins over a source when both are supplied: the fact is the confirmed
 * tier, and the source is its provenance rather than a citation of its own.
 */
export const composeReceipt = (input: ComposeReceiptInput): Receipt => {
  if (input.fact) {
    return factReceipt(input.fact, input);
  }
  if (input.source) {
    return sourceReceipt(input.source, input);
  }
  throw new Error("composeReceipt needs a fact or a source");
};
```

- [ ] **Step 4: Export it from the barrel**

In `packages/knowledge/index.ts`, add alongside the existing exports (keep the file's existing ordering convention):

```ts
export * from "./receipt";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd packages/knowledge && bun test __tests__/receipt.test.ts`
Expected: PASS, 14 tests.

If `In place 5 months` fails, check `wholeMonthsBetween` is using UTC accessors on both dates — a local-time mix will drift by one across a month boundary.

- [ ] **Step 6: Lint and commit**

```bash
bun run fix
git add packages/knowledge/receipt.ts packages/knowledge/__tests__/receipt.test.ts packages/knowledge/index.ts
git commit -m "feat(knowledge): compose a citation receipt from stored provenance"
```

---

### Task 2: `buildBrief` — what goes in a brief, and in what order

**Files:**
- Create: `packages/knowledge/brief.ts`
- Test: `packages/knowledge/__tests__/brief.test.ts`
- Modify: `packages/knowledge/index.ts`

**Interfaces:**
- Consumes: `Fact`, `ReceiptSource` (Task 1), `DossierAnchor` from `./dossier`.
- Produces: `buildBrief(input: BuildBriefInput): Brief`, types `Brief`, `BriefLine`, `BriefAnchor`, and the constants `BRIEF_FACT_LIMIT` (5) and `BRIEF_SOURCE_LIMIT` (2). Tasks 4 and 8 depend on these.

- [ ] **Step 1: Write the failing test**

Create `packages/knowledge/__tests__/brief.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { ObjectId } from "mongodb";
import {
  BRIEF_FACT_LIMIT,
  BRIEF_SOURCE_LIMIT,
  buildBrief,
} from "../brief";
import type { ReceiptSource } from "../receipt";
import type { Fact } from "../schemas/facts";

const TENANT = "test-tenant";
const NOW = new Date("2026-08-09T10:00:00Z");
const ANCHOR = { id: "anchor-1", kind: "organization" as const, name: "Nordwind Energie" };

const makeFact = (text: string, validFrom: Date, id = new ObjectId()): Fact =>
  ({
    _id: id,
    anchors: { organizationId: new ObjectId() },
    category: "logistics",
    confidence: 0.9,
    confirmedBy: "user_marie",
    createdAt: validFrom,
    sourceId: new ObjectId(),
    tenantId: TENANT,
    text,
    updatedAt: validFrom,
    validFrom,
  }) as Fact;

const makeSource = (excerpt: string, status: ReceiptSource["status"]): ReceiptSource => ({
  _id: new ObjectId(),
  capturedBy: "eric@example.com",
  createdAt: NOW,
  excerpt,
  status,
  type: "voice",
});

describe("buildBrief", () => {
  test("keeps fact text verbatim — no rewriting, no translation", () => {
    const text = "Nordwind braucht die überarbeitete Fassung bis Ende August.";
    const brief = buildBrief({
      anchor: ANCHOR,
      contestedIds: new Set(),
      facts: [makeFact(text, new Date("2026-07-01"))],
      now: NOW,
      sources: [],
    });
    expect(brief.lines[0]?.text).toBe(text);
  });

  test("floats contested facts to the top, whatever their date", () => {
    const oldContested = new ObjectId();
    const brief = buildBrief({
      anchor: ANCHOR,
      contestedIds: new Set([oldContested.toHexString()]),
      facts: [
        makeFact("Neu.", new Date("2026-08-01")),
        makeFact("Alt, aber umstritten.", new Date("2025-01-01"), oldContested),
      ],
      now: NOW,
      sources: [],
    });
    expect(brief.lines[0]?.text).toBe("Alt, aber umstritten.");
    expect(brief.lines[0]?.contested).toBe(true);
    expect(brief.contestedCount).toBe(1);
  });

  test("orders the rest newest first", () => {
    const brief = buildBrief({
      anchor: ANCHOR,
      contestedIds: new Set(),
      facts: [
        makeFact("Älter.", new Date("2026-01-01")),
        makeFact("Neuer.", new Date("2026-06-01")),
      ],
      now: NOW,
      sources: [],
    });
    expect(brief.lines.map((line) => line.text)).toEqual(["Neuer.", "Älter."]);
  });

  test("caps facts and reports the true total", () => {
    const facts = Array.from({ length: 12 }, (_, i) =>
      makeFact(`Faktum ${i}.`, new Date(2026, 0, i + 1))
    );
    const brief = buildBrief({
      anchor: ANCHOR,
      contestedIds: new Set(),
      facts,
      now: NOW,
      sources: [],
    });
    expect(brief.lines).toHaveLength(BRIEF_FACT_LIMIT);
    expect(brief.totalFacts).toBe(12);
  });

  test("appends unreviewed sources as the tail, capped", () => {
    const brief = buildBrief({
      anchor: ANCHOR,
      contestedIds: new Set(),
      facts: [makeFact("Bestätigt.", new Date("2026-08-01"))],
      now: NOW,
      sources: [
        makeSource("Ungeprüft eins.", "proposed"),
        makeSource("Ungeprüft zwei.", "extracting"),
        makeSource("Ungeprüft drei.", "received"),
      ],
    });
    const kinds = brief.lines.map((line) => line.kind);
    expect(kinds).toEqual(["fact", "source", "source"]);
    expect(brief.lines.filter((line) => line.kind === "source")).toHaveLength(
      BRIEF_SOURCE_LIMIT
    );
  });

  test("never offers a reviewed source as raw material", () => {
    const brief = buildBrief({
      anchor: ANCHOR,
      contestedIds: new Set(),
      facts: [],
      now: NOW,
      sources: [makeSource("Schon geprüft.", "reviewed")],
    });
    expect(brief.lines).toHaveLength(0);
  });

  test("an anchor with nothing to say produces an empty brief, not a crash", () => {
    const brief = buildBrief({
      anchor: ANCHOR,
      contestedIds: new Set(),
      facts: [],
      now: NOW,
      sources: [],
    });
    expect(brief.lines).toEqual([]);
    expect(brief.totalFacts).toBe(0);
    expect(brief.contestedCount).toBe(0);
  });

  test("every line carries the id its receipt will be fetched by", () => {
    const factId = new ObjectId();
    const brief = buildBrief({
      anchor: ANCHOR,
      contestedIds: new Set(),
      facts: [makeFact("Mit Beleg.", new Date("2026-08-01"), factId)],
      now: NOW,
      sources: [],
    });
    expect(brief.lines[0]?.citationId).toBe(factId.toHexString());
    expect(brief.lines[0]?.kind).toBe("fact");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/knowledge && bun test __tests__/brief.test.ts`
Expected: FAIL — `Cannot find module '../brief'`.

- [ ] **Step 3: Write the implementation**

Create `packages/knowledge/brief.ts`:

```ts
import type { dossierAnchorKinds } from "./dossier";
import type { ReceiptSource } from "./receipt";
import type { Fact } from "./schemas/facts";

// What the Ask surface shows before anyone types. Assembled from facts rather
// than from a dossier's rendered content: composeDossier emits `- ${fact.text}`
// and drops the id, and a brief line without an id can open no receipt — which
// is the entire point of the surface.
//
// Nothing here writes prose. Fact text was authored by extraction and then
// confirmed, edited or discarded by a human in the review queue; this selects
// and orders sentences somebody already signed off on.

/** Facts per brief. Beyond this the reader is skimming, not preparing. */
export const BRIEF_FACT_LIMIT = 5;
/** Unreviewed sources appended after the facts. */
export const BRIEF_SOURCE_LIMIT = 2;

export interface BriefAnchor {
  id: string;
  kind: (typeof dossierAnchorKinds)[number];
  name: string;
}

export interface BriefLine {
  /** The fact or source id — what getReceipts is called with. */
  citationId: string;
  contested: boolean;
  kind: "fact" | "source";
  text: string;
}

export interface Brief {
  anchor: BriefAnchor;
  contestedCount: number;
  lines: BriefLine[];
  /** Facts available, before the cap — so the card can say "of 12". */
  totalFacts: number;
}

export interface BuildBriefInput {
  anchor: BriefAnchor;
  contestedIds: Set<string>;
  facts: Fact[];
  now: Date;
  sources: ReceiptSource[];
}

const recencyOf = (fact: Fact): number =>
  (fact.validFrom ?? fact.updatedAt).getTime();

export const buildBrief = ({
  anchor,
  contestedIds,
  facts,
  sources,
}: BuildBriefInput): Brief => {
  const contested = (fact: Fact) => contestedIds.has(fact._id.toHexString());

  // Contested first: it is the one thing that must not be walked into a room
  // and repeated. Everything else newest first, because the newest is what the
  // reader has not heard yet.
  const ordered = [...facts].sort((a, b) => {
    const byContested = Number(contested(b)) - Number(contested(a));
    return byContested === 0 ? recencyOf(b) - recencyOf(a) : byContested;
  });

  const factLines: BriefLine[] = ordered
    .slice(0, BRIEF_FACT_LIMIT)
    .map((fact) => ({
      citationId: fact._id.toHexString(),
      contested: contested(fact),
      kind: "fact",
      text: fact.text,
    }));

  // Only genuinely unchecked material earns the ochre tier. A reviewed source
  // has already become a fact, and offering its raw wording would invite
  // quoting the draft over the confirmed sentence.
  const sourceLines: BriefLine[] = sources
    .filter((source) => source.status !== "reviewed")
    .slice(0, BRIEF_SOURCE_LIMIT)
    .map((source) => ({
      citationId: source._id.toHexString(),
      contested: false,
      kind: "source",
      text: source.excerpt ?? source.content ?? "",
    }));

  return {
    anchor,
    contestedCount: facts.filter(contested).length,
    lines: [...factLines, ...sourceLines],
    totalFacts: facts.length,
  };
};
```

- [ ] **Step 4: Export it from the barrel**

In `packages/knowledge/index.ts`:

```ts
export * from "./brief";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd packages/knowledge && bun test __tests__/brief.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Lint and commit**

```bash
bun run fix
git add packages/knowledge/brief.ts packages/knowledge/__tests__/brief.test.ts packages/knowledge/index.ts
git commit -m "feat(knowledge): assemble a pre-call brief from confirmed facts"
```

---

### Task 3: Contested lookup and the dossier recency index

The one piece of database work. `runContradictionCheck` already writes open proposals whose `factDrafts.supersedes` names the facts in dispute; nothing has ever read them back.

**Files:**
- Modify: `packages/knowledge/contradiction.ts` (append `findContestedFactIds`)
- Modify: `packages/knowledge/collections.ts:46-52` (add the dossiers recency index)
- Test: `packages/knowledge/__tests__/contradiction.test.ts` (append a describe block)

**Interfaces:**
- Produces: `findContestedFactIds(db: Db, tenantId: string, factIds: ObjectId[]): Promise<Set<string>>`, returning hex strings. Task 4 consumes it.

- [ ] **Step 1: Write the failing test**

Append to `packages/knowledge/__tests__/contradiction.test.ts`. Reuse the file's existing `uri`, client setup and `TENANT` constant — read the top of the file first and match it; do not create a second connection.

```ts
describe.skipIf(!uri)("findContestedFactIds", () => {
  test("returns only the ids an open contradiction proposal supersedes", async () => {
    const disputedA = new ObjectId();
    const disputedB = new ObjectId();
    const settled = new ObjectId();
    const untouched = new ObjectId();
    const { proposals } = getCollections(db);

    await proposals.insertMany([
      {
        _id: new ObjectId(),
        createdAt: new Date(),
        entityDrafts: [],
        factDrafts: [
          {
            anchors: { organizationId: new ObjectId() },
            category: "logistics",
            confidence: 0.8,
            resolution: { status: "pending" },
            supersedes: [disputedA, disputedB],
            text: "Aufgelöste Fassung.",
          },
        ],
        kind: "contradiction",
        status: "open",
        tenantId: TENANT,
        updatedAt: new Date(),
      },
      {
        _id: new ObjectId(),
        createdAt: new Date(),
        entityDrafts: [],
        factDrafts: [
          {
            anchors: { organizationId: new ObjectId() },
            category: "logistics",
            confidence: 0.8,
            resolution: { status: "confirmed" },
            supersedes: [settled],
            text: "Schon entschieden.",
          },
        ],
        kind: "contradiction",
        status: "resolved",
        tenantId: TENANT,
        updatedAt: new Date(),
      },
    ] as never);

    const contested = await findContestedFactIds(db, TENANT, [
      disputedA,
      disputedB,
      settled,
      untouched,
    ]);

    expect(contested.has(disputedA.toHexString())).toBe(true);
    expect(contested.has(disputedB.toHexString())).toBe(true);
    expect(contested.has(settled.toHexString())).toBe(false);
    expect(contested.has(untouched.toHexString())).toBe(false);
  });

  test("never reports another tenant's dispute", async () => {
    const disputed = new ObjectId();
    const { proposals } = getCollections(db);
    await proposals.insertOne({
      _id: new ObjectId(),
      createdAt: new Date(),
      entityDrafts: [],
      factDrafts: [
        {
          anchors: { organizationId: new ObjectId() },
          category: "logistics",
          confidence: 0.8,
          resolution: { status: "pending" },
          supersedes: [disputed],
          text: "Fremde Fassung.",
        },
      ],
      kind: "contradiction",
      status: "open",
      tenantId: "other-tenant",
      updatedAt: new Date(),
    } as never);

    const contested = await findContestedFactIds(db, TENANT, [disputed]);
    expect(contested.size).toBe(0);
  });

  test("an empty id list does not query at all", async () => {
    expect((await findContestedFactIds(db, TENANT, [])).size).toBe(0);
  });
});
```

Add `findContestedFactIds` to the file's import from `../contradiction`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/knowledge && MONGODB_TEST_URI=<your test cluster> bun test __tests__/contradiction.test.ts`
Expected: FAIL — `findContestedFactIds is not a function`.

Without `MONGODB_TEST_URI` the block skips and you get no signal. If you have no test cluster, say so at review rather than marking this task done on a skip.

- [ ] **Step 3: Write the implementation**

Append to `packages/knowledge/contradiction.ts`:

```ts
/**
 * Which of these facts an open contradiction proposal is currently disputing.
 *
 * The sweep above has always written these proposals; until the Ask surface
 * needed to warn a reader before they quoted a fact, nothing read them back.
 * Scoped to `status: "open"` on purpose — a resolved proposal is a dispute that
 * has been settled, and re-flagging it would train people to ignore the flag.
 */
export const findContestedFactIds = async (
  db: Db,
  tenantId: string,
  factIds: ObjectId[]
): Promise<Set<string>> => {
  if (factIds.length === 0) {
    return new Set();
  }
  const { proposals } = getCollections(db);
  const open = await proposals
    .find(
      {
        "factDrafts.supersedes": { $in: factIds },
        kind: "contradiction",
        status: "open",
        tenantId,
      },
      { projection: { "factDrafts.supersedes": 1 } }
    )
    .toArray();

  const wanted = new Set(factIds.map((id) => id.toHexString()));
  const contested = new Set<string>();
  for (const proposal of open) {
    for (const draft of proposal.factDrafts) {
      for (const id of draft.supersedes ?? []) {
        const hex = id.toHexString();
        // A proposal can supersede facts beyond the ones asked about; only
        // report on what the caller handed us.
        if (wanted.has(hex)) {
          contested.add(hex);
        }
      }
    }
  }
  return contested;
};
```

- [ ] **Step 4: Add the dossiers recency index**

In `packages/knowledge/collections.ts`, extend the existing `dossiers.createIndexes([…])` call at line 46:

```ts
    dossiers.createIndexes([
      {
        key: { tenantId: 1, "anchor.kind": 1, "anchor.id": 1 },
        name: "tenant_anchor",
        unique: true,
      },
      // listBriefTargets sorts a tenant's dossiers by recency; the unique
      // index above leads with anchor.kind and cannot serve that sort.
      { key: { tenantId: 1, updatedAt: -1 }, name: "tenant_recency" },
    ]),
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd packages/knowledge && MONGODB_TEST_URI=<your test cluster> bun test __tests__/contradiction.test.ts`
Expected: PASS, including the three new tests.

- [ ] **Step 6: Check the query plan**

The spec leaves open whether a multikey index on `factDrafts.supersedes` is needed. Measure rather than guess:

```js
db.proposals.find({ tenantId: "<t>", kind: "contradiction", status: "open",
  "factDrafts.supersedes": { $in: [ObjectId("…")] } }).explain("executionStats")
```

If `totalDocsExamined` is within a small multiple of `nReturned`, the existing `tenant_status_recency` index is doing its job — leave it. If it is scanning the whole open queue, add `{ tenantId: 1, status: 1, "factDrafts.supersedes": 1 }` and note it in the PR. Record the numbers either way.

- [ ] **Step 7: Lint and commit**

```bash
bun run fix
git add packages/knowledge/contradiction.ts packages/knowledge/collections.ts packages/knowledge/__tests__/contradiction.test.ts
git commit -m "feat(knowledge): read back which facts an open contradiction disputes"
```

---

### Task 4: The server actions — `getReceipts` and `listBriefs`

**Files:**
- Create: `apps/app/app/actions/knowledge/get-receipts.ts`
- Create: `apps/app/app/actions/knowledge/list-briefs.ts`
- Create: `apps/app/lib/member-names.ts`
- Test: `apps/app/__tests__/member-names.test.ts`
- Modify: `packages/auth/server.ts:88-96` (correct the stale docstring)

**Interfaces:**
- Consumes: `composeReceipt`, `Receipt` (Task 1); `buildBrief`, `Brief` (Task 2); `findContestedFactIds` (Task 3).
- Produces: `getReceipts(input: { factIds: string[]; sourceIds: string[] }): Promise<Receipt[]>` and `listBriefs(): Promise<Brief[]>`. Tasks 7 and 8 consume them.

- [ ] **Step 1: Write the failing test for the name resolver**

The resolver is the only part with logic worth testing on its own; `apps/app` has no DOM or Mongo test harness, so the actions themselves are verified by reading and by the manual pass in Task 9.

Create `apps/app/__tests__/member-names.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { buildNameResolver } from "../lib/member-names";

const MEMBERS = [
  { email: "eric@example.com", imageUrl: "", name: "Eric Brandt", userId: "user_eric" },
  { email: "marie@example.com", imageUrl: "", name: "Marie Lang", userId: "user_marie" },
];

describe("buildNameResolver", () => {
  const nameOf = buildNameResolver(MEMBERS);

  test("resolves a better-auth user id, as stored on fact.confirmedBy", () => {
    expect(nameOf("user_marie")).toBe("Marie Lang");
  });

  test("resolves an email address, as stored on source.capturedBy", () => {
    expect(nameOf("eric@example.com")).toBe("Eric Brandt");
  });

  test("matches an email case-insensitively", () => {
    expect(nameOf("Eric@Example.com")).toBe("Eric Brandt");
  });

  test("degrades to a teammate rather than leaking a raw id", () => {
    expect(nameOf("user_ceo1")).toBe("a teammate");
    expect(nameOf("eval-fixture")).toBe("a teammate");
  });

  test("keeps an unknown email, which is at least true", () => {
    expect(nameOf("extern@kunde.de")).toBe("extern@kunde.de");
  });

  test("an empty directory still never returns a raw id", () => {
    expect(buildNameResolver([])("user_ceo1")).toBe("a teammate");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/app && bun test __tests__/member-names.test.ts`
Expected: FAIL — `Cannot find module '../lib/member-names'`.

- [ ] **Step 3: Write the resolver**

Create `apps/app/lib/member-names.ts`:

```ts
import type { OrganizationMemberInfo } from "@repo/auth/server";

// Provenance is stored as identifiers, not names: fact.confirmedBy is a
// better-auth user id, source.capturedBy is an email address. A receipt must
// show neither — "user_ceo1" on a screen whose job is to explain where a claim
// came from is worse than saying nothing precise at all.

const EMAIL_PATTERN = /@/;

/**
 * Maps either identifier form to a display name. Unknown ids become "a
 * teammate"; unknown emails keep the address, which is still a true statement
 * about who captured the material — an external forwarder, usually.
 */
export const buildNameResolver = (
  members: OrganizationMemberInfo[]
): ((idOrEmail: string) => string) => {
  const byUserId = new Map(members.map((member) => [member.userId, member.name]));
  const byEmail = new Map(
    members.map((member) => [member.email.toLowerCase(), member.name])
  );

  return (idOrEmail: string) => {
    const byId = byUserId.get(idOrEmail);
    if (byId) {
      return byId;
    }
    const email = idOrEmail.toLowerCase();
    return byEmail.get(email) ?? (EMAIL_PATTERN.test(email) ? idOrEmail : "a teammate");
  };
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/app && bun test __tests__/member-names.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write `getReceipts`**

Create `apps/app/app/actions/knowledge/get-receipts.ts`:

```ts
"use server";

import { auth, listOrganizationMembers } from "@repo/auth/server";
import {
  composeReceipt,
  findContestedFactIds,
  getCollections,
  ObjectId,
  type Receipt,
  type ReceiptSource,
} from "@repo/knowledge";
import { getKnowledgeDb } from "@repo/knowledge/client";
import { buildNameResolver } from "@/lib/member-names";

// Receipts travel out of band rather than inside the tool payload. A source
// excerpt is up to SOURCE_EXCERPT_LENGTH (1500) characters; attaching one to
// each of twenty retrieved facts would push ~30KB of provenance through the
// model's context describing things it must never narrate. The model cites;
// this explains.

/** Ignore anything that is not a real ObjectId rather than throwing on it. */
const toObjectIds = (ids: string[]): ObjectId[] =>
  ids.flatMap((id) => (ObjectId.isValid(id) ? [new ObjectId(id)] : []));

export const getReceipts = async ({
  factIds,
  sourceIds,
}: {
  factIds: string[];
  sourceIds: string[];
}): Promise<Receipt[]> => {
  const { orgId } = await auth();
  if (!orgId) {
    return [];
  }

  const wantedFacts = toObjectIds(factIds);
  const wantedSources = toObjectIds(sourceIds);
  if (wantedFacts.length === 0 && wantedSources.length === 0) {
    return [];
  }

  const { facts, sources } = getCollections(getKnowledgeDb());

  // tenantId is on every filter: an id from another organization must return
  // nothing, not a receipt.
  const factDocs = await facts
    .find({ _id: { $in: wantedFacts }, tenantId: orgId })
    .toArray();

  // A fact's own provenance source is loaded alongside the directly cited ones.
  const provenanceIds = factDocs.flatMap((fact) =>
    fact.sourceId ? [fact.sourceId] : []
  );

  const [sourceDocs, contested, members] = await Promise.all([
    sources
      .find({
        _id: { $in: [...wantedSources, ...provenanceIds] },
        tenantId: orgId,
      })
      .toArray(),
    findContestedFactIds(getKnowledgeDb(), orgId, wantedFacts),
    listOrganizationMembers(orgId),
  ]);

  const sourceById = new Map(
    sourceDocs.map((source) => [source._id.toHexString(), source as ReceiptSource])
  );
  const nameOf = buildNameResolver(members);
  const now = new Date();

  const factReceipts = factDocs.map((fact) =>
    composeReceipt({
      contested: contested.has(fact._id.toHexString()),
      fact,
      nameOf,
      now,
      source: fact.sourceId
        ? sourceById.get(fact.sourceId.toHexString())
        : undefined,
    })
  );

  const sourceReceipts = wantedSources.flatMap((id) => {
    const source = sourceById.get(id.toHexString());
    return source
      ? [composeReceipt({ contested: false, nameOf, now, source })]
      : [];
  });

  return [...factReceipts, ...sourceReceipts];
};
```

- [ ] **Step 6: Write `listBriefs`**

Create `apps/app/app/actions/knowledge/list-briefs.ts`:

```ts
"use server";

import { auth } from "@repo/auth/server";
import {
  type Brief,
  buildBrief,
  currentlyValidFilter,
  findContestedFactIds,
  getCollections,
  type ReceiptSource,
} from "@repo/knowledge";
import { getKnowledgeDb } from "@repo/knowledge/client";

// What the Ask surface shows before anyone types. The dossiers collection is
// the index here, not the content: it already tracks factCount and updatedAt
// per anchor and is refreshed on every change, so it answers "whom is it worth
// briefing, freshest first" in one query. The lines then come from the facts,
// which is where the ids a receipt needs still exist.

const BRIEF_TARGET_LIMIT = 6;
/** Unreviewed sources considered per tenant before buildBrief caps per anchor. */
const RAW_SOURCE_SCAN = 20;

const ANCHOR_FIELD = {
  engagement: "anchors.engagementId",
  organization: "anchors.organizationId",
  person: "anchors.personId",
} as const;

export const listBriefs = async (): Promise<Brief[]> => {
  const { orgId } = await auth();
  if (!orgId) {
    return [];
  }
  const db = getKnowledgeDb();
  const { dossiers, engagements, facts, organizations, people, sources } =
    getCollections(db);

  const targets = await dossiers
    .find({ tenantId: orgId })
    .sort({ updatedAt: -1 })
    .limit(BRIEF_TARGET_LIMIT)
    .toArray();
  if (targets.length === 0) {
    return [];
  }

  // Three queries for all six anchors, not three per anchor: a per-target loop
  // here is an eighteen-round-trip page load.
  const anchorIds = targets.map((target) => target.anchor.id);
  const [factDocs, orgDocs, personDocs, engagementDocs, rawSources] =
    await Promise.all([
      facts
        .find({
          tenantId: orgId,
          ...currentlyValidFilter,
          $or: [
            { "anchors.organizationId": { $in: anchorIds } },
            { "anchors.personId": { $in: anchorIds } },
            { "anchors.engagementId": { $in: anchorIds } },
          ],
        })
        .toArray(),
      organizations.find({ _id: { $in: anchorIds }, tenantId: orgId }).toArray(),
      people.find({ _id: { $in: anchorIds }, tenantId: orgId }).toArray(),
      engagements.find({ _id: { $in: anchorIds }, tenantId: orgId }).toArray(),
      sources
        .find({ status: { $ne: "reviewed" }, tenantId: orgId })
        .sort({ createdAt: -1 })
        .limit(RAW_SOURCE_SCAN)
        .toArray(),
    ]);

  const contested = await findContestedFactIds(
    db,
    orgId,
    factDocs.map((fact) => fact._id)
  );

  const nameById = new Map<string, string>();
  for (const doc of orgDocs) {
    nameById.set(doc._id.toHexString(), doc.name);
  }
  for (const doc of personDocs) {
    nameById.set(doc._id.toHexString(), doc.name);
  }
  for (const doc of engagementDocs) {
    nameById.set(doc._id.toHexString(), doc.title);
  }

  const now = new Date();
  return targets
    .map((target) => {
      const anchorHex = target.anchor.id.toHexString();
      const field = ANCHOR_FIELD[target.anchor.kind];
      return buildBrief({
        anchor: {
          id: anchorHex,
          kind: target.anchor.kind,
          name: nameById.get(anchorHex) ?? "Unknown",
        },
        contestedIds: contested,
        facts: factDocs.filter((fact) => {
          const anchor =
            field === "anchors.organizationId"
              ? fact.anchors.organizationId
              : field === "anchors.personId"
                ? fact.anchors.personId
                : fact.anchors.engagementId;
          return anchor?.equals(target.anchor.id) ?? false;
        }),
        now,
        // Raw material is not anchored to an entity until review, so it cannot
        // be attributed to one brief. It rides along with the freshest anchor
        // only, where "something new landed" is the useful signal.
        sources:
          target === targets[0] ? (rawSources as ReceiptSource[]) : [],
      });
    })
    .filter((brief) => brief.lines.length > 0);
};
```

- [ ] **Step 7: Correct the stale docstring in `@repo/auth`**

`packages/auth/server.ts:88-96` still says this function exists for "Liveblocks presence, mention suggestions" — Liveblocks was removed and it has been dead code since. Replace the comment:

```ts
/**
 * The active organization's member directory. Used to turn stored identifiers
 * — fact.confirmedBy (a user id), source.capturedBy (an email) — into names a
 * receipt can show. Replaces Clerk's getOrganizationMembershipList.
 */
```

- [ ] **Step 8: Typecheck**

Run: `cd apps/app && bunx tsc --noEmit`
Expected: no errors. If `ObjectId` is not exported from `@repo/knowledge`, import it from `mongodb` instead and note the discrepancy — `create-source.ts:4` imports it from the barrel, so it should be there.

- [ ] **Step 9: Lint and commit**

```bash
bun run fix
git add apps/app/app/actions/knowledge/get-receipts.ts apps/app/app/actions/knowledge/list-briefs.ts apps/app/lib/member-names.ts apps/app/__tests__/member-names.test.ts packages/auth/server.ts
git commit -m "feat(app): read receipts and pre-call briefs from the knowledge base"
```

---

### Task 5: Tell the model when a fact is disputed

One boolean. The agent's instructions already require it to surface conflicts; it has never had a way to know one exists.

**Files:**
- Modify: `apps/app/agent/tools/search-knowledge.ts:36-56`

**Interfaces:**
- Consumes: `findContestedFactIds` (Task 3).
- Produces: each fact in the tool result gains `contested: boolean`.

- [ ] **Step 1: Add the lookup and the field**

In `apps/app/agent/tools/search-knowledge.ts`, extend the import from `@repo/knowledge` with `findContestedFactIds`, then replace the body after `retrieveFacts` with:

```ts
    const results = await retrieveFacts(getKnowledgeDb(), {
      category: input.category,
      query: input.query,
      rerank: getRerank(),
      tenantId,
    });

    // Whether a reviewer is currently being asked to settle a disagreement
    // about this fact. The instructions require conflicts to be shown rather
    // than silently resolved; without this the model cannot tell.
    const contested = await findContestedFactIds(
      getKnowledgeDb(),
      tenantId,
      results.map(({ fact }) => fact._id)
    );

    return {
      // Shaped for citation: the id is the thing the model has to reproduce
      // exactly, so it leads. Dates and ObjectIds are stringified because tool
      // output crosses a durable JSON boundary.
      //
      // Provenance deliberately does NOT travel here — see get-receipts.ts.
      facts: results.map(({ fact, relevanceScore }) => ({
        category: fact.category,
        confidence: fact.confidence,
        contested: contested.has(fact._id.toHexString()),
        id: fact._id.toHexString(),
        relevanceScore,
        text: fact.text,
        validFrom: fact.validFrom?.toISOString() ?? null,
      })),
      searched: input.query,
    };
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/app && bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Confirm the eval suites still hold**

The citation protocol is unchanged and `instructions.md` is untouched, so this is additive. Verify by reading `apps/app/evals/citations.eval.ts` and `apps/app/evals/contradiction.eval.ts`: neither should assert on the exact shape of the tool result. If either does, report it at review instead of editing the eval.

- [ ] **Step 4: Lint and commit**

```bash
bun run fix
git add apps/app/agent/tools/search-knowledge.ts
git commit -m "feat(agent): flag facts an open contradiction proposal disputes"
```

---

### Task 6: The chip and the receipt panel

Two presentational components. No data fetching, no state beyond what is passed in.

**Files:**
- Create: `apps/app/app/(authenticated)/components/brain/citation-chip.tsx`
- Create: `apps/app/app/(authenticated)/components/brain/receipt-panel.tsx`
- Create: `apps/app/lib/citation.ts`
- Test: `apps/app/__tests__/citation.test.ts`

**Interfaces:**
- Consumes: `Receipt`, `ReceiptTier` (Task 1).
- Produces: `<CitationChip>`, `<ReceiptPanel>`, and from `lib/citation.ts`: `normalizeCitationId(raw?: string): string | undefined` and `type CitationRef = { id: string; kind: "fact" | "source" }`. Task 7 consumes all of them.

- [ ] **Step 1: Write the failing test**

The id normalisation is load-bearing and easy to lose in a refactor, so it moves out of the components into a tested module. Create `apps/app/__tests__/citation.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { normalizeCitationId } from "../lib/citation";

describe("normalizeCitationId", () => {
  test("strips the sanitizer's DOM-clobbering prefix", () => {
    expect(normalizeCitationId("user-content-6a70f2dac615029be026bab7")).toBe(
      "6a70f2dac615029be026bab7"
    );
  });

  test("passes a bare id through untouched", () => {
    expect(normalizeCitationId("6a70f2dac615029be026bab7")).toBe(
      "6a70f2dac615029be026bab7"
    );
  });

  test("strips the prefix only at the start", () => {
    expect(normalizeCitationId("abc-user-content-def")).toBe(
      "abc-user-content-def"
    );
  });

  test("an absent id stays absent — it must render as broken, not vanish", () => {
    expect(normalizeCitationId(undefined)).toBeUndefined();
    expect(normalizeCitationId("")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/app && bun test __tests__/citation.test.ts`
Expected: FAIL — `Cannot find module '../lib/citation'`.

- [ ] **Step 3: Write the module**

Create `apps/app/lib/citation.ts`:

```ts
// Streamdown's sanitizer rewrites `id` attributes to "user-content-…" as
// DOM-clobbering protection (the GitHub convention), so the attribute arrives
// prefixed even though the model emitted the bare id. Stripping it is
// load-bearing: without it every citation resolves to nothing and renders as
// broken.

const CLOBBER_PREFIX = /^user-content-/;

export interface CitationRef {
  id: string;
  kind: "fact" | "source";
}

export const normalizeCitationId = (raw?: string): string | undefined => {
  const id = raw?.replace(CLOBBER_PREFIX, "");
  return id && id.length > 0 ? id : undefined;
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/app && bun test __tests__/citation.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the chip**

Create `apps/app/app/(authenticated)/components/brain/citation-chip.tsx`:

```tsx
"use client";

import { cn } from "@repo/design-system/lib/utils";
import { useCallback } from "react";
import type { CitationRef } from "@/lib/citation";

// The reader has to be able to tell, without hovering and without reading,
// whether a claim has been through review. Filled square: a person confirmed
// it. Hollow: nobody has yet. Clicking opens the receipt and keeps it open —
// the old hover-card was unreachable on touch, which is where most of these
// answers get read.

export type ChipTone = "broken" | "checked" | "contested" | "raw";

export const CitationChip = ({
  index,
  onSelect,
  reference,
  selected,
  tone,
}: {
  index: number;
  onSelect: (reference: CitationRef) => void;
  reference: CitationRef;
  selected: boolean;
  tone: ChipTone;
}) => {
  const select = useCallback(() => onSelect(reference), [onSelect, reference]);

  if (tone === "broken") {
    // An id the tools never returned. Dropping it would make an invented claim
    // indistinguishable from a sourced one, which is the failure this whole
    // mechanism exists to make visible — so it stays loud.
    return (
      <button
        aria-label="Unsupported citation — the knowledge base never returned this"
        className="ml-0.5 cursor-help rounded bg-destructive/10 px-1 align-super font-medium text-destructive text-xs"
        onClick={select}
        type="button"
      >
        ?
      </button>
    );
  }

  const label =
    tone === "checked"
      ? "confirmed — open the receipt"
      : tone === "contested"
        ? "confirmed but disputed — open the receipt"
        : "nobody has checked this — open the receipt";

  return (
    <button
      aria-expanded={selected}
      className={cn(
        "ml-1 inline-flex translate-y-[-0.06em] items-center gap-1.5 rounded-[3px] px-1.5 py-0.5 align-baseline font-medium font-mono text-[0.6875rem] leading-none transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        tone === "checked" && "bg-primary/10 text-primary hover:bg-primary/20",
        tone !== "checked" &&
          "bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 dark:text-amber-400",
        selected && "ring-1 ring-current"
      )}
      onClick={select}
      type="button"
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-[1px]",
          tone === "raw" ? "border border-current" : "bg-current"
        )}
      />
      {index}
      <span className="sr-only"> — {label}</span>
    </button>
  );
};
```

- [ ] **Step 6: Write the panel**

Create `apps/app/app/(authenticated)/components/brain/receipt-panel.tsx`:

```tsx
"use client";

import type { Receipt } from "@repo/knowledge";
import { cn } from "@repo/design-system/lib/utils";
import { Skeleton } from "@repo/design-system/components/ui/skeleton";

// The receipt the marketing site promises, with the rows renamed to things we
// can actually prove. It stays open until another chip is clicked: this is a
// reading surface, not a tooltip.

const isWarn = (receipt: Receipt) =>
  receipt.tier === "checked-contested" || receipt.tier === "raw";

export const ReceiptPanel = ({
  receipt,
}: {
  receipt: Receipt | "loading" | undefined;
}) => {
  if (receipt === undefined) {
    return null;
  }

  if (receipt === "loading") {
    return (
      <div className="mt-3 rounded-lg border p-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-3 w-full" />
        <Skeleton className="mt-2 h-3 w-4/5" />
      </div>
    );
  }

  const warn = isWarn(receipt);

  return (
    <aside
      className={cn(
        "mt-3 rounded-lg border border-t-2 bg-muted/30 p-4",
        warn ? "border-t-amber-500" : "border-t-primary"
      )}
    >
      <p className="font-medium font-mono text-[0.625rem] text-muted-foreground uppercase tracking-[0.18em]">
        {receipt.kind === "fact" ? "Receipt" : "Raw material"}
      </p>

      <dl className="mt-3">
        {receipt.rows.map((row) => (
          <div className="flex gap-3 py-1.5" key={row.label}>
            <dt className="w-[7.5rem] shrink-0 font-medium font-mono text-[0.6875rem] text-muted-foreground uppercase leading-[1.5] tracking-[0.05em]">
              {row.label}
            </dt>
            <dd className="text-[0.8125rem] leading-[1.5]">{row.detail}</dd>
          </div>
        ))}
      </dl>

      {receipt.quote ? (
        <blockquote
          className={cn(
            "mt-3 border-l-2 py-1 pl-3.5 text-[0.875rem] leading-[1.6]",
            warn ? "border-amber-500" : "border-primary"
          )}
        >
          {receipt.quote}
        </blockquote>
      ) : null}

      <p
        className={cn(
          "mt-3.5 font-medium font-mono text-[0.6875rem] leading-[1.5]",
          warn ? "text-amber-700 dark:text-amber-400" : "text-primary"
        )}
      >
        {receipt.verdict}
      </p>
    </aside>
  );
};
```

If `@repo/design-system/components/ui/skeleton` does not exist, check `packages/design-system/components/ui/` and substitute the nearest equivalent, or render a plain `<div className="h-3 animate-pulse rounded bg-muted" />`.

- [ ] **Step 7: Typecheck and lint**

Run: `cd apps/app && bunx tsc --noEmit && cd ../.. && bun run check`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add apps/app/lib/citation.ts apps/app/__tests__/citation.test.ts apps/app/app/\(authenticated\)/components/brain/citation-chip.tsx apps/app/app/\(authenticated\)/components/brain/receipt-panel.tsx
git commit -m "feat(app): add the citation chip and the receipt panel"
```

---

### Task 7: Wire the chat to chips and receipts

**Files:**
- Modify: `apps/app/app/(authenticated)/components/brain/knowledge-chat.tsx` (whole file)
- Rewrite: `apps/app/app/(authenticated)/components/brain/fact-citation.tsx`
- Rewrite: `apps/app/app/(authenticated)/components/brain/source-citation.tsx`
- Create: `apps/app/app/(authenticated)/components/brain/use-receipts.ts`
- Create: `apps/app/app/(authenticated)/components/brain/search-summary.tsx`

**Interfaces:**
- Consumes: `getReceipts` (Task 4), `CitationChip`, `ReceiptPanel`, `normalizeCitationId`, `CitationRef` (Task 6).
- Produces: nothing downstream; Task 8 only adds the empty state.

- [ ] **Step 1: Write the receipt cache hook**

Create `apps/app/app/(authenticated)/components/brain/use-receipts.ts`:

```ts
"use client";

import type { Receipt } from "@repo/knowledge";
import { useCallback, useState } from "react";
import { getReceipts } from "@/app/actions/knowledge/get-receipts";
import type { CitationRef } from "@/lib/citation";

// One receipt cache for the whole conversation. Fetched on first click rather
// than with the answer: the provenance a receipt shows is far larger than the
// answer itself, and most citations are never opened.

export const useReceipts = () => {
  const [byId, setById] = useState<Record<string, Receipt | "loading">>({});

  const load = useCallback(
    (reference: CitationRef) => {
      setById((current) => {
        if (current[reference.id]) {
          return current;
        }
        void getReceipts({
          factIds: reference.kind === "fact" ? [reference.id] : [],
          sourceIds: reference.kind === "source" ? [reference.id] : [],
        })
          .then((receipts) => {
            setById((latest) => {
              const next = { ...latest };
              for (const receipt of receipts) {
                next[receipt.id] = receipt;
              }
              // A lookup that returned nothing must not sit on "loading"
              // forever — drop it so a retry is possible.
              if (!receipts.some((receipt) => receipt.id === reference.id)) {
                delete next[reference.id];
              }
              return next;
            });
          })
          .catch(() => {
            setById((latest) => {
              const next = { ...latest };
              delete next[reference.id];
              return next;
            });
          });
        return { ...current, [reference.id]: "loading" };
      });
    },
    []
  );

  return { load, receipts: byId };
};
```

- [ ] **Step 2: Write the search summary**

Create `apps/app/app/(authenticated)/components/brain/search-summary.tsx`:

```tsx
"use client";

import { SearchIcon } from "lucide-react";

// Replaces the raw Tool block, which rendered "tool-search-knowledge" plus its
// JSON input and output inline — developer plumbing on a product surface. What
// a reader needs is that a search happened, what for, and how much it found.

export const SearchSummary = ({
  factCount,
  query,
  sourceCount,
  state,
}: {
  factCount: number;
  query: string | undefined;
  sourceCount: number;
  state: string | undefined;
}) => {
  const done = state === "output-available";
  const found = [
    factCount > 0 ? `${factCount} fact${factCount === 1 ? "" : "s"}` : null,
    sourceCount > 0
      ? `${sourceCount} unchecked note${sourceCount === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);

  return (
    <p className="flex items-center gap-2 text-muted-foreground text-xs">
      <SearchIcon className="size-3.5 shrink-0" />
      {done ? (
        <span>
          Looked up {query ? <>&laquo;{query}&raquo;</> : "the brain"}
          {found.length > 0 ? ` — ${found.join(", ")}` : " — nothing found"}
        </span>
      ) : (
        <span>Searching{query ? <> for &laquo;{query}&raquo;</> : null}…</span>
      )}
    </p>
  );
};
```

- [ ] **Step 3: Rewrite the two citation components**

Replace the entire contents of `fact-citation.tsx`:

```tsx
"use client";

import { CitationChip, type ChipTone } from "./citation-chip";
import type { CitationRef } from "@/lib/citation";
import { normalizeCitationId } from "@/lib/citation";

// Every fact the agent has returned in this conversation, keyed by the id it
// must cite. Built from tool output rather than from the prose, so a claim can
// only cite something the knowledge base actually returned.
export interface CitedFact {
  category: string;
  confidence: number;
  contested?: boolean;
  id: string;
  text: string;
  validFrom: string | null;
}

/**
 * Renders one `<fact id="…"/>` marker the model emitted inline.
 *
 * An id we never returned renders as broken rather than being dropped. A
 * dropped citation is indistinguishable from an uncited claim, which is
 * precisely the failure this mechanism exists to make visible.
 */
export const FactCitation = ({
  facts,
  id,
  numberOf,
  onSelect,
  selectedId,
}: {
  facts: Map<string, CitedFact>;
  id?: string;
  numberOf: (id: string) => number;
  onSelect: (reference: CitationRef) => void;
  selectedId: string | undefined;
}) => {
  const factId = normalizeCitationId(id);
  const fact = factId ? facts.get(factId) : undefined;
  const reference: CitationRef = { id: factId ?? "", kind: "fact" };

  const tone: ChipTone = fact
    ? fact.contested
      ? "contested"
      : "checked"
    : "broken";

  return (
    <CitationChip
      index={factId ? numberOf(factId) : 0}
      onSelect={onSelect}
      reference={reference}
      selected={selectedId === factId}
      tone={tone}
    />
  );
};
```

Replace the entire contents of `source-citation.tsx` with the same shape, keeping the `CitedSource` interface exactly as it is today (it is built from tool output in `knowledge-chat.tsx`) and using `kind: "source"`, plus:

```tsx
  const tone: ChipTone = source ? "raw" : "broken";
```

- [ ] **Step 4: Wire `knowledge-chat.tsx`**

Four changes, leaving `collectCitables`, `unwrapToolOutput`, `ingestToolOutput` and `ALLOWED_TAGS` intact:

1. Add state and the hook near the top of the component:

```tsx
  const { load, receipts } = useReceipts();
  const [selected, setSelected] = useState<Record<string, CitationRef>>({});

  const select = useCallback(
    (messageId: string, reference: CitationRef) => {
      if (reference.id.length === 0) {
        return;
      }
      setSelected((current) => ({ ...current, [messageId]: reference }));
      load(reference);
    },
    [load]
  );
```

2. Number citations per message. Add above the `messages.map`:

```tsx
  // Sequence numbers are per answer: an eight-character hex id is precise and
  // unreadable, and the number only has to distinguish the chips in front of
  // the reader.
  const numbering = useMemo(() => {
    const counters = new Map<string, Map<string, number>>();
    return (messageId: string, citationId: string) => {
      let seen = counters.get(messageId);
      if (!seen) {
        seen = new Map();
        counters.set(messageId, seen);
      }
      const existing = seen.get(citationId);
      if (existing !== undefined) {
        return existing;
      }
      const next = seen.size + 1;
      seen.set(citationId, next);
      return next;
    };
  }, []);
```

3. Build `components` per message instead of once, so each chip knows its message:

```tsx
  const componentsFor = useCallback(
    (messageId: string) => ({
      fact: ({ id }: { id?: string }) => (
        <FactCitation
          facts={facts}
          id={id}
          numberOf={(citationId) => numbering(messageId, citationId)}
          onSelect={(reference) => select(messageId, reference)}
          selectedId={selected[messageId]?.id}
        />
      ),
      source: ({ id }: { id?: string }) => (
        <SourceCitation
          id={id}
          numberOf={(citationId) => numbering(messageId, citationId)}
          onSelect={(reference) => select(messageId, reference)}
          selectedId={selected[messageId]?.id}
          sources={sources}
        />
      ),
    }),
    [facts, numbering, select, selected, sources]
  );
```

Pass `components={componentsFor(message.id)}` to `MessageResponse`.

4. Replace the `isSearchTool(part)` branch. Delete the `Tool` / `ToolHeader` / `ToolContent` / `ToolInput` / `ToolOutput` imports and render:

```tsx
                  if (isSearchTool(part)) {
                    const tool = part as ToolPart;
                    const { value } = unwrapToolOutput(tool.output);
                    const output = value as
                      | { facts?: unknown[]; searched?: string; sources?: unknown[] }
                      | undefined;
                    return (
                      <SearchSummary
                        factCount={output?.facts?.length ?? 0}
                        // biome-ignore lint/suspicious/noArrayIndexKey: stream parts have no stable id and are append-only
                        key={index}
                        query={
                          output?.searched ??
                          (tool.input as { query?: string } | undefined)?.query
                        }
                        sourceCount={output?.sources?.length ?? 0}
                        state={tool.state}
                      />
                    );
                  }
```

5. Render the panel after `</MessageContent>`, inside the `<Message>`:

```tsx
              {selected[message.id] ? (
                <ReceiptPanel receipt={receipts[selected[message.id].id]} />
              ) : null}
```

- [ ] **Step 5: Verify by hand**

Run: `turbo dev --filter=app`, sign in, ask a question that hits the knowledge base.
Expected: no JSON block; one "Looked up …" line; numbered chips; clicking one opens a receipt below the answer and it stays open; clicking a second swaps it; the chip is reachable by Tab and opens on Enter.

- [ ] **Step 6: Lint, test and commit**

```bash
bun run fix && bun run check && bun test
git add apps/app/app/\(authenticated\)/components/brain/
git commit -m "feat(app): open a persistent receipt from every citation"
```

---

### Task 8: Briefs on arrival

**Files:**
- Create: `apps/app/app/(authenticated)/components/brain/brief-pane.tsx`
- Modify: `apps/app/app/(authenticated)/page.tsx`
- Modify: `apps/app/app/(authenticated)/components/brain/knowledge-chat.tsx` (empty state)

**Interfaces:**
- Consumes: `listBriefs` (Task 4), `Brief`/`BriefLine` (Task 2), `CitationChip`, `ReceiptPanel` (Task 6), `useReceipts` (Task 7).

- [ ] **Step 1: Write the pane**

Create `apps/app/app/(authenticated)/components/brain/brief-pane.tsx`:

```tsx
"use client";

import type { Brief } from "@repo/knowledge";
import { useCallback, useState } from "react";
import type { CitationRef } from "@/lib/citation";
import { CitationChip } from "./citation-chip";
import { ReceiptPanel } from "./receipt-panel";
import { useReceipts } from "./use-receipts";

// The demo on the marketing site is stamped "two minutes before the call" and
// the answer is already on screen. This is that, with the calendar left out:
// the anchors the brain learned something about most recently, each line a
// sentence a reviewer confirmed, each line opening its own receipt.

const BriefCard = ({
  brief,
  onAsk,
}: {
  brief: Brief;
  onAsk: (name: string) => void;
}) => {
  const { load, receipts } = useReceipts();
  const [selected, setSelected] = useState<CitationRef | undefined>();

  const select = useCallback(
    (reference: CitationRef) => {
      setSelected(reference);
      load(reference);
    },
    [load]
  );

  const ask = useCallback(
    () => onAsk(brief.anchor.name),
    [brief.anchor.name, onAsk]
  );

  return (
    <article className="rounded-xl border">
      <header className="flex items-baseline justify-between gap-3 border-b px-4 py-3">
        <h3 className="font-medium text-sm">{brief.anchor.name}</h3>
        <span className="font-medium font-mono text-[0.625rem] text-muted-foreground uppercase tracking-[0.12em]">
          {brief.lines.length} thing{brief.lines.length === 1 ? "" : "s"}
          {brief.contestedCount > 0
            ? ` · ${brief.contestedCount} contested`
            : ""}
        </span>
      </header>

      <div className="px-4 py-3">
        <ul className="space-y-2">
          {brief.lines.map((line, index) => (
            <li className="text-sm leading-relaxed" key={line.citationId}>
              {line.text}
              <CitationChip
                index={index + 1}
                onSelect={select}
                reference={{ id: line.citationId, kind: line.kind }}
                selected={selected?.id === line.citationId}
                tone={
                  line.kind === "source"
                    ? "raw"
                    : line.contested
                      ? "contested"
                      : "checked"
                }
              />
            </li>
          ))}
        </ul>

        {selected ? <ReceiptPanel receipt={receipts[selected.id]} /> : null}

        <button
          className="mt-3 rounded-sm text-muted-foreground text-xs underline underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
          onClick={ask}
          type="button"
        >
          Ask about {brief.anchor.name}
        </button>
      </div>
    </article>
  );
};

export const BriefPane = ({
  briefs,
  onAsk,
}: {
  briefs: Brief[];
  onAsk: (name: string) => void;
}) => {
  if (briefs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-center">
        <p className="font-medium text-sm">Nothing to brief you on yet</p>
        <p className="mx-auto mt-1 max-w-xs text-muted-foreground text-xs leading-relaxed">
          Capture a voice memo or paste a note. Once a review confirms what it
          found, what matters before your next call shows up here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="font-medium font-mono text-[0.625rem] text-muted-foreground uppercase tracking-[0.18em]">
        Before your next call
      </p>
      {briefs.map((brief) => (
        <BriefCard brief={brief} key={brief.anchor.id} onAsk={onAsk} />
      ))}
    </div>
  );
};
```

- [ ] **Step 2: Fetch the briefs on the page**

In `apps/app/app/(authenticated)/page.tsx`, add `listBriefs` to the imports and to the existing `Promise.all`, then pass the result into `KnowledgeChat`:

```tsx
  const [sources, openProposals, skippedProposals, people, briefs] =
    await Promise.all([
      listRecentSources(),
      listOpenProposals(),
      listSkippedProposals(),
      listPeople(),
      listBriefs(),
    ]);
```

```tsx
        ask={<KnowledgeChat briefs={briefs} />}
```

- [ ] **Step 3: Replace the empty state**

In `knowledge-chat.tsx`, take `briefs: Brief[]` as a prop and swap the `ConversationEmptyState` block for:

```tsx
          {agent.data.messages.length === 0 ? (
            <BriefPane briefs={briefs} onAsk={askAbout} />
          ) : null}
```

`askAbout` sends the question directly. `PromptInput` owns its own textarea state, so seeding the composer would mean mirroring that state up here — and the button already reads as an action, not as autofill:

```tsx
  const askAbout = useCallback(
    (name: string) => {
      if (isBusy) {
        return;
      }
      agent
        .send(`What should I know before I talk to ${name}?`)
        .catch(() => undefined);
    },
    [agent, isBusy]
  );
```

The question is English because the chrome is; the agent answers in the language of the facts it finds, which `instructions.md` already handles.

Remove the now-unused `ConversationEmptyState` and `BrainIcon` imports.

- [ ] **Step 4: Verify by hand**

Run: `turbo dev --filter=app`.
Expected: with dossiers present, brief cards on open, each line ending in a chip, clicking one opens its receipt inside the card. With none, the dashed cold-start card. Asking a question replaces the pane with the conversation.

- [ ] **Step 5: Lint, test and commit**

```bash
bun run fix && bun run check && bun test
git add apps/app/app/\(authenticated\)/
git commit -m "feat(app): brief the reader before they ask"
```

---

### Task 9: English chrome and full verification

**Files:**
- Modify: `apps/app/app/(authenticated)/components/brain/knowledge-chat.tsx`
- Modify: `apps/app/app/(authenticated)/components/brain/fact-citation.tsx` (`CATEGORY_LABELS`, if still referenced)
- Modify: any remaining German string in `apps/app/app/(authenticated)/components/brain/`

- [ ] **Step 1: Find every German string**

```bash
rg -n 'Denkt nach|Nachgedacht|nachgedacht|Einen Moment|Was möchtest du|Firmengedächtnis|Unbelegtes|Konfidenz|gültig seit|ungeprüft|Sprachmemo|erfasst|Rohmaterial|Quelle |Fakt ' apps/app --glob '!node_modules'
```

- [ ] **Step 2: Translate them**

| German | English |
| --- | --- |
| `Denkt nach …` | `Thinking…` |
| `Kurz nachgedacht` | `Thought for a moment` |
| `{n}s nachgedacht` | `Thought for {n}s` |
| `Einen Moment …` | `One moment…` |
| `Was möchtest du wissen?` | `Ask the company brain…` |
| `Präferenz / Einwand / Entscheidungsweg / Beziehung / Logistik / Hintergrund / Sonstiges` | `Preference / Objection / Decision path / Relationship / Logistics / Background / Other` |

Leave `agent/instructions.md` alone, and leave every string that renders stored content alone.

- [ ] **Step 3: Full verification**

```bash
bun run check          # Biome, must be clean
bun test               # all workspaces, 62 existing + ~32 new
bunx tsc --noEmit      # from apps/app and packages/knowledge
turbo build --filter=app
```

Record the actual test count in the PR rather than asserting it passed.

- [ ] **Step 4: Manual pass**

`turbo dev --filter=app`, at 1440px and at 390px:

- Briefs render on open; cold-start card appears for an empty workspace.
- Chips are keyboard reachable; Enter opens a receipt; the receipt stays open.
- A contested fact shows the amber tone and the "Two versions on record" verdict.
- An unchecked source shows a hollow square and "Don't quote it to them yet."
- A deliberately broken citation still renders red. To force one, temporarily have the model cite an id it was never given, or hand `FactCitation` an `id` not in the map.
- Dark mode: toggle and confirm the amber and primary tones both still read.
- No German chrome anywhere; German fact text still German.

- [ ] **Step 5: Commit and open the PR**

```bash
bun run fix
git add -A
git commit -m "feat(app): English chrome across the Ask surface"
git push -u origin Kheirah/ask-ui-demo-parity
gh pr create --base main --title "Ask UI: briefs and receipts"
```

The PR body should state what shipped, the two deviations from the demo (relabelled rows; briefs from facts, not dossiers), the `explain` numbers from Task 3 Step 6, and that i18n is the next branch.

---

## Self-review

**Spec coverage.** Receipt composer → Task 1. Brief builder → Task 2. Contested lookup and `dossiers` recency index → Task 3. `getReceipts`, `listBriefs`, name resolution, corrected `@repo/auth` docstring → Task 4. `contested` on `search-knowledge` → Task 5. Chip, panel, preserved clobber-prefix handling, preserved broken-citation treatment → Task 6. Chat wiring and the `Tool`-block replacement → Task 7. Briefs on arrival and the cold-start path → Task 8. English chrome and verification → Task 9.

**Deviation from the spec's test table, deliberate.** The spec listed `apps/app/__tests__/receipts.test.ts` (mocked) and `citation.test.tsx` (DOM). `apps/app` has neither a Mongo harness nor happy-dom/testing-library, so those tests would have required standing up test infrastructure that is out of scope here. Instead the logic worth testing was extracted into pure modules — `lib/member-names.ts` and `lib/citation.ts` — and tested directly. Tenant scoping in the actions is enforced by the query and verified by reading, consistent with how `list-people.ts` and the other existing actions are handled. Flag this at review if a real integration harness is wanted.

**Open item carried forward.** Task 3 Step 6 measures whether `proposals.factDrafts.supersedes` needs its own index; the spec deliberately left this to measurement rather than guessing.

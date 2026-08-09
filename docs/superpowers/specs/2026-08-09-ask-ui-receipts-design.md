# Ask UI — briefs and receipts

**Date:** 2026-08-09
**Branch:** `Kheirah/ask-ui-demo-parity`
**Status:** approved design, not yet implemented

## Why

The landing page's hero component (`apps/web/app/[locale]/components/trace.tsx`) makes
three promises the product does not keep:

1. **The answer is already there.** The demo is stamped "09:58 — two minutes before the
   call" and the answer is on screen before anyone types. The product opens a blank box:
   *"Frag das Firmengedächtnis / Was möchtest du wissen?"*
2. **Receipts are readable.** The demo's citation opens a panel with four plain-language
   rows, the original German quote, and a verdict — *"Safe to say out loud."* The product
   opens a hover-card showing `Präferenz`, `Konfidenz 87 %`, `gültig seit 13. März`:
   storage fields, not judgment. It has no room for who checked it, where it came from, or
   what the source actually said, and being hover-only it does nothing at all on a phone.
3. **Checked and unchecked are distinguishable at a glance.** The demo uses two colours.
   The product uses a filled badge versus an outline badge with the word `ungeprüft`.

On top of that the chat renders raw `Tool` blocks — `tool-search-knowledge` with JSON input
and output inline — which is developer plumbing sitting in the product surface.

The data to keep all three promises already exists. Nothing reads it.

## Scope

In: the Ask surface in `apps/app` — a new brief surface, a rewritten citation/receipt
mechanism, and the chat cleanup. One supporting field on one tool. English UI chrome.

Out: calendar integration (a real "two minutes before the call" trigger); `@repo/internationalization`
wiring for `apps/app` (separate branch, immediately after this one); any change to the
`<fact id="…"/>` / `<source id="…"/>` citation protocol, which nine eval suites depend on.

## Decisions taken

### Language: English chrome, content in its captured language

`apps/app` is currently split — `knowledge-chat.tsx` and `fact-citation.tsx` are German
(*"Frag das Firmengedächtnis"*, *"Unbelegtes Zitat"*, `CATEGORY_LABELS` → *Präferenz*),
while `workspace.tsx`, `people-pane.tsx` and the whole marketing site are English. This
pass makes the chrome uniformly English and leaves everything the brain *says* — fact text,
source excerpts, the agent's prose — in whatever language it was captured in.
`agent/instructions.md` is unchanged: the agent still answers in the language it was asked
in. Proper localisation is the next branch.

### The verdict is computed, never generated

"Safe to say out loud" is a claim about evidence. A model writing it would be asserting
something it cannot verify, which is the precise failure the citation system exists to
prevent. It comes from a pure function over stored fields.

### Receipt rows are relabelled where the demo's labels describe data we do not have

The demo's **"Who said it"** implies a speaker. We do not model speakers anywhere.
`sources.capturedBy` records who *captured* the material — in the demo's own scenario, Eric
recording a memo about something Anna said. Rendering "Who said it: Eric Brandt" would be a
confident misattribution on the surface whose whole purpose is provenance. And once that row
shows the capturer, the demo's **"Where from"** has nothing left to say.

| Demo | Product | Source |
| --- | --- | --- |
| ~~Who said it~~ | **Where it came from** | `source.type` + `source.email.subject` / `occurredAt` |
| ~~Where from~~ | **Who captured it** | `source.capturedBy`, resolved to a member name |
| Who checked it | **Who checked it** | `fact.confirmedBy` + `fact.createdAt`; raw source → "Nobody yet — it's in the review queue." |
| Still good? | **Still good?** | contested state, else `validFrom` |

The German quote below the rows still does the work of "who said it" — the speaker is
audible in it. The label just stops claiming we know.

### Briefs are built from facts, not from `composeDossier`

`composeDossier` emits `- ${fact.text}` (`packages/knowledge/dossier.ts:59`). The id is
discarded in the string, so a brief rendered from `dossier.content` cannot carry a single
receipt — which is the whole point. Two lesser losses come with it: its headings are raw
enum keys (`preference`, `logistics`), and it is built from confirmed facts only, so
unreviewed material can never appear — removing the ochre tier from the surface where
"nobody has checked this" matters most.

So `dossiers` stops being the content and becomes the index. It already maintains
`factCount` and `updatedAt` per anchor and is refreshed on every change, which answers
"whom is it worth briefing, freshest first?" in one query. The lines are then read from
`facts` and `sources`, where the ids are.

### Brief lines are verbatim

A brief line is `fact.text` unaltered. Not translated, not compressed, not smoothed. The
prose was authored by the extraction model and then confirmed, edited or discarded by a
human in the Review queue (`factDraftSchema.resolution.finalText`, status `"edited"`) before
it became a fact at all. `buildBrief` is downstream of that; it selects and orders sentences
that someone has already signed off on. Summarising at render time would put an unreviewed
model sentence on the surface whose premise is that everything on it was checked, and would
destroy the receipts — a synthesised line maps to no single `fact._id`.

## Architecture

Functional core, imperative shell. The two pieces that encode judgment — what a receipt says,
and what goes in a brief — are pure functions in `@repo/knowledge`, unit-testable against
plain objects. This matters concretely: the knowledge test suite skips itself without
`MONGODB_TEST_URI`, so logic buried inside a query would effectively go untested.

### `packages/knowledge/receipt.ts` (new)

```ts
export type ReceiptTier = "checked" | "checked-contested" | "raw" | "raw-reviewed";

export interface Receipt {
  id: string;
  kind: "fact" | "source";
  quote: string | null;
  rows: { label: string; detail: string }[];
  tier: ReceiptTier;
  verdict: string;
}

export const composeReceipt = (input: {
  contested: boolean;
  fact?: Fact;
  nameOf: (idOrEmail: string) => string;
  now: Date;
  source?: SourceSearchHit | Source;
}): Receipt
```

Pure. No I/O, no clock read (`now` is passed), no randomness.

Verdicts:

| Tier | Condition | Verdict |
| --- | --- | --- |
| `checked` | fact, no open contradiction | Safe to say out loud. |
| `checked-contested` | fact, open contradiction proposal supersedes it | Two versions on record. Settle it in Review before you quote it. |
| `raw` | source, `status !== "reviewed"` | Worth knowing. Don't quote it to them yet. |
| `raw-reviewed` | source, `status === "reviewed"` | Reviewed — but this is the raw wording, not a confirmed fact. |

`nameOf` degrades to `"a teammate"` for ids that resolve to nobody (eval fixtures,
consolidation-authored facts). A raw `user_ceo1` must never reach the screen.

### `packages/knowledge/brief.ts` (new)

```ts
export interface BriefLine {
  citationId: string;
  contested: boolean;
  kind: "fact" | "source";
  text: string;
}

export interface Brief {
  anchor: { id: string; kind: DossierAnchor["kind"]; name: string };
  contestedCount: number;
  lines: BriefLine[];
  totalFacts: number;
}

export const buildBrief = (input: {
  anchor: { id: string; kind: DossierAnchor["kind"]; name: string };
  contestedIds: Set<string>;
  facts: Fact[];
  now: Date;
  sources: SourceSearchHit[];
}): Brief
```

Pure. Ordering: contested facts first (the ones you must not walk in and misquote), then
remaining facts newest-first by `validFrom ?? updatedAt`, capped at 5; then up to 2
unreviewed sources as the tail. Cap constants exported for the tests.

### Reads (imperative shell)

`apps/app/app/actions/knowledge/`:

- **`list-briefs.ts`** — `listBriefTargets()`: `dossiers` for the tenant sorted
  `updatedAt: -1`, limit 6 → `{ kind, id, name, factCount }`. Then **three queries total,
  not three per target**: one facts read with `$in` over all six anchor ids, one sources
  read, one contested lookup over the resulting fact ids. Group in memory, then one
  `buildBrief` call per anchor. A per-target read loop here would be an 18-query page load.
- **`get-receipts.ts`** — `getReceipts({ factIds, sourceIds })`: tenant-scoped; loads the
  facts, joins their `sourceId` into `sources`, runs the contested lookup, resolves names,
  returns `Receipt[]` via `composeReceipt`.

Contested lookup, shared by both:

```ts
proposals.find({
  tenantId,
  kind: "contradiction",
  status: "open",
  "factDrafts.supersedes": { $in: ids },
})
```

Name resolution reuses `listOrganizationMembers` (`packages/auth/server.ts:97`), which has
been dead code since the Liveblocks removal — its docstring still cites Liveblocks presence
as its reason for existing. Repurposed here and the comment corrected. It returns
`{ userId, email, name }`, so one map serves both `fact.confirmedBy` (a user id) and
`source.capturedBy` (an email address).

### Provenance travels out of band, deliberately

`search-knowledge` gains exactly one field per fact: `contested: boolean`. One bit, and the
model genuinely needs it — `instructions.md` already orders it to surface conflicts and it
currently has no way to know one exists.

Everything else the receipt shows stays out of the tool payload. `SOURCE_EXCERPT_LENGTH` is
1500 (`packages/knowledge/search.ts:74`); pushing excerpts and provenance for twenty facts
would add roughly 30 KB of model context per search, describing things the model must never
narrate anyway. The client fetches receipts from `getReceipts` on first chip click per
message and caches them in a `Map`.

### UI

`apps/app/app/(authenticated)/components/brain/`:

- **`citation-chip.tsx`** (new) — replaces the hover-card bodies in `fact-citation.tsx` and
  `source-citation.tsx`. A button: filled square = checked, hollow = unchecked, plus a
  per-answer sequence number. `aria-expanded`, keyboard reachable, works on touch.
  **The broken-citation treatment is preserved exactly as loud as it is today** — an id the
  tools never returned stays destructive-red and self-explaining. It is the single most
  important thing that can appear on this screen.
- **`receipt-panel.tsx`** (new) — renders a `Receipt`. Bordered block below the message that
  owns the selected chip, mirroring `trace.tsx`'s composition: rows, quote, verdict.
- **`brief-pane.tsx`** (new) — brief cards. Cold start: no dossiers → question chips built
  from existing entities; no entities → point at Capture.
- **`knowledge-chat.tsx`** — citation components swapped; selection state (`selectedCitation`
  per message) added; receipt cache; the `Tool` block replaced by one line
  ("Looked up »Nordwind« — 6 facts, 2 unchecked notes"), collapsible; empty state replaced by
  `brief-pane`; strings to English.
- **`fact-citation.tsx` / `source-citation.tsx`** — reduced to chip renderers over the
  shared component; `CATEGORY_LABELS` translated.

The `user-content-` clobber-prefix stripping (Streamdown's DOM-clobbering protection) stays
where it is — it is load-bearing and easy to lose in a refactor.

### Indexes

- `dossiers` needs `{ tenantId: 1, updatedAt: -1 }` for `listBriefTargets`. The existing
  index is `{ tenantId, anchor.kind, anchor.id }` (unique) and does not serve the sort.
  Added to `ensureIndexes`.
- The contested lookup rides the existing `proposals` `{ tenantId, status, createdAt }`
  index down to open proposals, which are bounded by the review queue. Measure with
  `explain` before adding a multikey index on `factDrafts.supersedes` — do not add one
  speculatively.

## Testing

| What | Where | Needs a DB |
| --- | --- | --- |
| `composeReceipt` — all four tiers, missing source, unresolvable `confirmedBy`, absent `validFrom` | `packages/knowledge/__tests__/receipt.test.ts` | no |
| `buildBrief` — contested floats up, cap at 5, source tail at 2, empty input | `packages/knowledge/__tests__/brief.test.ts` | no |
| `getReceipts` tenant scoping — ids from another tenant return nothing | `apps/app/__tests__/receipts.test.ts` | no (mocked) |
| Chip renders broken state for an unknown id | `apps/app/__tests__/citation.test.tsx` | no |

The 62 existing tests must stay green. The nine eval suites in `apps/app/evals/` must stay
valid — guaranteed by leaving the citation protocol and `instructions.md` untouched.

## Risks

- **`confirmedBy` may not resolve.** Consolidation- and contradiction-authored facts, and
  eval fixtures (`confirmedBy: "eval-fixture"`), carry ids that are not org members.
  Mitigated by the `"a teammate"` fallback; never show the raw id.
- **`capturedBy` is an email, not a name.** Resolved through the same member map; falls back
  to the address, which is at least true.
- **A tenant with no dossiers gets no briefs.** Expected for a new workspace — that is what
  the cold-start path is for, and it is the common case at launch.
- **Receipt fetch is a second round trip.** Deliberate; the alternative is 30 KB of dead
  context per search. Lazy, on first chip click, cached per message. Briefs use the same
  `getReceipts` path rather than composing receipts server-side — the facts are already
  loaded there and it would be free, but one path is worth more than one saved request.

## Sequence

1. `composeReceipt` + tests
2. `buildBrief` + tests
3. `getReceipts` and `listBriefTargets` actions, `dossiers` index, name resolver
4. `contested` on `search-knowledge`
5. `citation-chip` + `receipt-panel`, wired into `knowledge-chat`
6. `brief-pane` and the empty-state replacement
7. Tool block → status line; English chrome sweep
8. Verify: `bun run check`, `bun test`, `turbo build`, manual pass at 1440px and 390px

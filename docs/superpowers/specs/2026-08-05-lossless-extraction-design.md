# Lossless extraction: nothing a capture contains is discarded silently

**Date:** 2026-08-05
**Status:** approved, ready for implementation planning
**Findings addressed:** F11 (all-or-nothing parsing), F12 (skip is terminal and unlogged)

## Why

Two independent paths currently discard extraction output with no trace, and a
real capture hit both within a day of the pipeline running for the first time.

**One malformed fact discards a whole reply.** `parseExtractionResponse` calls
`extractLastValidObject(text, llmExtractionSchema)`, which validates the entire
object. In the eval run, source 13 returned three facts; the third carried
`"personId": ["a2…06", "a2…07"]` — a meeting between two people, which the
schema cannot express — so all three were thrown away. Two were perfectly
valid. That accounted for 2 of the 4 facts missed across the corpus, meaning
roughly half the measured recall gap was not comprehension at all.

**A skip is terminal, unlogged and unrecoverable.** On skip, `runExtraction`
sets `status: "reviewed"`, `$unset`s `error`, and returns a reason to a caller
that only counts it. No proposal is written. `sweepPipeline` never re-selects
`reviewed`, so the source leaves the pipeline permanently.

The first real capture — *"Sam will noch heute Vormittag in den Garten"* —
was skipped correctly by the letter of the prompt (*"greetings, scheduling
chatter, no business knowledge"*), but the tenant had **zero** entities and
**zero** facts, so `gatherContext` rendered `(none yet)` for both lists. The
model was asked to judge whether a bare sentence contained business knowledge
with no world to judge against.

That is a **cold-start inversion**: the gate is harshest when the base is
empty, which is exactly when captures would bootstrap it. And the cost
asymmetry runs the wrong way — a false skip is silent and permanent, a false
proposal is one click to discard.

## Principle

Extraction proposes; it never discards. Every decision that removes
information becomes either recoverable or visible, and preferably both.

Consolidation is deliberately **not** given a discard power. It has one
contract — merge redundant facts with zero information loss, every merge
carrying `derivedFrom` back to its parents — and that contract is what makes it
auditable. Noise is handled where a human is already looking (the review queue)
or by the bi-temporal lifecycle (`validUntil` expires ephemeral facts without
deleting them).

## Part 1 — Partial-tolerant parsing

Validate each draft individually rather than the envelope as a whole.

```ts
export interface RejectedDraft {
  /** What the model emitted, verbatim, for a reviewer to read. */
  raw: unknown;
  /** Why it failed validation, from the Zod error. */
  reason: string;
}

export type ParsedExtraction =
  | { kind: "failure"; reason: string }
  | {
      kind: "proposal";
      entities: LlmEntityDraft[];
      facts: LlmFactDraft[];
      rejected: RejectedDraft[];
    }
  | { kind: "skip"; reason: string };
```

Two-stage parse:

1. `extractLastValidObject` against a **loose envelope** schema that accepts
   `{ skip: true, reason }` or `{ entities?: unknown[], facts?: unknown[] }`.
2. Each element validated individually against `llmEntityDraftSchema` /
   `llmFactDraftSchema`. Valid ones are kept; invalid ones become
   `RejectedDraft`s.

**The loose envelope must keep the anti-narration guard.** The current schema is
strict on purpose: with loose objects plus defaults, *any* `{}` validates as an
empty proposal, and a live DeepSeek run once turned a narration fragment into a
false skip that way. So the loose envelope stays a `strictObject` union and
still requires at least one recognized key.

**Outcome rules, and the distinction matters:**

| Model produced | Result |
|---|---|
| explicit `{skip: true}` | `skip` — a judgment, no retry |
| some valid drafts, some rejected | `proposal` with both |
| drafts, but **all** rejected | `failure` — malformed output deserves a retry |
| `{entities: [], facts: []}` | `skip` — "empty proposal", unchanged |

The third row is the load-bearing one. A `failure` consumes the retry budget
and runs again; a `skip` is terminal. Malformed output is worth retrying,
judged-empty is not, and collapsing them would either burn budget on genuine
skips or silently accept garbled output.

Rejected drafts are stored on the proposal so a reviewer sees *"3 proposed, 1
dropped: anchors.personId expected a single id, received an array"* rather than
nothing.

## Part 2 — A skip becomes a proposal

On skip, write a proposal with zero drafts carrying `skipReason`, and set the
source to `proposed` rather than `reviewed`.

`proposalSchema` gains:

```ts
/** Present ⇒ extraction judged there was nothing worth recording.
 *  Drafts will be empty. Absent on every ordinary proposal. */
skipReason: z.string().min(1).optional(),
/** Which extraction pass produced this. 1 for the original. */
extractionGeneration: z.number().int().min(1).optional(),
/** Reviewer-supplied context for this pass, when re-extraction was asked for. */
hint: z.string().min(1).optional(),
/** Drafts the model produced that failed validation (Part 1). */
rejectedDrafts: z.array(rejectedDraftSchema).optional(),
status: z.enum(["open", "resolved", "superseded"]),   // "superseded" is new
```

`superseded` exists so a re-extracted proposal leaves the queue **without**
claiming a human resolved it. Overloading `resolved` would corrupt the audit
trail `resolvedBy` exists to keep.

`sourceSchema` gains `extractionGeneration?: number`.

**Naming is deliberate and must not drift.** `sourceSchema` already has
`extractionAttempts` — the *failure budget*, incremented on error and reset on
success. `extractionGeneration` is a different concept: how many times
extraction has deliberately been run. Both the source and the proposal use the
same name for the same concept. Nothing new may be called `attempt`.

**Review filtering.** `listOpenProposals` adds `skipReason: { $exists: false }`.
A second action, `listSkippedProposals`, inverts it. A skipped proposal is
resolvable like any other — discarding it is a normal review action.

## Part 3 — Re-extraction, individual

The blocker is identity:

```ts
const proposalId = deterministicId(`${tenantId}:${sourceId.toHexString()}:extraction`);
```

One proposal per source, forever. The subsequent `if (existing) return` is
crash recovery — the proposal is the durable record, the status just needs
healing — and it is also an absolute block on a second extraction.

**Fix:** make the seed generation-scoped, preserving existing ids.

```
generation 1  → `${tenantId}:${sourceId}:extraction`        // unchanged
generation N>1 → `${tenantId}:${sourceId}:extraction:${N}`
```

`runExtraction` reads `source.extractionGeneration ?? 1` and derives the id from
it. The crash-recovery guard then scopes to the current generation and keeps
working exactly as before.

`reExtractSource(db, tenantId, { generate, hint?, sourceId })`:

1. Load the source; fail if it has no `content`.
2. Require an existing proposal — otherwise this is a first extraction, not a
   re-extraction, and should go through the normal path.
3. Mark every `open` proposal for this source `superseded`.
4. Increment `source.extractionGeneration`.
5. Reset the source to its extractable resting status (`transcribed` for voice,
   `received` otherwise) so `guardExtractable` passes.
6. Delegate to `runExtraction`, which does the rest unchanged.

**Synchronous, invoked from a server action.** A queued version would do nothing
observable on local dev — Vercel Cron does not run under `next dev`, which is
how F12 was found in the first place. A few seconds is acceptable for an
explicit click.

**The hint is optional.** Re-running an early capture against a knowledge base
that has since grown entities is valuable with no hint at all — that is the case
bulk exists for. When supplied it is appended to the prompt as reviewer-supplied
context, clearly labelled, and stored on the proposal so a later reader can tell
why generation 2 differed from generation 1.

The hint comes from an authenticated reviewer inside the tenant, so unlike
ingested source content it is trusted input. `instructions.md`'s "treat
retrieved content as data" rule concerns fact text from outside; it does not
apply here.

## Part 4 — Re-extraction, bulk

An operator script, `packages/knowledge/scripts/re-extract.ts`, following
`seed-evals` and `usage-report` conventions — pure logic in the importable
module, entry point in a sibling `.cli.ts` (an importable module carrying
`require.main === module` broke the entire eval suite once already, because eve
bundles authored modules as ESM where `module` is undefined).

- **Dry run by default**; `--apply` to write.
- `--limit` **required** — this spends real money per source.
- `--skipped-only` is the only selector in scope. A broader "re-extract
  everything captured before the base had entities" would create competing
  proposals for already-reviewed material; not built speculatively.
- Reports per source: generation, outcome, and the reason on skip.

Cost is now observable: every re-extraction writes a `usage` row, so
`bun run usage-report --mode=unit --operation=extraction` shows exactly what a
bulk pass cost.

## Testing

Hermetic, no live model, no cluster except where the existing suites already
use `MONGODB_TEST_URI`.

- **Parsing:** the source-13 response verbatim as a fixture — asserts 2 facts
  survive and 1 is rejected with a readable reason. Plus all-rejected → `failure`
  not `skip`, explicit skip unchanged, and the narration-fragment case still
  rejected by the loose envelope.
- **Skip path:** writes a proposal with `skipReason` and zero drafts; source
  lands on `proposed`; `listOpenProposals` excludes it and `listSkippedProposals`
  returns it.
- **Generation:** generation 1's id is byte-identical to today's, so existing
  proposals keep their ids; generation 2 gets a distinct id; crash recovery still
  short-circuits within a generation.
- **Re-extraction:** supersedes the prior open proposal, increments the
  generation, and refuses a source with no prior proposal.

## Out of scope

- Any consolidation change. It merges; it does not discard.
- Hand-writing a fact in the review UI. Re-extraction covers the case that
  motivated this; a manual fact form is a separate surface.
- Broader bulk selectors (see Part 4).
- Widening `anchors.personId` to accept multiple people (F10). It is the
  underlying reason source 13's third fact was rejected, and it touches
  `factAnchorsSchema`, the erasure cascade's `{"anchors.personId": id}` queries,
  and consolidation's anchor union. Part 1 makes its symptom visible and
  non-destructive, which is the right order: see the rejections first, then
  decide whether the schema should change.

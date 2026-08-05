# Findings — knowledge hub evals

Issues surfaced while building the synthetic corpus and eval suite
(`docs/superpowers/specs/2026-08-03-knowledge-evals-design.md`). Fixes land on
this branch unless noted.

Status: `open` · `fixed` · `wontfix` · `external`

---

## F1 — Eval sessions carry no tenant, so every eval fails on plumbing

**Status:** fixed · **Severity:** blocker

Resolved in `d1d5941` by inserting `evalTenant` between `betterAuthSession`
and `localDev()` in `apps/app/agent/channels/eve.ts`, exactly as proposed
below, plus `apps/app/__tests__/eval-tenant.test.ts` covering the unset,
non-loopback, and loopback-with-tenant cases.

`agent/channels/eve.ts:40` chains `[betterAuthSession, localDev()]`. Under
`eve eval` there is no better-auth cookie, so the walk falls through to
`localDev()`, which returns (`node_modules/eve/dist/src/public/channels/auth.js`):

```js
const LOCAL_DEV_SESSION_AUTH_CONTEXT = {
  attributes: {},                // empty
  authenticator: `local-dev`, principalId: `local-dev`, principalType: `local-dev`
};
```

`search-knowledge.ts:29` reads `ctx.session.auth.current?.attributes?.tenantId`,
finds nothing, and throws *"No active organization on this session"*. Both
`citations.eval.ts` and `abstention.eval.ts` fail — on plumbing, which is
exactly the "every eval fails for the same uninteresting reason" outcome
`evals/README.md` warns about, from a cause it did not anticipate.

There is no fix available from the eval side: `EveEvalContext` exposes no auth
or header hook for sessions created via `t.send()`, and `target.fetch()` does
not govern session creation.

**Fix:** a third verifier, gated on both an env var and loopback.

```ts
const evalTenant: AuthFn<Request> = (request) => {
  const tenantId = process.env.EVAL_TENANT_ID;
  if (!tenantId || !isLoopbackRequest(request)) return null;
  return { attributes: { tenantId }, authenticator: "eval",
           principalId: "eval", principalType: "user" };
};
export default eveChannel({ auth: [betterAuthSession, evalTenant, localDev()] });
```

This grants no access that is not already granted: `localDev()` already admits
any loopback request unauthenticated. It only stamps a tenant attribute onto a
principal that already gets in, and in production `EVAL_TENANT_ID` is unset so
it returns `null` before the loopback check matters.

Rejected alternative: defaulting the tool to some tenant when none is present.
The existing code comment calls this correctly — *"guessing one would be the
whole ballgame."*

---

## F2 — CLAUDE.md documents a database stack that does not exist

**Status:** fixed · **Severity:** medium

CLAUDE.md describes Prisma with a Neon PostgreSQL adapter, a schema at
`packages/database/prisma/schema.prisma`, a generated client at
`packages/database/generated/client/`, and `bun migrate` / `bunx prisma studio`
commands.

None of it exists for `packages/database`. There is no `schema.prisma`
anywhere in the repo and no `migrate` script in the root `package.json`.
`packages/database` is a thin MongoDB wrapper exposing two collections,
`subscribers` and `digests`. (A `prisma` dependency does exist elsewhere in
the repo — `apps/studio/package.json` — but its `dev` script points at that
same nonexistent schema; see the fix note below.)

This is actively misleading to any agent reading CLAUDE.md as authoritative —
which is what it is for.

**Fix:** rewrite the Database sections of CLAUDE.md to describe what is there.

Fixed in `ce4f927`: removed `bun migrate`, `bunx prisma studio`, `bunx
prisma generate`, the `schema.prisma` Key Files entry, and the generated-client
Development Notes line; rewrote the `@repo/database` bullet and the Technology
Stack `Database` line to describe the actual MongoDB client. Note left for a
future pass: `apps/studio/package.json` still carries an unused `prisma`
devDependency and a `dev` script pointing at the same nonexistent
`schema.prisma`, and `.vscode/extensions.json` still recommends the Prisma
extension — both are template leftovers, out of this fix's scope (CLAUDE.md
and `packages/database` only), but the same staleness. CLAUDE.md's
Applications list also still advertises **studio — Database management UI**
as a working app; it cannot start, for the same reason (`prisma studio`
against a schema file that does not exist).

---

## F3 — `@repo/database` writes to a database named `test`

**Status:** fixed · **Severity:** medium · **migration must run before deploy**

`packages/database/index.ts:14` calls `client.db()` with no argument, so the
driver uses the database named in the connection string's path. `MONGODB_URI`
ends in `.mongodb.net/` — trailing slash, no database name — and the driver's
fallback in that case is `test`.

So `subscribers` and `digests` live in a database called `test` on the live
cluster. Meanwhile `packages/knowledge/client.ts:42` correctly defaults to
`.db(KNOWLEDGE_MONGODB_DB ?? "knowledge")`.

The two have never collided, but only because they were never in the same place.
The separation is accidental rather than chosen.

**Fix:** give `MONGODB_URI` an explicit database name, or pass one to `.db()`.

Not fixed by merging `MONGODB_URI` and `KNOWLEDGE_MONGODB_URI`. `@repo/database`
is live in three apps (digests preview, newsletter confirm, keep-alive cron), so
it is not removable, and `@repo/knowledge` is deliberately runtime-portable with
its own client bootstrap. Two names for one cluster costs nothing and keeps the
option to split later.

Fixed in `ce4f927`: `client.db()` now takes `process.env.MONGODB_DB ?? "app"`
explicitly. Confirmed safe to change the default outright (no migration owed):
neither `test.subscribers` nor `test.digests` exists, and no data has ever been
written there — the writing code in `apps/web` (newsletter confirm) and
`apps/app` (digests) is inherited from the forked template and has never run
against this cluster.

**`test` is not vacated — do not drop it.** This fix moved only
`@repo/database`'s own default, plus `apps/email/scripts/digest.ts` and
`apps/api/app/cron/keep-alive/route.ts`, its two other consumers writing
`subscribers`/`digests` — all three were confirmed empty, so moving them to
`app` cost nothing.

`packages/auth/instance.ts` calls the same `client.db()` with no argument
against the same `MONGODB_URI`, and holds every better-auth collection
(`user`, `session`, `organization`, `member`, …) there — real, live,
in-use data, unrelated to `subscribers`/`digests`. A later pass in this
branch briefly moved it to `MONGODB_DB ?? "app"` too, on the assumption
that it had the same "never written" gap as the other three; it does not.
That would have pointed a deployed app at an empty database and made every
existing user, session and organization (and, since the active
organization id is the knowledge hub's `tenantId`, every knowledge feature
gated on it) unreachable. Reverted at the time: `packages/auth/instance.ts`
went back to plain `client.db()`, so auth kept reading `test`, where its
data actually was.

**Resolved:** the maintainer decided to migrate rather than leave the
exception permanently in place, so every non-knowledge collection ends up
in one database and `test` can eventually be dropped.
`packages/auth/scripts/migrate-to-app-db.ts` copies every collection in
`test` (and its non-`_id` indexes) into `MONGODB_DB ?? "app"` — dry-run by
default, gated behind `--apply`, safe to re-run (a document already present
at the same `_id` is left alone, not duplicated or overwritten), and it
never deletes anything from `test`. `packages/auth/instance.ts` now calls
`client.db(process.env.MONGODB_DB ?? "app")`, the same as its three
siblings.

**Ordering, load-bearing:** the migration must be run with `--apply`, and
its verify pass must come back clean, *before* a deploy carrying the
`instance.ts` change ships. Deploying first points the running app at an
empty `app` database and signs every user out — the exact failure mode the
revert above exists to document. This does not vacate `test`: the
migration is copy-forward, not a move, so `test` still holds every
document it did before. Dropping `test` is a separate, later, manual
decision the maintainer makes only after confirming login still works
against `app`.

---

## F4 — `@repo/database` undoes the connection-pool sizing `@repo/knowledge` sets

**Status:** fixed · **Severity:** medium

`packages/knowledge/client.ts:32` sets `maxPoolSize: 5` with a comment
explaining that every warm serverless instance holds its own pool and small
Atlas tiers cap at 500 connections cluster-wide.

`packages/database/index.ts:9` is `new MongoClient(keys().MONGODB_URI)` — no
options at all, so the driver default `maxPoolSize: 100` applies, against the
same cluster, from three apps. The care taken in one package is silently undone
by the other.

**Fix:** pass the same pool and timeout options in `@repo/database`.

Fixed in `ce4f927`: `@repo/database`'s `MongoClient` now takes the same
`appName`, `connectTimeoutMS`, `maxIdleTimeMS`, `maxPoolSize: 5`,
`serverSelectionTimeoutMS`, and `socketTimeoutMS` options as
`@repo/knowledge/client.ts`.

---

## F5 — `MONGODB_URI` credential exposed in a session transcript

**Status:** open · **Severity:** high · **External action required**

A redaction pipeline in an agent session fell through when `sed` and `md5` were
unavailable in the sandbox, printing `MONGODB_URI` in full — including the
password for `spiritsdontfly_db_user` on `cluster0.2pezspf` — into the session
transcript.

**Fix:** rotate the database user's password in Atlas.

Related: the `VOYAGE_API_KEY` noted in the branch handoff was also pasted in
plaintext in an earlier chat and should be rotated at the same time.

---

## F6 — Nothing gates lint or tests, and the root check has 499 errors

**Status:** open · **Severity:** medium

`bun run check` (ultracite/biome) reports **499 errors** across the repo. All of
them are in files this branch never touched: `apps/storybook/stories/*`, the
`apps/web` masterclass demos, `packages/cms/lib/mdx.ts`, `apps/email/scripts/`,
`scripts/`, `turbo/generators`. Verified by intersecting the erroring file list
with `git diff --name-only origin/main...HEAD` — the intersection is empty.

The cause is that **`.github/workflows/` contains only `claude.yml` and
`renovate.yml`.** No workflow runs `bun run check`, `bun test` or `tsc`, so
nothing has ever stopped lint errors from accumulating. `turbo.json` wires tests
into the build graph, but no CI invokes it.

Two separate consequences:

1. Any contributor running the documented `bun run check` sees 499 errors and
   cannot tell which are theirs. Eval implementers must use a scoped check
   instead — see the plan's Global Constraints.
2. The branch's own quality claims rest on manual runs.

**Fix:** out of scope for this branch beyond the scoped-lint workaround. Worth a
follow-up PR adding a CI workflow, and a decision on whether to bulk-fix or
baseline the 499.

Note: `packages/database/index.ts` and `keys.ts` had two trivial
`useSortedKeys` errors that were in scope, since Task 5 modified both files —
fixed alongside F2/F3/F4 in `ce4f927`.

---

## F7 — Two structural dangling-reference gaps in the source/fact fixtures

**Status:** open · **Severity:** low (both fail safe today)

`fixtures/facts.ts`'s `srcId(n) = ((n - 1) % 35) + 1` assigns every one of the
80 facts a source ordinal independent of tenant or topic. Two consequences of
that independence are permanent, by-design gaps that a later implementer
could otherwise mistake for bugs in their own code:

**1. Facts on `shouldSkip` sources have no supporting content, on purpose.**
Every one of the 35 source ordinals has at least one fact pointing at it —
there is no "empty" ordinal to give to a genuinely content-free skip source
(bare Terminbestätigung / thank-you / OOO autoreply). The three chosen skip
sources (ordinals 9, 24, 28) still have facts 9, 44, 24, 59, 28, 63 pointing
at their `sourceId`, but those sources' `content` is intentionally pure noise
and does not support them. All six are low-confidence filler facts (~0.7–0.85)
outside every `PLANTED` bucket, chosen specifically to minimize the blast
radius — see `packages/knowledge/fixtures/sources.ts`'s per-source comments
and `.superpowers/sdd/2026-08-03-knowledge-evals/task-3-report.md` for the
selection rationale. Task 8's extraction eval should not expect these six
facts' text to be derivable from their nominal source.

**2. BETA facts (ordinals 66–80) cite `sourceId`s from ALPHA-only sources.**
All 35 sources are `tenantId: TENANT_ALPHA` (by design — see the task-3
brief). The same topic-blind `srcId` formula still stamps a `sourceId` from
that ALPHA-only set onto every `TENANT_BETA` fact. In a real system a
Beta-tenant fact would never be extracted from an Alpha-tenant source, so
those 15 `sourceId`s are permanently dangling references — the source they
point at exists, but its content has nothing to do with the Beta fact and
was never written to.

This is safe today because, per the reviewer of Task 3: every
`sources.findOne` / `countDocuments` call site in `@repo/knowledge` filters
by `{ _id, tenantId }` together, so a Beta-tenant read scoped correctly will
never resolve these into cross-tenant content — it fails closed, not open.
No code path was found that reads `fact.sourceId` without also filtering by
`fact.tenantId` on the source lookup.

**Fix:** none needed for the eval corpus itself — both are consequences of
`srcId`'s fixed formula, which `fixtures/facts.ts` is a contract Tasks 6 and
9–11 depend on (Task 3 must not change fact-to-source assignments). If a
future implementer wants `sourceId` to imply tenant/content coherence
universally, `srcId` would need to become tenant- and topic-aware, which is
a `facts.ts` change, not a `sources.ts` one. Flagging here so it isn't
rediscovered as a "bug" by Task 6 (consolidation), Task 9 (contradiction),
or Task 11 (post-erasure) implementers who grep for a fact's `sourceId` and
find content that doesn't match.

---

## F8 — ZDR is not requested on any production model call

**Status:** open · **Severity:** medium (predates this branch, contradicts a stated assumption) · **maintainer accepts account-level ZDR as sufficient — see decision note below**

`packages/knowledge/gateway.ts`'s `GatewayConfig` has no `providerOptions`
field, and `createGatewayGenerate`'s fetch body sends only `model`,
`max_tokens`, `messages` and optionally `reasoning_effort` — there is no
`providerOptions.gateway.zeroDataRetention` anywhere in it.

That same function is what production extraction runs on:
`apps/api/app/cron/knowledge-pipeline/route.ts:44` calls
`createGatewayGenerate()` with no config, inside `sweepPipeline`, which is the
cron sweep that processes captured sources (meeting transcripts, forwarded
client email) into fact proposals.

ZDR at the Vercel AI Gateway is enforced **per request**, via
`providerOptions.gateway.zeroDataRetention`, and hard-fails (`400
no_providers_available`) when no covered provider exists for that request —
`packages/knowledge/scripts/probe-zdr.ts` and `evals.config.ts`'s judge both
set the flag explicitly and rely on exactly that hard-fail behaviour. Without
the flag, there is nothing to hard-fail: the request is simply not asking for
ZDR.

**Consequence:** real extraction traffic is not requesting ZDR today. This
predates this branch — `gateway.ts` was introduced in f5f6598/95273fe, well
before this plan started — so it is not a regression introduced here, but it
contradicts an assumption the user has stated explicitly (that ZDR applies to
extraction), and they should hear that directly rather than have it stay
buried in this log.

**What is NOT known:** whether Vercel's account-level ZDR setting
independently covers traffic that carries no per-request flag. The Vercel AI
Gateway docs describe the per-request `providerOptions` mechanism in detail
and are silent on whether an account-wide ZDR toggle also blankets requests
that omit it. Do not assume either way — this needs confirming with Vercel
support or a controlled test, not inference from the docs' silence. Until
confirmed, treat production extraction traffic as **unconfirmed** for ZDR
coverage, not as a confirmed leak.

**Maintainer decision:** the maintainer has configured Zero Data Retention
at the Vercel AI Gateway account level and considers that sufficient
coverage for production extraction traffic, without also setting the
per-request `providerOptions.gateway.zeroDataRetention` flag. This is
recorded as the maintainer's decision, not as a technical confirmation —
the observation above stands unchanged: `createGatewayGenerate` still does
not send the per-request flag, and the Vercel AI Gateway docs describe
enforcement in per-request terms and are silent on whether an
account-level toggle independently covers requests that omit it. Nothing
here resolves that gap technically; it records that the maintainer has
chosen to rely on the account-level setting rather than wait for it.

**Fix:** add a `providerOptions` passthrough to `GatewayConfig` and set
`{ gateway: { zeroDataRetention: true } }` at both call sites that construct
a production generator (the extraction worker's `createGatewayGenerate()` in
`apps/api/app/cron/knowledge-pipeline/route.ts`, and any other production
caller of `createGatewayGenerate`). Out of scope for this branch — Task 12 is
env-independent documentation only; this is a code change that itself needs
verification against a live gateway.

---

## F9 — No relevance floor on the read path: retrieval never comes back empty

**Status:** open · **Severity:** medium (product design gap, not a bug) · **not fixed on this branch, by design**

`abstention.eval.ts`'s first live run, against a real Atlas cluster, asked
about "Quintus Federweiß von der Zabelthorpe Holding" — a person and an
organization that do not exist anywhere in the corpus — and
`search-knowledge` still came back with five facts: about Thorsten
Wiechmann, Sabine Ohlsen, Petra Lindqvist and Jonas Reimer, none of them
connected to the question in any way. The eval's original assertion (no
`<fact id="…">` marker at all in an answer about a nonexistent person)
failed, even though the agent answered correctly — it cited one of the
five and said explicitly that the base held nothing on the person or
organization actually asked about. The judge scored that response 100%.

The cause is structural, not incidental. `packages/knowledge/retrieval.ts`
fuses two arms with `$rankFusion`:

- **Semantic arm:** `$vectorSearch` (`retrieval.ts:123-134`) returns its `k`
  nearest neighbours by construction — cosine distance to *something* is
  always defined, so there is no threshold below which a candidate is
  dropped for being too dissimilar. The nearest neighbour to a query about a
  person is returned whether it is 90% similar or barely related at all.
- **Lexical arm:** the `$search` compound query (`retrieval.ts:97-117`) uses
  `fuzzy: { maxEdits: 1 }`, which further widens the match rather than
  narrowing it, and carries no minimum score either.

Neither arm, nor the `$rankFusion` stage combining them, nor the optional
Voyage reranker downstream, has a cutoff. So "the search comes back empty"
is not a state `search-knowledge` can reach for any non-empty tenant corpus,
regardless of how unrelated the query is to everything stored. The only
thing that ever distinguishes "the base genuinely has nothing on this" from
"the base has facts, and none of them are relevant" is the model's own
judgement about what it was handed — there is no signal earlier in the
pipeline it could consult instead.

**Consequence for the eval suite:** `abstention.eval.ts` was rewritten (this
finding's originating commit) to assert what is actually checkable given
this: no fact the agent *cites* is itself about the asked-about entity,
plus a judge call on whether the surrounding prose reads as "we have
nothing" rather than as an answer. That is now the full extent of what a
deterministic gate can promise here — retrieval provides no signal to check
against, so the abstention property rests entirely on the model choosing
not to over-claim relevance for what it was handed.

**Fix:** not applied — this is a design decision for the maintainer, not a
bug to patch reflexively. A relevance floor is a real option (e.g. a
minimum fused/rerank score before a candidate is surfaced to the model at
all, or before it is offered as citable), but it trades against recall on
genuinely relevant-but-lexically-distant matches, and picking a threshold
needs real traffic, not this synthetic corpus (see "What is deliberately
NOT covered" in `evals/README.md` on why retrieval A/B tuning isn't done
here). Flagging the gap is this finding's whole job; closing it is a
separate, later decision.

---

## F10 — The fact-anchor schema cannot express a fact about two people

**Status:** open · **Severity:** medium (recall gap; fails safe, not silently — the fact is dropped, not misfiled)

Source ordinal 13 (`packages/knowledge/fixtures/sources.ts`, "HfN Martin
Kowalski — role AFTER + Vogelsang Steering-Meeting") contains: *"…für das
Projekt Prozessoptimierung Fertigung bei Vogelsang ist, sobald es startet,
ein wöchentliches Steering-Meeting mit Katrin Suhrbier und Bjarne Petersen
angedacht."* — a fact genuinely about two people at once (a meeting between
them), neither one incidental to the other.

The model's captured extraction reply for this source proposed exactly that
fact, anchored as `"personId": ["a20000000000000000000006",
"a20000000000000000000007"]` — an array holding both Katrin Suhrbier's and
Bjarne Petersen's fixture ids (`oid(ID_KIND.person, 6)` and
`oid(ID_KIND.person, 7)` respectively, confirmed against
`packages/knowledge/fixtures/corpus.ts` and `fixtures/ids.ts`'s deterministic
id scheme). That is the semantically correct representation of the fact.

It does not validate. `llmFactDraftSchema.anchors` in
`packages/knowledge/extraction.ts:47-64` types `personId` (and
`organizationId`, `engagementId`) as `hexObjectId.optional()` — a single id,
never an array. `factAnchorsSchema` in `packages/knowledge/schemas/facts.ts:15-27`,
the schema for the persisted `Fact` document itself, has the identical
single-id shape. The model did the honest thing and the schema rejected it
(see F11 for what "rejected" costs in this specific case — it did not just
lose this one fact).

**Consequence:** real facts routinely involve more than one person — a
meeting, a disagreement, a handover, a decision made jointly. The schema can
currently only express "primarily about one person," so a model faced with a
genuinely two-person fact must either drop it, arbitrarily anchor it to one
person and silently lose the other's connection to it, or — as observed
here — propose the correct shape and be rejected. No prompt wording fixes
this; a single-id field cannot hold two ids no matter how it's asked for.

**Suggested fix (not implemented):** widen `anchors.personId` to accept an
array of ids (uniformly, or as a union with the single-id form for
backward compatibility) in both `llmFactDraftSchema` and
`factAnchorsSchema`. This is a real, multi-file schema change, not a local
edit:
- Every reader that currently treats `fact.anchors.personId` as a single
  `ObjectId | undefined` needs auditing — `anchors.ts`, `dossier.ts`,
  `review.ts`, `extraction-run.ts` all destructure it that way today.
- `erasePerson`'s cascade filter in `packages/knowledge/erasure.ts:355`,
  `{ "anchors.personId": personId, tenantId }`, happens to keep working
  unchanged if the field becomes an array — MongoDB's equality match against
  an array field matches when the array *contains* the value — but that is
  worth confirming with a test, not assuming, once the field actually
  changes shape. It also raises a real access question this finding doesn't
  answer: a multi-person fact must be erasable by *either* person under Art.
  17, and today's single-anchor cascade was never designed to reason about
  that.
- Consolidation's anchor-union logic would need to union member ids across
  merged facts rather than compare two scalars.

Flagging here so it isn't rediscovered as a mysterious extraction gap; not
fixed on this branch.

**The symptom is no longer silent, even though the schema is unchanged.**
F11's fix (`94e3a42`) means a rejected draft like this one is no longer
dropped along with its siblings — it survives as a `RejectedDraft` (verbatim
text plus the reason naming the field, e.g. `anchors.personId: Invalid
input: expected string, received array`), and `649a135` persists it on the
proposal as `rejectedDrafts`. The review UI (`apps/app/app/(authenticated)/
review/page.tsx`) badges it directly on the proposal list — a destructive
`"N rejected"` badge next to the proposal's kind and source type, for both
open and skipped proposals — via `rejectedCount` in
`apps/app/app/actions/knowledge/list-proposals.ts`. This does not widen
`anchors.personId`; a two-person fact is still unrepresentable and still
gets rejected. What changes is that rejection is now visible in the one
place a reviewer actually looks, instead of only in a discarded parse
result nobody read. A future reader deciding whether to widen the schema
should look at how often that badge actually appears in production —
that frequency is the real-world evidence this finding's fix was missing,
and is now being collected for free.

---

## F11 — Parsing is all-or-nothing, so one invalid fact discards every fact in that reply

**Status:** fixed · **Severity:** high (understates measured recall; folds comprehension successes into failures)

`packages/knowledge/extraction.ts`'s `parseExtractionResponse` calls
`extractLastValidObject(text, llmExtractionSchema)`
(`packages/knowledge/llm-reply.ts:51-83`), which runs
`schema.safeParse(json)` against the **entire** top-level candidate object —
`{"entities": [...], "facts": [...]}` validated as one Zod object, not
per-item. `z.array(llmFactDraftSchema)` fails the whole array, and therefore
the whole object, the moment any single element fails its own schema; there
is no partial-success path. `extractLastValidObject` returns the object only
when `parsed.success` is true for the object as a whole; otherwise it moves
on and tries the next balanced `{...}` in the text, and if none validates,
`parseExtractionResponse` returns `{ kind: "failure", ... }` for the source.

Source 13's captured reply contained three fact drafts. Two were fully valid
on their own. The third was the two-person meeting fact from F10, which
failed anchors validation. Because all three lived inside one JSON object,
the invalid third fact took the two valid ones down with it —
`parseExtractionResponse` reported total failure for the source, not a
proposal carrying the two good facts plus one flagged rejection.

**Consequence:** the eval run scored source 13 as extracting 0 facts against
its ground truth, when the model had actually produced correct output for at
least two of the four facts the run counted as missed for that source. That
means roughly half the recall gap attributed to source 13 is a parsing-contract
artifact, not a model-comprehension signal — the model understood the source
correctly in those two cases and got no credit for it. The reported 93.1%
recall number understates what the model actually extracted.

This also corrects an earlier, incorrect diagnosis of the same failure: the
first read of this result attributed it to truncation or a `max_tokens`
cutoff. That was wrong. The captured raw response for source 13 was 1,093
characters and ended cleanly on a closing brace — a complete reply. What
looked like truncation was `parseExtractionResponse`'s own failure-reason
string, which clips to 200 characters for display
(`text.slice(0, 200)` at `extraction.ts:147` and `:153`); that clipping is a
display artifact of the error-reporting path, not evidence the model's
output itself was cut off. (A repo-wide check found no other place currently
asserting this misdiagnosis — nothing else needed correcting.)

**Suggested fix (not implemented):** make parsing partial-tolerant — validate
each element of `entities` and `facts` independently (e.g. `safeParse` per
item), keep whatever validates, and surface the rest as per-item failures
rather than discarding the whole reply. This changes a contract every caller
of `parseExtractionResponse` relies on: `ParsedExtraction`'s
`"failure" | "proposal" | "skip"` union would need to grow a fourth,
partial-success shape (or `"proposal"` would need to carry rejected items
alongside accepted ones), and `eval-extraction.ts`'s per-source scoring would
need updating to match. Real, multi-file work — flagging here, not fixing.

**Resolved** in `94e3a42` ("fix(knowledge): keep the valid facts when one
draft is malformed"): `parseExtractionResponse` now validates each entity and
fact draft independently instead of `safeParse`-ing the whole reply object.
A single schema-violating draft (the F10 two-person fact, or anything else
that fails its own schema) is recorded as a `RejectedDraft` — verbatim text
plus the reason naming the offending field — and every other draft in the
same reply is kept and proposed as before, instead of the whole source
being thrown away. All-drafts-rejected is still a `"failure"` (retryable),
not a `"skip"` (terminal): malformed output deserves a retry, a
judged-empty reply does not. The suggested fix's contract worry did not
materialize as a fourth union variant — `ParsedExtraction`'s `"proposal"`
case instead grew a `rejected: RejectedDraft[]` field, always present
(empty when nothing was rejected), which every existing caller already
handles by ignoring a field it doesn't read. `rejectedDrafts` reaching the
persisted proposal — so a reviewer, not just a log line, can see what was
rejected — followed in `649a135` (see F12's resolution below); together the
two commits mean source 13's two valid facts from this finding's own
example are proposed today instead of discarded.

---

## F12 — A skip is terminal, unlogged and unrecoverable

**Status:** fixed · **Severity:** high (silent, permanent data loss; a cold-start inversion made it worse than random)

On a skip, `runExtraction` set `status: "reviewed"` on the source, `$unset`
the `error` field, and returned a reason to a caller that only counted it.
No proposal was written. `sweepPipeline` never re-selected `"reviewed"`
sources, so a skipped source left the pipeline permanently — there was no
proposal to inspect, nothing to click, and no way back in short of a manual
database write.

This was found from a real capture, not a hypothetical: the first message
processed after the pipeline went live — *"Sam will noch heute Vormittag in
den Garten"* — was skipped correctly by the letter of the extraction
prompt (*"greetings, scheduling chatter, no business knowledge"*). But the
tenant had **zero** entities and **zero** facts at that point, so
`gatherContext` rendered `(none yet)` for both lists the model was shown —
it was asked to judge whether a bare sentence contained business knowledge
with no world to judge it against. That is a **cold-start inversion**: the
skip gate is harshest exactly when the knowledge base is empty, which is
exactly when captures would otherwise bootstrap it. And the cost asymmetry
ran the wrong way — a false skip was silent and permanent, while a false
proposal is one click to discard.

**Consequence:** any source the model judged (rightly or wrongly) to
contain no business knowledge was gone from the pipeline for good, with no
audit trail of what was skipped, when, or why — including every false
negative from the cold-start problem above, for as long as a tenant's
knowledge base stayed thin.

**Resolved** across four commits, all of which are Part 2/3 of
`docs/superpowers/plans/2026-08-05-lossless-extraction.md`:

- `ec4124f` ("feat(knowledge): proposal fields for skips, rejects and
  generations") widened the proposal schema with `skipReason` (present ⇒
  nothing worth recording) and `extractionGeneration`, so a skip has
  somewhere to be written.
- `649a135` ("feat(knowledge): a skip writes a proposal instead of closing
  the source") is the actual fix: a skip now inserts a zero-draft proposal
  carrying `skipReason` and moves the source to `"proposed"` instead of the
  terminal `"reviewed"`, so it stays visible to the review queue and
  re-extractable. `c8f875a` ("fix(knowledge): crash-recovery resume reports
  skipped for a skip proposal") corrected a bug caught in review of that same
  change: the crash-recovery early-return reported every resumed source as
  `"proposed"` unconditionally, misreporting a resumed skip.
- `9cfd754` ("feat(knowledge): re-extract a source into a new generation")
  added `reExtractSource` — the recourse: supersede the prior proposal(s),
  bump `extractionGeneration`, reset the source to its extractable resting
  status, and re-run extraction against a knowledge base that has, by
  construction, grown since the skip. This is what turns "recoverable" into
  something an operator can actually invoke, closing the cold-start
  inversion this finding's real capture exposed — a source skipped when the
  base was empty can be re-tried once it is not.
- `7f12c3b` ("feat(app): show skipped proposals and their reasons") and
  `6760f69` ("feat(app): re-extract a skipped source with optional
  context") put both ends in front of a reviewer: the review queue now
  lists skipped proposals with their reason instead of hiding them (the
  `{ skipReason: { $exists: false } }` filter on the *open* queue keeps
  them out of the normal review list, but a dedicated "Skipped" section
  surfaces them), and a reviewer can trigger re-extraction — optionally with
  a hint — directly from a skipped proposal's detail page.

This branch's own Task 7 (`04b6883`, "feat(knowledge): bulk re-extraction
for skipped sources") builds on this fix rather than being part of it: it
lets an operator re-extract every currently-skipped source across a tenant
(or all tenants) in one bounded, dry-run-by-default pass, rather than
one-at-a-time from the review UI.

---

## Deferred minors

Minor findings recorded during implementation review (see
`.superpowers/sdd/2026-08-03-knowledge-evals/progress.md` for the full
ledger) that were deliberately not fixed on this branch, scope-limited to the
task that surfaced them. Listed here so they are visible to a reviewer
instead of living only in a gitignored file.

- **Task 2** (`packages/knowledge/fixtures/facts.ts`) — facts 12 and 16 have
  `supersededAt` only 8h after `validUntil`, so 2 of 4 role changes read as
  an accidental edit rather than a genuine "found out later" gap.
- **Task 2** (`packages/knowledge/fixtures/facts.ts`) — curly vs. straight
  quotes are inconsistent for the same engagement title across facts 44/18
  vs. 48/60.
- **Task 2** (`packages/knowledge/fixtures/facts.ts`) — fact 52's text says
  "Jonas Reimer"; the entity is "Jonas Reimers" (mandated verbatim by the
  original brief). Latent risk only if a future eval name-matches on fact
  text rather than id.
- **Task 3** (`packages/knowledge/fixtures/sources.ts`) — the voice source
  count sits exactly at the `>= 10` floor a fixture test enforces, after one
  source moved from voice to email during the Task 3 fix round; any future
  voice→email change will break that type-mix test.
- **Task 4** (`apps/app/agent/channels/eve.ts`) — nothing asserted the
  composed order of the auth array. `eval-tenant.test.ts` only exercised
  `evalTenant` in isolation, so a refactor moving it after `localDev()` would
  make F1's fix dead code (every loopback eval request satisfied by
  `localDev()` first) with all tests still green. **Fixed in the final review
  pass**: `channelAuth` is now exported and `eval-tenant.test.ts` pins
  `evalTenant` at index 1, ahead of the anonymous `localDev()` verifier.
- **Task 5** (`docs/knowledge-eval-findings.md`) — F2, F3, F4 and the F6 note
  originally cited an unreachable commit sha (`9710484`, written before the
  plan was amended); corrected to `ce4f927` in each. (Not F5 — F5 never cited
  that sha.)
- **Task 5** (`packages/database/index.ts`) — its comment claimed to match
  `@repo/knowledge/client.ts`'s Mongo client options in full, but omitted that
  the target also sets `ignoreUndefined` and a different `appName`. Harmless,
  but invited an assumption of parity that didn't hold. **Fixed in the final
  review pass**: reworded to scope the parity claim to `maxPoolSize` only.
- **Task 6** (`packages/knowledge/scripts/seed-evals.ts` tests) — the insert
  assertions only check that `insertMany` was called once per collection,
  not which fixture array was passed to which collection; a refactor that
  swapped, say, `sources` and `facts` would still pass.
- **Task 7** (`packages/knowledge/scripts/probe-zdr.ts` tests) — the
  generic-400 (neither ZDR-related nor a model-not-found) classification
  branch is verified correct by hand but has no committed regression test
  pinning it.
- **Task 8** (`packages/knowledge/scripts/eval-extraction.ts`) — when every
  source fails grading, the report renders `"100.0% (0/0)"` rather than a
  banner calling out that nothing was actually scored.
- **Task 8** (`packages/knowledge/scripts/eval-extraction.ts` tests) —
  nothing spies on `buildExtractionPrompt`'s `knownFacts` argument to pin
  that cold-start extraction really does pass an empty list.
- **Task 9** (`apps/app/evals/lookup.eval.ts`) — the lookup eval's target
  fact (ordinal 11) is itself one half of a supersession pair, so this
  "floor" eval brushes against the temporal-mechanics territory that
  `knowledge-update.eval.ts` is meant to own exclusively.

The following were surfaced by the final whole-branch review and explicitly
scoped out of that fix wave — recorded here, not actioned:

- **Final review** (`packages/knowledge/scripts/eval-extraction.ts`) — the
  grading-failure path (`parseFailed`, `scoredSources` exclusion, "GRADING
  FAILED" rendering) is untested. Extraction failures are also folded into
  Overall as recall-0 sources (`:299-306`), so a gateway hiccup is
  indistinguishable from a real recall miss.
- **Final review** (`packages/database/index.ts`, `packages/auth/instance.ts`,
  `apps/email/scripts/digest.ts`, `apps/api/app/cron/keep-alive/route.ts`) —
  `MONGODB_DB` is read via raw `process.env` in all four, bypassing each
  package's `keys.ts` env schema.
- **Final review** (`packages/knowledge/scripts/eval-extraction.ts:479-481`) —
  a residual "source 5 not evaluated" fallback; the `37c1409` guard only
  forbids the literal string `"not scored"`.
- **Final review** (`packages/knowledge/scripts/eval-extraction.ts` and its
  stub) — the injection source is identified by array position
  (`ordinal === 5`) in both the script and its stub, so both move together
  silently if the fixtures are ever reordered. Should use
  `PLANTED.injection.sourceId`.
- **Final review** (`packages/knowledge/scripts/eval-extraction.ts:32`) —
  asserts "The user has ZDR enabled account-wide" as settled fact; F8
  explicitly declines to settle it. Substrate B also routes through
  `createGatewayGenerate` and therefore does **not** request ZDR (F8).
- **Final review** (`apps/app/agent/channels/eve.ts:42-45`) — "grants no
  access that is not already granted" is imprecise: `localDev()` yields
  `attributes: {}` and reaches no data; `evalTenant` adds the `tenantId` that
  unlocks it. The real gate is `EVAL_TENANT_ID` being unset. Consider also
  gating on `VERCEL_ENV !== "production"`.
- **Final review** (this doc) — nits: `packages/database/index.ts:14` should
  read `:15`; F6's "499 errors" is now 497; F6's erroring-file list is a
  sample presented as exhaustive (~108 files); F7's "~0.7–0.85" should read
  "~0.7–0.9".
- **Final review** (`docs/superpowers/plans/2026-08-03-knowledge-evals.md`) —
  the plan file's `probe-zdr` command omits `AI_GATEWAY_API_KEY` (the
  README's copy is correct).
- **Final review** (`CLAUDE.md`) — pre-existing drift, not introduced by this
  branch: Turborepo 2.5.8→2.10.8, Biome 2.3.1→2.5.6, TypeScript
  5.9→^7.0.0; line 26 `bun test` is Bun's builtin runner, not the workspace
  script, and line 28 duplicates it; no mention of eve, `bunx eve eval`,
  `EVAL_TENANT_ID`, or the two-pass rule.
- **Final review** — never carried forward from the implementation review:
  `injection`'s retrieval gate (fact 40, confidence 0.5) is a likely flake
  needing empirical tuning; no tenant-beta engagement exists in the fixtures.
- **Final review** — weak tests: `eval-extraction.test.ts:299-309`,
  `:336-342` (asserts "tenant-alpha only" while actually checking for no
  tenant), `:344-346`; and `fixtures.test.ts:195` asserts `shouldSkip >= 3`
  while `eval-extraction.test.ts:210` asserts `=== 3`.
- **Final review** (`packages/knowledge/schemas/facts.ts:47-48`) — the dead
  `embedding` field is now **confirmed** dead: no write, no read, no index
  anywhere in the package. Safe to remove in a follow-up.

---

## Open questions

- **Is `anthropic/claude-sonnet-5` ZDR-covered through the AI Gateway?** One
  request answers it; a miss returns `400 no_providers_available` naming the
  providers considered. If not covered, the judge changes rather than the
  setting.
- **Does `runContradictionCheck` catch cross-source contradictions?**
  Consolidation structurally cannot: it asks only for merges that reduce
  redundancy, and contradictory facts are neither redundant nor mergeable. The
  `contradiction` eval answers this.

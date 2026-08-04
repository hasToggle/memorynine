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

**Status:** fixed · **Severity:** medium

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
gated on it) unreachable. Reverted: `packages/auth/instance.ts` still calls
plain `client.db()`, so auth keeps reading `test`, where its data actually
is.

So today: `subscribers`/`digests` are in `app`; better-auth's collections
are still in `test`; `test` must not be dropped. Whether to eventually
migrate the auth collections into `app` (and drop this exception) or leave
them in `test` permanently is an open decision — it needs an explicit
migration plan and a maintainer's sign-off, not a silent default change,
because it means moving live user data.

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

**Status:** open · **Severity:** medium (predates this branch, contradicts a stated assumption)

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

**Fix:** add a `providerOptions` passthrough to `GatewayConfig` and set
`{ gateway: { zeroDataRetention: true } }` at both call sites that construct
a production generator (the extraction worker's `createGatewayGenerate()` in
`apps/api/app/cron/knowledge-pipeline/route.ts`, and any other production
caller of `createGatewayGenerate`). Out of scope for this branch — Task 12 is
env-independent documentation only; this is a code change that itself needs
verification against a live gateway.

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

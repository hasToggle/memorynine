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

**Status:** open · **Severity:** medium

CLAUDE.md describes Prisma with a Neon PostgreSQL adapter, a schema at
`packages/database/prisma/schema.prisma`, a generated client at
`packages/database/generated/client/`, and `bun migrate` / `bunx prisma studio`
commands.

None of it exists. There is no `schema.prisma` anywhere in the repo, no `prisma`
dependency in any `package.json`, and no `migrate` script in the root
`package.json`. `packages/database` is a thin MongoDB wrapper exposing two
collections, `subscribers` and `digests`.

This is actively misleading to any agent reading CLAUDE.md as authoritative —
which is what it is for.

**Fix:** rewrite the Database sections of CLAUDE.md to describe what is there.

---

## F3 — `@repo/database` writes to a database named `test`

**Status:** open · **Severity:** medium

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

---

## F4 — `@repo/database` undoes the connection-pool sizing `@repo/knowledge` sets

**Status:** open · **Severity:** medium

`packages/knowledge/client.ts:32` sets `maxPoolSize: 5` with a comment
explaining that every warm serverless instance holds its own pool and small
Atlas tiers cap at 500 connections cluster-wide.

`packages/database/index.ts:9` is `new MongoClient(keys().MONGODB_URI)` — no
options at all, so the driver default `maxPoolSize: 100` applies, against the
same cluster, from three apps. The care taken in one package is silently undone
by the other.

**Fix:** pass the same pool and timeout options in `@repo/database`.

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

Note: `packages/database/index.ts` and `keys.ts` have two trivial
`useSortedKeys` errors that ARE in scope, since Task 5 modifies both files.

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

## Open questions

- **Is `anthropic/claude-sonnet-5` ZDR-covered through the AI Gateway?** One
  request answers it; a miss returns `400 no_providers_available` naming the
  providers considered. If not covered, the judge changes rather than the
  setting.
- **Does `runContradictionCheck` catch cross-source contradictions?**
  Consolidation structurally cannot: it asks only for merges that reduce
  redundancy, and contradictory facts are neither redundant nor mergeable. The
  `contradiction` eval answers this.
- **`packages/knowledge/schemas/facts.ts:48`** still declares an `embedding`
  field described as "stubbed for later semantic search". The read path moved to
  Atlas `autoEmbed`, where vectors live in an internal system collection. The
  field appears to be dead — confirm and remove.

# Findings — knowledge hub evals

Issues surfaced while building the synthetic corpus and eval suite
(`docs/superpowers/specs/2026-08-03-knowledge-evals-design.md`). Fixes land on
this branch unless noted.

Status: `open` · `fixed` · `wontfix` · `external`

---

## F1 — Eval sessions carry no tenant, so every eval fails on plumbing

**Status:** open · **Severity:** blocker

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

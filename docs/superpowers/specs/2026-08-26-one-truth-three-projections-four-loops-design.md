# One Truth, Three Projections, Four Loops — memorynine architecture design

**Date:** 2026-08-26 · **Status:** direction approved (Eric, 2026-08-26); increments approved individually
**Supersedes:** the "wiki in the session sandbox" sketch from the eve research session (rejected as default; see §6)

## 1. What the product is

Founders capture thoughts, emails, meetings, and notes. They and their co-founders check up on
what's stored. The product proactively reaches out — recurring client touchpoints, contacts going
cold, commitments coming due — with the end goal of replacing a CRM outright. It is a system that
*does things* to offload cognitive load, not a passive knowledge store with a query UI.

## 2. Findings this design answers

From the 2026-08-26 adversarial assessment of the codebase:

1. **Every user-facing loop is pull.** The three crons process inward (pipeline, consolidation +
   contradiction, keep-alive). Knock is mounted but its server client has zero importers; no
   product email has ever been sent; the only "push" is a 15-second poll and a sidebar badge.
2. **The review gate relocates cognitive load onto the founder.** Every capture becomes homework.
   Meanwhile the agent already consumes unreviewed material via `search-sources`, labeled — the
   system concedes that unreviewed knowledge is usable when attributed, but refuses to structure it.
3. **Strong substrate, unwired organs.** Bitemporal facts, supersession, tenant pre-filters,
   erasure — genuinely strong. But dossier markdown is written and read by nothing, engagements
   have no UI, and the brief pane is shaped around a calendar moment nothing detects.
4. **The ontology carries no proactive fuel.** No commitments, no last-touch/cadence, no meetings.
5. **Sessions are ephemeral** (per component mount) and eve session ids are unowned bearer
   capabilities (`agent/channels/eve.ts:88`).

## 3. Principles

- **One truth.** MongoDB (`@repo/knowledge`) is the only system of record. Nothing else is
  authoritative — not files, not sandboxes, not session state. (eve's own multi-tenant-memory
  pattern agrees: long-term memory lives in the application store, outside eve.)
- **Projections are compiled artifacts.** Anything derived (pages, briefs, receipts, exports,
  sandbox trees) is regenerable from truth and never written back by hand or by model.
- **Trust is a property of answers, not a toll on writes.** Provenance and tiering make unreviewed
  knowledge usable-with-attribution; review becomes an exception surface, not a gate on every atom.
- **Initiative before retrieval depth.** The next unit of product value is the system reaching out,
  not another improvement to answering.
- **eve at the edges.** eve provides durable sessions, schedules, channels, approvals. Product
  logic stays in packages. The sandbox is an on-demand tool, never a data store.
- **Deterministic where output is outbound.** Anything the product sends unprompted prefers
  deterministic composition over LLM prose until prioritization genuinely requires a model
  (quoted capture excerpts are untrusted input; an LLM between them and an outbound email is an
  injection surface).

## 4. Architecture

### One truth (Mongo, `@repo/knowledge`)

Existing model unchanged, plus three deltas delivered by later increments:

- **Trust tiers on facts** (increment ②): `tier: "confirmed" | "unconfirmed"`. Extraction writes
  `unconfirmed` facts directly for founder-authored captures (voice, manual) and forwarded email;
  review *promotes* rather than gates. Review-first remains for: new-entity drafts, bulk/third-party
  imports, consolidation/contradiction resolutions, and drafts under a confidence floor. Existing
  facts migrate to `confirmed`. The Ask agent's citation doctrine gains a third line (confirmed
  fact / unconfirmed fact / raw source).
- **Commitments** (increment ⑤): a `commitment` fact category plus optional structured fields
  `{ direction: "owed-by-us" | "owed-to-us", due?: Date, status: "open" | "done" | "dropped" }`.
  Extraction prompts start hunting for promises.
- **Materialized recency** (increment ⑤): the dream cycle stamps entities with `lastTouchAt`
  and `nextTouchDue` (per-entity cadence policy). Triggers become indexed queries.

### Three projections (derived, regenerable)

1. **Pages** (increment ③): the dossier grown up — full-length markdown per entity **with fact ids
   inline** (`<fact id="…"/>`, same format the Ask agent cites), `[[cross-links]]`, and view
   indexes (by-staleness, open-commitments, upcoming). Stored per tenant (extension of the
   `dossiers` collection). Consumed three ways: rendered as the app's missing `/people/[id]` /
   `/engagements/[id]` pages; exported as the user-owned markdown tree; materialized into a
   sandbox **on demand only** (deep-research mode, increment ⑧).
2. **Briefs and receipts**: exist today; unchanged.
3. **Changelog** (increment ③): the dream cycle emits a per-tenant "what changed" record — digest
   raw material and audit spine (later: a literal diff of the pages tree).

### Four loops

1. **Capture** (exists → widen): per-org inbound email address stored on the org, replacing the
   deploy-time `KNOWLEDGE_INBOUND_SENDERS` env JSON (increment ④); calendar via ICS forwarding,
   then integration (increment ⑦). Trust tiers make capture feel instant.
2. **Dream** (exists at 03:00 UTC → extend): consolidation + contradiction (real today) + page and
   view regeneration + recency stamping + changelog emission. Stays plain cron functions.
3. **Initiative** (new — the product's essence): scheduled evaluation of structured triggers →
   selection under an explicit interruption budget → delivery with receipts and links. v1 is a
   deterministic morning brief email (§5). Later: LLM prioritization once commitments land,
   conversational delivery via eve channels (Slack/WhatsApp), one-tap actions, per-user
   preferences. Security invariant from day one: no session that can send externally reads raw
   sources without approval.
4. **Ask** (exists → deepen): durable sessions keyed per user+org with persisted session→tenant
   ownership checked on resume/stream (closes the documented auth hole, gives history) —
   increment ⑥; an `open-entity` navigational tool reading pages + neighbors from Mongo (no
   sandbox); Atlas hybrid search stays for precision.

## 5. Increment ① — the morning brief (specified here; first implementation milestone)

**Goal:** the product reaches out once per weekday with something worth reading, built entirely
from data the system already has. No new ontology, no LLM, no eve dependency.

**Trigger data (per tenant, computed at send time):**
- *Captured last 24 h*: count of new sources + up to 3 latest (type, excerpt when present), and
  count of facts confirmed in the same window.
- *Waiting for you*: open reviewable proposals (`status: "open"`, no `skipReason`) — count, age of
  oldest in days, and how many are contradiction resolutions.
- *Going quiet*: up to 3 people whose latest currently-valid anchored fact activity
  (`validFrom ?? createdAt`) is older than 28 days, oldest first. (Known v1 limitation: facts
  exist only post-review until increment ②, so an unreviewed backlog inflates coldness — the
  juxtaposition with "waiting for you" is itself the message.)

**Attention-budget rules (hard):**
- No news → no email. "News" = any capture, any new fact, or any waiting review.
- *Going quiet* alone never triggers a send (it would fire daily forever for the same cold trio);
  it rides along when other news exists.
- At most one send per tenant per UTC day, enforced by a claimed delivery record with a
  deterministic id (`morning-brief:{tenantId}:{YYYY-MM-DD}`). Claim-then-send: a crash between
  claim and send costs that day's email rather than risking a double send.

**Composition:** deterministic, pure function → `{subject, text, html}`. Capture excerpts are
HTML-escaped and rendered as quoted material (injection-safe by construction). English copy v1;
localization later. Links: `{appOrigin}/review` and `{appOrigin}/`.

**Delivery:** Resend (`@repo/email`), one email per tenant to the recipients listed in that
tenant's settings. From address: `RESEND_FROM` (route refuses to run without it, same fail-closed
posture as `CRON_SECRET`).

**Configuration:** new `initiativeSettings` collection, one doc per tenant:
`{ tenantId, enabled: boolean, recipients: email[] (min 1) }`, unique on `tenantId`. Seeded via a
package script for beta tenants (DB-backed from day one — deliberately *not* another env JSON;
that pattern is the thing increment ④ deletes). A settings UI is future work.

**Recording:** new `initiativeDeliveries` collection:
`{ _id: deterministic, tenantId, date, outcome: "claimed"|"sent"|"no-news"|"failed", recipients,
error? }`. Per-tenant failures are isolated (one tenant's bounce never blocks another's brief) and
reported in the cron's JSON response (207 on partial failure, matching the sibling crons).

**Schedule:** Vercel cron `0 5 * * 1-5` (05:00 UTC = 07:00 CEST) on `apps/api`, behind
`requireCronSecret`.

**Explicitly not in ①:** LLM prose, Knock in-app delivery, per-user opt-in, digest of fact
*content* beyond excerpts, weekend sends, timezone preferences.

## 6. What was considered and rejected

- **Wiki materialized into each session's sandbox (eager):** rejected as default. Sandboxes are
  keyed per durable session (today: per component mount); copies diverge per session and go stale
  within one; idle Vercel Sandbox VMs resume days later still holding erased people (Art. 17
  timeliness exposure); and it puts a paid microVM on the hot path of the first question. Files
  return as an **on-demand projection** in increment ⑧, sourced from pages, with erasure
  triggering projection rebuild + sandbox invalidation.
- **Review-everything (status quo) and auto-accept-everything:** both rejected; tiered trust with
  review-as-exception keeps the choke-point invariant and deletes the founder-as-bottleneck.
- **Full eve agent for initiative v1:** rejected; a cron + deterministic compose + Resend ships the
  loop without coupling to preview APIs. eve enters when delivery becomes conversational.
- **Rules-only initiative forever:** rejected; LLM prioritization arrives with commitments (⑤),
  where selection pressure actually exists.

## 7. Increment sequence

① morning brief (this spec, §5) → ② trust tiers + review-as-exception → ③ pages projection +
entity routes + export + changelog → ④ per-org inbound address → ⑤ commitments + cadence + LLM
prioritization → ⑥ durable Ask sessions + ownership → ⑦ calendar → meeting briefs → ⑧ sandbox
deep-research mode. Each increment ships value on its own and gets its own implementation plan.

## 8. Metrics (falsifiability)

Initiative precision (acted-on ÷ delivered — the number that decides whether this product lives);
% of captures needing any review touch (target < 20 % after ②); capture→usable latency; weekly
founder-minutes in review (should fall); erasure propagation time including projections; Ask
navigational eval scores ("what should I worry about?"-class) on the existing eval infra.

## 9. Non-goals / do-not-build

No second system of record; no agent-authored workspace "memory"; no eager per-session wiki; grep
never replaces Atlas Search (orientation and precision compose); no further governance depth ahead
of the initiative loop.

## 10. Risks

- **Notification fatigue** — mitigated by the hard no-news rule, the going-quiet rider rule, one
  send/day, and per-tenant enablement; measured by initiative precision.
- **eve is preview software** — mitigated by keeping product logic in packages; eve remains a
  replaceable shell (already one breaking upgrade survived).
- **Prompt injection via captured material** — mitigated in ① by deterministic composition with
  escaping; the standing invariant (§4, loop 3) governs every later LLM-composed outbound.
- **Cross-DB recipients** — v1 stores recipients on settings docs, decoupling the cron from the
  auth DB; revisit when a settings UI lands.

# Brain unified surface — design

Date: 2026-08-05
Status: approved direction from user prompt (autonomous session — user asked for
consolidation directly; compressed brainstorm)

## Problem

The company brain in `apps/app` is spread over four sidebar entries (Ask,
Capture, Review, People) next to dead template scaffolding (Playground, Models,
Documentation, Settings, Projects, Support, Feedback — all `#` links — plus a
search box feeding an empty scaffold page and a Liveblocks demo home). Too much
navigation for four small, related surfaces; the dead entries erode trust.

## Decision

The brain becomes the home page (`/`) — one workspace:

- **Ask is the hero.** The existing `KnowledgeChat` (eve agent, `<fact>`
  citations) fills the main column. Talking to the brain is the product.
- **The memory rail is the signature element.** A ~380px right rail with three
  tabs showing the brain's inner life next to the conversation:
  - **Capture** — note form, voice recorder, recent-captures pipeline (live
    statuses, polling only while a source is in flight).
  - **Review** — open proposals (compact rows → `/review/[id]`), skipped
    sources below; the tab shows a count badge.
  - **People** — who the brain knows, with GDPR Art. 17 erase.
  The rail defaults to Review when proposals wait, Capture otherwise — it
  opens on whatever needs the user.
- **Mobile:** a segmented strip (Ask / Capture / Review / People) toggles a
  single visible pane; chat stays mounted (one agent instance) and is shown or
  hidden with CSS.
- `/review/[id]` stays a focused full page — per-item confirm/edit needs the
  width. Breadcrumb links back to `/`.

## Approaches considered

1. Tabs-only single page (Ask/Capture/Review/People as flat tabs) — simplest,
   but hides the capture → pipeline → review flow and buries the chat.
2. **Chat hero + memory rail (chosen)** — chat-centric identity, queue and
   pipeline visible at a glance, all existing components reused.
3. Chat with capture/review as overlay sheets — fewest pixels, but review is
   too dense for a sheet and discoverability suffers.

## Consequences

- Sidebar shrinks to Brain (`/`), Digest, Webhooks; all dead scaffolding
  entries, the Projects group, the sidebar search box, `/search`, and the
  Liveblocks demo home components are removed.
- `/ask`, `/capture`, `/review`, `/people` redirect to `/` (next.config), so
  bookmarks keep working; `/review/[id]` is untouched by the exact-match
  redirects.
- Visual language: inherit the design system (shadcn semantic tokens, existing
  type scale) — no new palette or faces; the design budget goes to layout,
  hierarchy, and copy.

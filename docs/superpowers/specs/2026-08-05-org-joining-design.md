# Joining an existing brain — design

Date: 2026-08-05
Status: user asked for self-serve joining ("invite is not enough"), industry
patterns researched; compressed brainstorm (autonomous session).

## Problem

Sign-up unconditionally creates a new organization, so a colleague who signs
up with the same company name silently forks the company into a second, empty
brain. There is no invite UI, no invitation email delivery, and no accept
path.

## Industry patterns (don't reinvent the wheel)

B2B SaaS converged on three joining paths (Slack, Notion, Linear, Zapier;
WorkOS canonicalizes the same trio for user management):

1. **Email invitations** — admin invites an address; the link proves inbox
   access.
2. **Domain-based self-serve join** ("domain capture") — the workspace allows
   an email domain; anyone with a **verified** email on it can join without
   an invite. This is the standard answer to "people should be able to sign
   up to existing orgs themselves". Public mail providers (gmail.com, web.de,
   …) are always excluded, and the domain claim itself must be legitimized —
   big products verify via DNS; the accepted lightweight form (Notion-style)
   is that an admin can only allow a domain they themselves use with a
   verified email.
3. **Create a new workspace** — the fallback, which is today's only path.

Invite links (Slack/Discord-style shareable URLs) were considered and cut:
domain join covers the same growth loop for a company product with less
token-leak surface.

## What better-auth 1.6.25 already provides

- Invitation lifecycle endpoints (`inviteMember`, `acceptInvitation`,
  `cancelInvitation`, `listInvitations`, `listUserInvitations`) — the last
  requires a verified email by design.
- `sendInvitationEmail` hook + `requireEmailVerificationOnInvitation`.
- Email verification flow (`sendVerificationEmail`, `sendOnSignUp`,
  `autoSignInAfterVerification`).
- Server-only `auth.api.addMember` — direct member add, the primitive for
  domain join.
- `organization.metadata` for storing per-org settings (allowed domains).
- Session-create hook already defaults a fresh session's active org to the
  first membership, so joiners land in the right brain.

Missing (ours to build): email delivery wiring (Resend), the join/accept
surface, domain-join logic and its guards, team management UI, and a sign-up
mode that doesn't create an org.

## Design

**Security invariant (enforced server-side at join time, not config time):**
a user may self-join an org iff (1) their session email is verified, (2) its
domain is in the org's `metadata.allowedDomains`, (3) the domain is not a
public mail provider, and (4) the org has an owner/admin member whose
*verified* email is on that same domain. (4) makes a forged metadata write
harmless: an org cannot open a domain it doesn't legitimately hold.

- `packages/auth/join-policy.ts` — pure helpers: `emailDomain`, public-domain
  blocklist, RFC-2606 reserved domains (never emailed — keeps tests and dev
  from bouncing mail), `canAllowDomain`, `parseAllowedDomains`. Unit-tested.
- `packages/auth/emails.ts` — Resend senders for verification + invitation
  mail; failures log, never fail the auth flow; reserved domains are skipped.
- `instance.ts` — wire `emailVerification` (sendOnSignUp, auto sign-in after
  verification) and `organization({ requireEmailVerificationOnInvitation,
  sendInvitationEmail })`. Invitation links point at `/join`.
- `server.ts` — `getSessionUser` (email + verified flag),
  `listJoinableOrganizations`, `joinOrganizationByEmailDomain`,
  `getTeamOverview`, `updateAllowedDomains` (admin-gated).
- **Sign-up** gets two modes: *Create a new organization* (today's flow) and
  *Join your team* (no org created; lands on `/join`).
- **`/join`** (authenticated, no org required; home redirects here when the
  session has no active org): shows a verify-email prompt when unverified;
  once verified lists pending invitations (accept) and domain-matching orgs
  (join), plus a create-org fallback. Invitation emails link here.
- **`/team`** (sidebar entry): member list with roles; for admins an invite
  form (email + role), pending invitations with cancel, and the allowed-
  domains editor (an admin can only add the domain of their own verified
  email).

## Testing

- Pure policy helpers: bun unit tests.
- Live Playwright pass with the debug tenant: owner allows `example.com`,
  a second account signs up in join mode, verifies (test-only DB flip —
  reserved domains receive no real mail), sees and joins the org, and lands
  in the shared brain.

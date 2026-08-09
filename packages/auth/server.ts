import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authDb, authInstance, idForms } from "./instance";
import {
  canAllowDomain,
  emailDomain,
  PUBLIC_EMAIL_DOMAINS,
  parseAllowedDomains,
} from "./join-policy";

// Compat layer: the rest of the monorepo keeps calling the Clerk-shaped
// surface (auth(), currentUser()) while better-auth does the work. Only the
// shapes actually consumed in this repo are reproduced — see the migration
// PR for the inventory.

// biome-ignore lint/performance/noBarrelFile: single re-export for the route handler
export { authInstance } from "./instance";

export interface AuthContext {
  /** True when the active-org member has one of the admin-ish roles. */
  has: (params: { role: string }) => boolean;
  orgId: string | null;
  redirectToSignIn: () => never;
  userId: string | null;
}

const ADMIN_ROLES = new Set(["admin", "owner"]);

export const auth = async (): Promise<AuthContext> => {
  const session = await authInstance.api.getSession({
    headers: await headers(),
  });
  const userId = session?.user.id ?? null;
  const orgId = session?.session.activeOrganizationId ?? null;

  // Role of the current user in the active org, for has(). One indexed
  // findOne; Clerk's "org:admin" maps onto better-auth's owner/admin.
  let role: string | null = null;
  if (userId && orgId) {
    const membership = await authDb
      .collection<{ role?: string }>("member")
      .findOne({
        organizationId: idForms(orgId) as never,
        userId: idForms(userId) as never,
      });
    role = membership?.role ?? null;
  }

  return {
    has: ({ role: wanted }) => {
      if (wanted === "org:admin") {
        return role !== null && ADMIN_ROLES.has(role);
      }
      return role === wanted;
    },
    orgId,
    redirectToSignIn: () => redirect("/sign-in"),
    userId,
  };
};

export interface CompatUser {
  emailAddresses: { emailAddress: string }[];
  fullName: string | null;
  id: string;
  imageUrl: string;
}

export const currentUser = async (): Promise<CompatUser | null> => {
  const session = await authInstance.api.getSession({
    headers: await headers(),
  });
  if (!session) {
    return null;
  }
  return {
    emailAddresses: [{ emailAddress: session.user.email }],
    fullName: session.user.name || null,
    id: session.user.id,
    imageUrl: session.user.image ?? "",
  };
};

export interface OrganizationMemberInfo {
  email: string;
  imageUrl: string;
  name: string;
  userId: string;
}

/**
 * The active organization's member directory. Used to turn stored identifiers
 * — fact.confirmedBy (a user id), source.capturedBy (an email) — into names a
 * receipt can show. Replaces Clerk's getOrganizationMembershipList.
 */
export const listOrganizationMembers = async (
  organizationId: string
): Promise<OrganizationMemberInfo[]> => {
  const org = await authInstance.api.getFullOrganization({
    headers: await headers(),
    query: { membersLimit: 100, organizationId },
  });
  if (!org) {
    return [];
  }
  return org.members.map((member) => ({
    email: member.user.email,
    imageUrl: member.user.image ?? "",
    name: member.user.name || member.user.email,
    userId: member.user.id,
  }));
};

export interface SessionUser {
  email: string;
  emailVerified: boolean;
  id: string;
  name: string;
}

/** The session user with the fields the joining flow decides on. */
export const getSessionUser = async (): Promise<SessionUser | null> => {
  const session = await authInstance.api.getSession({
    headers: await headers(),
  });
  if (!session) {
    return null;
  }
  return {
    email: session.user.email,
    emailVerified: session.user.emailVerified,
    id: session.user.id,
    name: session.user.name || session.user.email,
  };
};

export interface JoinableOrganization {
  id: string;
  memberCount: number;
  name: string;
}

interface OrganizationDoc {
  _id: unknown;
  metadata?: unknown;
  name: string;
}

/**
 * True iff the org has an owner/admin whose *verified* email is on the given
 * domain. This is the legitimacy anchor for domain join: allowedDomains in
 * org metadata is client-writable through better-auth's update endpoint, so
 * a forged entry must not be enough to open an org to a domain it doesn't
 * demonstrably hold.
 */
const orgHoldsDomain = async (
  organizationId: string,
  domain: string
): Promise<boolean> => {
  const admins = await authDb
    .collection<{ role?: string; userId: unknown }>("member")
    .find({
      organizationId: idForms(organizationId) as never,
      role: { $in: ["admin", "owner"] },
    })
    .limit(50)
    .toArray();
  if (admins.length === 0) {
    return false;
  }
  const adminIdForms = admins.flatMap(
    (admin) => idForms(String(admin.userId)).$in
  );
  const adminUsers = await authDb
    .collection<{ email?: string; emailVerified?: boolean }>("user")
    .find({ _id: { $in: adminIdForms } as never })
    .toArray();
  return adminUsers.some(
    (user) =>
      user.emailVerified === true &&
      typeof user.email === "string" &&
      emailDomain(user.email) === domain
  );
};

const joinableDomainForUser = (user: SessionUser | null): string | null => {
  if (!user?.emailVerified) {
    return null;
  }
  const domain = emailDomain(user.email);
  if (!domain || PUBLIC_EMAIL_DOMAINS.has(domain)) {
    return null;
  }
  return domain;
};

/**
 * Organizations the session user could self-join because their verified
 * email domain is allowed there. Industry "domain capture", MVP form.
 */
export const listJoinableOrganizations = async (): Promise<
  JoinableOrganization[]
> => {
  const user = await getSessionUser();
  const domain = joinableDomainForUser(user);
  if (!(user && domain)) {
    return [];
  }

  const memberships = await authDb
    .collection<{ organizationId: unknown }>("member")
    .find({ userId: idForms(user.id) as never })
    .toArray();
  const memberOf = new Set(memberships.map((m) => String(m.organizationId)));

  // Small-tenant product: scanning organizations beats maintaining a
  // denormalized domain index until org counts say otherwise.
  const organizations = await authDb
    .collection<OrganizationDoc>("organization")
    .find({})
    .limit(500)
    .toArray();

  // Metadata filtering leaves at most a handful of candidates; only those
  // pay for the legitimacy check and the member count.
  const candidates = organizations.filter(
    (org) =>
      !memberOf.has(String(org._id)) &&
      parseAllowedDomains(org.metadata).includes(domain)
  );
  const checked = await Promise.all(
    candidates.map(async (org) => {
      const orgId = String(org._id);
      if (!(await orgHoldsDomain(orgId, domain))) {
        return null;
      }
      const memberCount = await authDb
        .collection("member")
        .countDocuments({ organizationId: idForms(orgId) as never });
      return { id: orgId, memberCount, name: org.name };
    })
  );
  return checked.filter((org): org is JoinableOrganization => org !== null);
};

/**
 * Self-serve domain join. Re-validates the whole invariant server-side —
 * the client list above is UX, not authority.
 */
export const joinOrganizationByEmailDomain = async (
  organizationId: string
): Promise<{ error?: string }> => {
  const joinable = await listJoinableOrganizations();
  if (!joinable.some((org) => org.id === organizationId)) {
    return {
      error:
        "This organization is not open to your email domain, or your email is not verified yet.",
    };
  }
  const user = await getSessionUser();
  if (!user) {
    return { error: "Not signed in." };
  }
  await authInstance.api.addMember({
    body: {
      organizationId,
      role: "member",
      userId: user.id,
    },
  });
  await authInstance.api.setActiveOrganization({
    body: { organizationId },
    headers: await headers(),
  });
  return {};
};

export interface PendingInvitation {
  id: string;
  inviterEmail: string | null;
  organizationName: string;
  role: string;
}

/**
 * Invitations waiting for the session user's email address. Only meaningful
 * once the email is verified — acceptance is verification-gated anyway
 * (requireEmailVerificationOnInvitation) — so callers gate on that.
 */
export const listUserPendingInvitations = async (): Promise<
  PendingInvitation[]
> => {
  const user = await getSessionUser();
  if (!user?.emailVerified) {
    return [];
  }
  const invitations = await authDb
    .collection<{
      _id: unknown;
      email: string;
      expiresAt?: Date;
      inviterId?: unknown;
      organizationId: unknown;
      role?: string;
      status: string;
    }>("invitation")
    .find({
      email: user.email.toLowerCase(),
      status: "pending",
    })
    .limit(20)
    .toArray();

  const now = Date.now();
  const current = invitations.filter(
    (invitation) =>
      !invitation.expiresAt || invitation.expiresAt.getTime() >= now
  );
  const resolved = await Promise.all(
    current.map(async (invitation) => {
      const org = await authDb
        .collection<OrganizationDoc>("organization")
        .findOne({ _id: idForms(String(invitation.organizationId)) as never });
      if (!org) {
        return null;
      }
      const inviter = invitation.inviterId
        ? await authDb
            .collection<{ email?: string }>("user")
            .findOne({ _id: idForms(String(invitation.inviterId)) as never })
        : null;
      return {
        id: String(invitation._id),
        inviterEmail: inviter?.email ?? null,
        organizationName: org.name,
        role: invitation.role ?? "member",
      };
    })
  );
  return resolved.filter(
    (invitation): invitation is PendingInvitation => invitation !== null
  );
};

/**
 * Replace the active org's allowed-domains list. Admin-only, and an admin
 * can only allow the domain of their own verified email — you cannot open
 * your org to a domain you don't demonstrably use. Removing domains is
 * always allowed.
 */
export const updateAllowedDomains = async (
  domains: string[]
): Promise<{ error?: string }> => {
  const requestHeaders = await headers();
  const session = await authInstance.api.getSession({
    headers: requestHeaders,
  });
  const organizationId = session?.session.activeOrganizationId;
  if (!(session && organizationId)) {
    return { error: "No active organization." };
  }
  const { has } = await auth();
  if (!has({ role: "org:admin" })) {
    return { error: "Only admins can change allowed domains." };
  }

  const normalized = [
    ...new Set(domains.map((domain) => domain.trim().toLowerCase())),
  ].filter((domain) => domain.length > 0);

  if (normalized.length > 0 && !session.user.emailVerified) {
    return { error: "Verify your email before allowing a domain." };
  }

  // Validate the FINAL list, not just the delta: every persisted domain must
  // be either the caller's own (verified) domain or one a current
  // owner/admin demonstrably holds. Join-time enforcement (orgHoldsDomain in
  // the join path) already makes stale or forged entries inert; this keeps
  // them from surviving a save at all, and forces cleanup when the admin who
  // held a domain has left.
  const holds = await Promise.all(
    normalized.map(async (domain) => ({
      domain,
      ok:
        canAllowDomain(session.user.email, domain) ||
        (await orgHoldsDomain(organizationId, domain)),
    }))
  );
  const rejected = holds.find((entry) => !entry.ok);
  if (rejected) {
    return {
      error: `"${rejected.domain}" can't be allowed: it must be your own email domain (${
        emailDomain(session.user.email) ?? "—"
      }) or one that a current admin with a verified email holds — public mail providers never qualify.`,
    };
  }

  await authInstance.api.updateOrganization({
    body: {
      data: { metadata: { allowedDomains: normalized } },
      organizationId,
    },
    headers: requestHeaders,
  });
  return {};
};

export interface TeamOverview {
  allowedDomains: string[];
  invitations: {
    email: string;
    id: string;
    role: string;
    status: string;
  }[];
  isAdmin: boolean;
  members: {
    email: string;
    name: string;
    role: string;
    userId: string;
  }[];
  organizationName: string;
}

/** Everything the Team page shows, in one server round-trip. */
export const getTeamOverview = async (): Promise<TeamOverview | null> => {
  const requestHeaders = await headers();
  const session = await authInstance.api.getSession({
    headers: requestHeaders,
  });
  const organizationId = session?.session.activeOrganizationId;
  if (!organizationId) {
    return null;
  }
  const org = await authInstance.api.getFullOrganization({
    headers: requestHeaders,
    query: { membersLimit: 100, organizationId },
  });
  if (!org) {
    return null;
  }
  const invitations = await authInstance.api.listInvitations({
    headers: requestHeaders,
    query: { organizationId },
  });
  const role = org.members.find(
    (member) => member.user.id === session.user.id
  )?.role;
  return {
    allowedDomains: parseAllowedDomains(org.metadata),
    invitations: invitations
      .filter((invitation) => invitation.status === "pending")
      .map((invitation) => ({
        email: invitation.email,
        id: invitation.id,
        role: invitation.role ?? "member",
        status: invitation.status,
      })),
    isAdmin: role === "owner" || role === "admin",
    members: org.members.map((member) => ({
      email: member.user.email,
      name: member.user.name || member.user.email,
      role: member.role,
      userId: member.user.id,
    })),
    organizationName: org.name,
  };
};

/**
 * Stripe webhook support: look a user up by the Stripe customer id stored
 * on their auth-user document. Replaces Clerk privateMetadata lookups.
 */
export const getUserByStripeCustomerId = async (
  stripeCustomerId: string
): Promise<{ email: string; id: string } | null> => {
  const user = await authDb
    .collection<{ email: string; stripeCustomerId?: string }>("user")
    .findOne({ stripeCustomerId });
  if (!user) {
    return null;
  }
  return { email: user.email, id: String(user._id) };
};

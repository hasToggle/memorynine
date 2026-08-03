import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authDb, authInstance, idForms } from "./instance";

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
 * The active organization's member directory (Liveblocks presence, mention
 * suggestions). Replaces Clerk's getOrganizationMembershipList.
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

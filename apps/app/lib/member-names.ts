import type { OrganizationMemberInfo } from "@repo/auth/server";

// Provenance is stored as identifiers, not names: fact.confirmedBy is a
// better-auth user id, source.capturedBy is an email address. A receipt must
// show neither — "user_ceo1" on a screen whose job is to explain where a claim
// came from is worse than saying nothing precise at all.

const EMAIL_PATTERN = /@/;

/**
 * Maps either identifier form to a display name. Unknown ids become "a
 * teammate"; unknown emails keep the address, which is still a true statement
 * about who captured the material — an external forwarder, usually.
 */
export const buildNameResolver = (
  members: OrganizationMemberInfo[]
): ((idOrEmail: string) => string) => {
  const byUserId = new Map(
    members.map((member) => [member.userId, member.name])
  );
  const byEmail = new Map(
    members.map((member) => [member.email.toLowerCase(), member.name])
  );

  return (idOrEmail: string) => {
    const byId = byUserId.get(idOrEmail);
    if (byId) {
      return byId;
    }
    const email = idOrEmail.toLowerCase();
    return (
      byEmail.get(email) ??
      (EMAIL_PATTERN.test(email) ? idOrEmail : "a teammate")
    );
  };
};

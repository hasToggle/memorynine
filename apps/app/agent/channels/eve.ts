import { authInstance } from "@repo/auth/instance";
import { isLoopbackRequest, localDev } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";

// The agent's front door. eve rejects unauthenticated traffic by default; this
// replaces the scaffold's placeholder with the app's own better-auth session,
// so the browser's existing cookie is the credential and there is no second
// token to mint or keep in sync.
//
// The tenant is stamped from the verified session's active organization and
// from nowhere else. Tools re-read it off ctx.session.auth rather than taking
// it as an argument, so a model that invents a tenant id cannot reach another
// organization's facts.
const betterAuthSession = async (request: Request) => {
  const session = await authInstance.api.getSession({
    headers: request.headers,
  });
  const userId = session?.user.id;
  const tenantId = session?.session.activeOrganizationId;

  // Returning null skips to the next verifier rather than accepting: a signed-in
  // user with no active organization has no tenant, and guessing one would be
  // the whole ballgame.
  if (!(userId && tenantId)) {
    return null;
  }

  return {
    attributes: { tenantId },
    authenticator: "better-auth",
    principalId: userId,
    principalType: "user" as const,
  };
};

/**
 * Stamps a tenant onto eval sessions. `eve eval` drives the agent over HTTP
 * with no better-auth cookie, so the auth walk falls through to localDev(),
 * whose attributes are empty — and search-knowledge then throws because it
 * reads tenantId off the verified session and from nowhere else.
 *
 * This grants no access that is not already granted: localDev() already
 * admits any loopback request unauthenticated. It only adds an attribute to
 * a principal that already gets in, and EVAL_TENANT_ID is unset in
 * production, so it returns null before the loopback check matters.
 *
 * Exported for test. Deliberately NOT a fallback default inside the tool —
 * guessing a tenant is the whole ballgame.
 */
export const evalTenant = (request: Request) => {
  const tenantId = process.env.EVAL_TENANT_ID;
  if (!(tenantId && isLoopbackRequest(request))) {
    return null;
  }
  return {
    attributes: { tenantId },
    authenticator: "eval",
    principalId: "eval",
    principalType: "user" as const,
  };
};

// Exported (not just inlined below) so a test can pin the order: evalTenant
// must run before localDev(), or a loopback eval request never reaches it —
// localDev() unconditionally accepts any loopback request, so if it came
// first it would win every time and evalTenant would become dead code with
// every test still green (this is what F1's fix actually depends on).
export const channelAuth = [betterAuthSession, evalTenant, localDev()];

// NOTE: route auth authenticates the caller, it does not prove that this caller
// owns the session id in the URL. eve treats a session id as a bearer
// capability, so before this is exposed beyond internal users we need to
// persist session → tenant ownership and check it on resume and on stream.
export default eveChannel({
  auth: channelAuth,
});

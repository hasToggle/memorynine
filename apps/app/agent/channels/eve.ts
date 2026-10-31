import { authInstance } from "@repo/auth/instance";
import { type AuthFn, localDev } from "eve/channels/auth";
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

// One verifier, used both as the gate inside evalTenant and as the last entry
// of channelAuth below.
const localDevVerifier = localDev();

/**
 * Stamps a tenant onto eval sessions. `eve eval` drives the agent over HTTP
 * with no better-auth cookie, so the auth walk falls through to localDev(),
 * whose attributes are empty — and search-knowledge then throws because it
 * reads tenantId off the verified session and from nowhere else.
 *
 * This grants no access that is not already granted: `eve eval` starts its own
 * development server, so localDev() already admits its requests
 * unauthenticated. This only adds an attribute to a principal that already
 * gets in. The gate is localDev()'s own verifier rather than a copy of its
 * rule, so evalTenant accepts exactly what localDev() accepts in whichever eve
 * version is installed. A copy drifted once already: eve 0.91 made localDev()
 * also refuse cross-site browser requests and remote peers, which a
 * deployment-only check here would have waved through. EVAL_TENANT_ID is also
 * unset in production, so it returns null before the gate matters.
 *
 * Exported for test. Deliberately NOT a fallback default inside the tool —
 * guessing a tenant is the whole ballgame.
 */
export const evalTenant = async (request: Request) => {
  const tenantId = process.env.EVAL_TENANT_ID;
  if (!(tenantId && (await localDevVerifier(request)))) {
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
// must run before localDev(), or an eval request never reaches it — localDev()
// accepts every request to a local development server, which is exactly where
// evals run, so if it came first it would win every time and evalTenant would
// become dead code with every test still green (this is what F1's fix actually
// depends on).
export const channelAuth: AuthFn<Request>[] = [
  betterAuthSession,
  evalTenant,
  localDevVerifier,
];

// NOTE: route auth authenticates the caller, it does not prove that this caller
// owns the session id in the URL. eve treats a session id as a bearer
// capability, so before this is exposed beyond internal users we need to
// persist session → tenant ownership and check it on resume and on stream.
export default eveChannel({
  auth: channelAuth,
});

/*
 * Sentry v11 changed several defaults that shape what reaches Sentry. These
 * options pin the v10 behaviour so the upgrade does not silently widen data
 * collection or rename the environments existing alerts and dashboards use.
 * https://github.com/getsentry/sentry-javascript/blob/develop/MIGRATION.md#upgrading-from-10x-to-11x
 */

const SENSITIVE_KEYS = ["forwarded", "-ip", "remote-", "via", "-user"];

// v11 collects cookies, bodies, user info, etc. unless told otherwise; this is
// the v10 baseline (sendDefaultPii unset) from the migration guide.
export const dataCollection = {
  cookies: false,
  databaseQueryData: false,
  frameContextLines: 7,
  genAI: { inputs: false, outputs: false },
  graphQL: { document: false, variables: false },
  httpBodies: [],
  httpHeaders: {
    request: { deny: SENSITIVE_KEYS },
    response: { deny: SENSITIVE_KEYS },
  },
  queues: false,
  urlQueryParams: { deny: SENSITIVE_KEYS },
  userInfo: false,
};

// v11 defaults to true, which regroups issues and marks captureMessage
// sessions as errored.
export const attachStacktrace = false;

/*
 * v10 reported `vercel-production` / `vercel-preview`; v11 drops the prefix.
 * Returning undefined falls through to the SDK's own default.
 */
export const legacyEnvironment = (
  vercelEnv: string | undefined
): string | undefined =>
  process.env.SENTRY_ENVIRONMENT ||
  (vercelEnv ? `vercel-${vercelEnv}` : undefined);

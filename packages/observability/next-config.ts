import { withLogtail } from "@logtail/next";
import { withSentryConfig } from "@sentry/nextjs";
import { keys } from "./keys";

const hasAuthToken = !!process.env.SENTRY_AUTH_TOKEN;

export const sentryConfig: Parameters<typeof withSentryConfig>[1] = {
  org: keys().SENTRY_ORG,
  project: keys().SENTRY_PROJECT,

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // Disable source map uploads and releases when no auth token is available
  sourcemaps: {
    disable: !hasAuthToken,
  },
  ...(hasAuthToken
    ? {}
    : {
        release: {
          create: false,
          name: "",
        },
      }),
  telemetry: hasAuthToken,

  /*
   * Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
   * This can increase your server load as well as your hosting bill.
   * Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
   * side errors will fail.
   */
  tunnelRoute: "/monitoring",

  /*
   * Automatically tree-shake Sentry logger statements to reduce bundle size,
   * and enable automatic instrumentation of Vercel Cron Monitors.
   * See the following for more information:
   * https://docs.sentry.io/product/crons/
   * https://vercel.com/docs/cron-jobs
   */
  webpack: {
    automaticVercelMonitors: true,
    treeshake: {
      removeDebugLogging: true,
    },
  },

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,
};

export const withSentry = (sourceConfig: object): object => {
  const configWithTranspile = {
    ...sourceConfig,
    transpilePackages: ["@sentry/nextjs"],
  };

  return withSentryConfig(configWithTranspile, sentryConfig);
};

export const withLogging = (config: object): object => withLogtail(config);

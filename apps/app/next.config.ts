import { withToolbar } from "@repo/feature-flags/lib/toolbar";
import { config, withAnalyzer } from "@repo/next-config";
import { withLogging, withSentry } from "@repo/observability/next-config";
import { withEve } from "eve/next";
import type { NextConfig } from "next";
import { env } from "@/env";

// withEve wraps the config *function* and returns one, so it goes on the
// outside rather than around the resolved object. Mounting the agent in
// ./agent at /eve/v1/* keeps it same-origin with the app: one dev server, one
// Vercel project, and the browser's better-auth cookie reaches the agent with
// no CORS or token plumbing.
export default withEve(async (): Promise<NextConfig> => {
  let nextConfig: NextConfig = await withToolbar(withLogging(config));

  nextConfig.reactCompiler = true;

  if (env.VERCEL) {
    nextConfig = withSentry(nextConfig);
  }

  if (env.ANALYZE === "true") {
    nextConfig = withAnalyzer(nextConfig);
  }

  return nextConfig;
});

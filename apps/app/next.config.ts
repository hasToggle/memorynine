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

  // The brain surfaces were consolidated into the home page; exact matches
  // only, so /review/[id] keeps working.
  nextConfig.redirects = () =>
    Promise.resolve(
      ["/ask", "/capture", "/review", "/people"].map((source) => ({
        destination: "/",
        permanent: false,
        source,
      }))
    );

  if (env.VERCEL) {
    nextConfig = withSentry(nextConfig);
  }

  if (env.ANALYZE === "true") {
    nextConfig = withAnalyzer(nextConfig);
  }

  return nextConfig;
});

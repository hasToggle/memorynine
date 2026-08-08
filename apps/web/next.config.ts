import { withToolbar } from "@repo/feature-flags/lib/toolbar";
import { config, withAnalyzer } from "@repo/next-config";
import { withLogging, withSentry } from "@repo/observability/next-config";
import type { NextConfig } from "next";
import { env } from "@/env";

export default async (): Promise<NextConfig> => {
  let nextConfig: NextConfig = await withToolbar(withLogging(config));

  nextConfig.reactCompiler = true;

  nextConfig.images?.remotePatterns?.push({
    hostname: "picsum.photos",
    protocol: "https",
  });

  const redirects: NextConfig["redirects"] = async () => [
    {
      destination: "/legal/privacy",
      source: "/legal",
      statusCode: 301,
    },
  ];

  nextConfig.redirects = redirects;

  if (env.VERCEL) {
    nextConfig = withSentry(nextConfig);
  }

  if (env.ANALYZE === "true") {
    nextConfig = withAnalyzer(nextConfig);
  }

  return nextConfig;
};

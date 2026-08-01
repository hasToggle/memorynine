import { authMiddleware } from "@repo/auth/middleware";
import { internationalizationMiddleware } from "@repo/internationalization/middleware";
import { parseError } from "@repo/observability/error";
import { secure } from "@repo/security";
import {
  noseconeOptions,
  noseconeOptionsWithToolbar,
  securityMiddleware,
} from "@repo/security/middleware";
import { createNEMO } from "@zanreal/nemo";
import { type NextProxy, type NextRequest, NextResponse } from "next/server";
import { env } from "@/env";

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|ingest|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};

const securityHeaders = env.FLAGS_SECRET
  ? securityMiddleware(noseconeOptionsWithToolbar)
  : securityMiddleware(noseconeOptions);

// Custom middleware for Arcjet security checks
const arcjetMiddleware = async (request: NextRequest) => {
  if (!env.ARCJET_KEY) {
    return;
  }

  try {
    await secure(
      [
        // See https://docs.arcjet.com/bot-protection/identifying-bots
        "CATEGORY:SEARCH_ENGINE", // Allow search engines
        "CATEGORY:PREVIEW", // Allow preview links to show OG images
        "CATEGORY:MONITOR", // Allow uptime monitoring services
      ],
      request
    );
  } catch (error) {
    const message = parseError(error);
    return NextResponse.json({ error: message }, { status: 403 });
  }
};

// Skip i18n rewriting for routes outside [locale] (i18n middleware's own
// matcher excludes these, but proxy.ts runs it for all matched routes via
// createNEMO, causing rewrites to /en/... paths that don't exist)
const i18nWithExclusions = (request: NextRequest) => {
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/confirmed") ||
    pathname.startsWith("/.well-known")
  ) {
    return;
  }
  return internationalizationMiddleware(request);
};

// Compose non-Clerk middleware with Nemo
const composedMiddleware = createNEMO(
  {},
  {
    // biome-ignore lint/suspicious/noExplicitAny: Type cast needed due to Next.js type duplication in monorepo
    before: [i18nWithExclusions as any, arcjetMiddleware],
  }
);

// Clerk middleware wraps other middleware in its callback
export const proxy = authMiddleware(
  // biome-ignore lint/suspicious/noExplicitAny: Type cast needed due to Next.js type duplication in monorepo
  async (_auth: any, request: Request, event: any) => {
    // Run security headers first
    const headersResponse = securityHeaders();

    // Then run composed middleware (i18n + arcjet)
    const middlewareResponse = await composedMiddleware(
      request as unknown as NextRequest,
      // biome-ignore lint/suspicious/noExplicitAny: Type cast needed due to Next.js type duplication in monorepo
      event as any
    );

    // Return middleware response if it exists, otherwise headers response
    return middlewareResponse || headersResponse;
  }
) as unknown as NextProxy;

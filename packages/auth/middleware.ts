import type { NextRequest } from "next/server";

// Signature-compatible replacement for clerkMiddleware(handler): the apps
// wrap their own logic (security headers, i18n) in authMiddleware. Route
// protection stays where it always was in this repo — the authenticated
// layout's redirect and per-page orgId checks — so the middleware itself
// only invokes the wrapped handler. The first argument Clerk used to
// provide is stubbed for the one consumer (apps/web) that names it.

type MiddlewareHandler = (
  auth: () => Promise<Record<string, never>>,
  request: NextRequest,
  event: unknown
) => Response | Promise<Response | undefined> | undefined;

export const authMiddleware =
  (handler: MiddlewareHandler) => (request: NextRequest, event: unknown) =>
    handler(() => Promise.resolve({}), request, event);

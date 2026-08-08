// Bun test preload: mock the server-only sentinel package (which throws outside
// a server component context) and stub external service dependencies (database,
// email, observability) to avoid real network/DB calls in tests.
// ABSTRACT_API_KEY is intentionally empty so the deliverability API layer is
// bypassed in all tests (fail-open behavior).
import { mock } from "bun:test";

// Set process.env fallbacks for required env vars. Bun's mock.module does not
// reliably intercept dynamic imports using path aliases (@/env), so when the
// real env.ts loads transitively it needs valid values to pass t3-env validation.
process.env.MONGODB_URI ??= "mongodb://localhost:27017/test";
process.env.RESEND_FROM ??= "test@example.com";
process.env.RESEND_TOKEN ??= "re_test_token";
process.env.RESEND_AUDIENCE_ID ??= "test-audience-id";
process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
process.env.NEXT_PUBLIC_WEB_URL ??= "http://localhost:3001";

mock.module("server-only", () => ({}));

mock.module("@/env", () => ({
  env: {
    ABSTRACT_API_KEY: "",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    NEXT_PUBLIC_WEB_URL: "http://localhost:3001",
    RESEND_FROM: "test@example.com",
  },
}));

mock.module("@repo/database", () => ({
  createId: () => "test-id",
  database: { subscriber: { updateOne: async () => ({}) } },
}));

mock.module("@repo/email", () => ({
  resend: { emails: { send: async () => ({ error: null }) } },
}));

mock.module("@repo/email/templates/confirm-subscription", () => ({
  default: () => null,
}));

mock.module("@repo/observability/error", () => ({
  parseError: () => undefined,
}));

mock.module("@repo/observability/log", () => ({
  log: { error: () => undefined, info: () => undefined, warn: () => undefined },
}));

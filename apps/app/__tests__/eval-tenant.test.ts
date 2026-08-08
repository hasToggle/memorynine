import { afterEach, describe, expect, test } from "bun:test";
import { channelAuth, evalTenant } from "../agent/channels/eve";

const req = (url: string) => new Request(url);

afterEach(() => {
  delete process.env.EVAL_TENANT_ID;
  delete process.env.EVE_DEV;
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
});

describe("evalTenant", () => {
  test("returns null when EVAL_TENANT_ID is unset", () => {
    delete process.env.EVAL_TENANT_ID;
    process.env.EVE_DEV = "1";
    expect(evalTenant(req("http://localhost:3000/eve/v1/session"))).toBeNull();
  });

  // eve 0.30.0 rebased the local-dev grant off the request host and onto the
  // deployment, because a Host header is attacker-supplied. A request that
  // looks loopback must no longer be enough on its own.
  test("returns null on a non-dev deployment even when set", () => {
    process.env.EVAL_TENANT_ID = "eval-tenant-alpha";
    expect(evalTenant(req("http://localhost:3000/eve/v1/session"))).toBeNull();
  });

  test("returns null in Vercel production even when set", () => {
    process.env.EVAL_TENANT_ID = "eval-tenant-alpha";
    process.env.VERCEL = "1";
    process.env.VERCEL_ENV = "production";
    expect(evalTenant(req("http://localhost:3000/eve/v1/session"))).toBeNull();
  });

  test("stamps the tenant under `eve dev`/`eve eval` when set", () => {
    process.env.EVAL_TENANT_ID = "eval-tenant-alpha";
    process.env.EVE_DEV = "1";
    const result = evalTenant(req("http://localhost:3000/eve/v1/session"));
    expect(result?.attributes).toEqual({ tenantId: "eval-tenant-alpha" });
    expect(result?.principalType).toBe("user");
  });

  test("stamps the tenant under `vercel dev` when set", () => {
    process.env.EVAL_TENANT_ID = "eval-tenant-beta";
    process.env.VERCEL = "1";
    process.env.VERCEL_ENV = "development";
    const result = evalTenant(req("https://app.example.com/eve/v1/session"));
    expect(result?.attributes).toEqual({ tenantId: "eval-tenant-beta" });
  });
});

describe("channelAuth order", () => {
  // Pins the composed order in apps/app/agent/channels/eve.ts:
  // [betterAuthSession, evalTenant, localDev()]. localDev() accepts every
  // request to a local development server — which is exactly where evals run —
  // so if a refactor ever moved it ahead of evalTenant, every eval request
  // would be satisfied by localDev() first and evalTenant would stop running
  // silently, since routeAuth just walks the array and stops at the first
  // non-null result. Every function in an eval session tag would still pass
  // with an untenanted session failing on plumbing exactly like the bug F1
  // fixed, and no assertion about evalTenant in isolation (above) would ever
  // catch it.
  test("evalTenant precedes localDev in the composed chain", () => {
    expect(channelAuth).toHaveLength(3);
    expect(channelAuth[1]).toBe(evalTenant);
    // localDev()'s returned verifier is an anonymous arrow function (`eve`'s
    // localDev() returns it from a `return` expression, not an assignment,
    // so it never gets a name inferred) — distinguishing it structurally
    // from betterAuthSession and evalTenant, both named const declarations.
    expect(channelAuth.map((fn) => fn.name)).toEqual([
      "betterAuthSession",
      "evalTenant",
      "",
    ]);
  });
});

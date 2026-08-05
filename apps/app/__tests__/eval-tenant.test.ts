import { afterEach, describe, expect, test } from "bun:test";
import { channelAuth, evalTenant } from "../agent/channels/eve";

const req = (url: string) => new Request(url);

afterEach(() => {
  delete process.env.EVAL_TENANT_ID;
});

describe("evalTenant", () => {
  test("returns null when EVAL_TENANT_ID is unset", () => {
    delete process.env.EVAL_TENANT_ID;
    expect(evalTenant(req("http://localhost:3000/eve/v1/session"))).toBeNull();
  });

  test("returns null for a non-loopback host even when set", () => {
    process.env.EVAL_TENANT_ID = "eval-tenant-alpha";
    expect(
      evalTenant(req("https://app.example.com/eve/v1/session"))
    ).toBeNull();
  });

  test("stamps the tenant for a loopback request when set", () => {
    process.env.EVAL_TENANT_ID = "eval-tenant-alpha";
    const result = evalTenant(req("http://localhost:3000/eve/v1/session"));
    expect(result?.attributes).toEqual({ tenantId: "eval-tenant-alpha" });
    expect(result?.principalType).toBe("user");
  });

  test("accepts 127.0.0.1 as loopback", () => {
    process.env.EVAL_TENANT_ID = "eval-tenant-beta";
    const result = evalTenant(req("http://127.0.0.1:3000/eve/v1/session"));
    expect(result?.attributes).toEqual({ tenantId: "eval-tenant-beta" });
  });
});

describe("channelAuth order", () => {
  // Pins the composed order in apps/app/agent/channels/eve.ts:
  // [betterAuthSession, evalTenant, localDev()]. localDev() unconditionally
  // accepts any loopback request, so if a refactor ever moved it ahead of
  // evalTenant, every loopback eval request would be satisfied by localDev()
  // first and evalTenant would stop running — silently, since routeAuth just
  // walks the array and stops at the first non-null result. Every function
  // in an eval session tag would still pass with an untenanted session
  // failing on plumbing exactly like the bug F1 fixed, and no assertion
  // about evalTenant in isolation (above) would ever catch it.
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

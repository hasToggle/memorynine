import { afterEach, describe, expect, test } from "bun:test";
import { evalTenant } from "../agent/channels/eve";

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

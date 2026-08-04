import { describe, expect, test } from "bun:test";
import {
  engagementSchema,
  engagements,
  oid,
  organizationSchema,
  organizations,
  people,
  personSchema,
  TENANT_ALPHA,
  TENANT_BETA,
} from "../fixtures";

describe("fixture ids", () => {
  test("oid is deterministic and 24 hex chars", () => {
    expect(oid(1, 1).toHexString()).toBe(oid(1, 1).toHexString());
    expect(oid(1, 1).toHexString()).toHaveLength(24);
    expect(oid(1, 1).toHexString()).not.toBe(oid(2, 1).toHexString());
  });
});

describe("entity fixtures", () => {
  test("organizations parse and span both tenants", () => {
    for (const org of organizations) {
      expect(() => organizationSchema.parse(org)).not.toThrow();
    }
    const tenants = new Set(organizations.map((o) => o.tenantId));
    expect(tenants).toEqual(new Set([TENANT_ALPHA, TENANT_BETA]));
  });

  test("people parse and reference real organizations", () => {
    const orgIds = new Set(organizations.map((o) => o._id.toHexString()));
    for (const person of people) {
      expect(() => personSchema.parse(person)).not.toThrow();
      if (person.organizationId) {
        expect(orgIds).toContain(person.organizationId.toHexString());
      }
    }
  });

  test("engagements parse and reference real organizations", () => {
    const orgIds = new Set(organizations.map((o) => o._id.toHexString()));
    for (const engagement of engagements) {
      expect(() => engagementSchema.parse(engagement)).not.toThrow();
      expect(orgIds).toContain(engagement.organizationId.toHexString());
    }
  });

  test("the two tenants share a confusable person name", () => {
    const alpha = people.filter((p) => p.tenantId === TENANT_ALPHA);
    const beta = people.filter((p) => p.tenantId === TENANT_BETA);
    const shared = alpha.filter((a) => beta.some((b) => b.name === a.name));
    expect(shared.length).toBeGreaterThan(0);
  });
});

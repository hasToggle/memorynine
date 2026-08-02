import { describe, expect, test } from "bun:test";
import { ObjectId } from "mongodb";
import {
  engagementSchema,
  organizationSchema,
  personSchema,
} from "../schemas/entities";

const base = {
  _id: new ObjectId(),
  createdAt: new Date(),
  tenantId: "test-tenant",
  updatedAt: new Date(),
};

describe("organizationSchema", () => {
  test("accepts a valid organization", () => {
    const result = organizationSchema.safeParse({
      ...base,
      domains: ["mueller.de"],
      industry: "manufacturing",
      name: "Müller GmbH",
      status: "lead",
    });
    expect(result.success).toBe(true);
  });

  test("defaults domains to empty array and rejects bad status", () => {
    const ok = organizationSchema.parse({
      ...base,
      name: "X",
      status: "active",
    });
    expect(ok.domains).toEqual([]);
    const bad = organizationSchema.safeParse({
      ...base,
      name: "X",
      status: "vip",
    });
    expect(bad.success).toBe(false);
  });

  test("rejects missing tenantId", () => {
    const { tenantId: _drop, ...rest } = base;
    const result = organizationSchema.safeParse({
      ...rest,
      name: "X",
      status: "lead",
    });
    expect(result.success).toBe(false);
  });
});

describe("personSchema", () => {
  test("accepts a person with and without organization", () => {
    const withOrg = personSchema.safeParse({
      ...base,
      emails: ["anna@mueller.de"],
      name: "Anna Schmidt",
      organizationId: new ObjectId(),
      role: "HR Director",
    });
    const withoutOrg = personSchema.safeParse({
      ...base,
      emails: [],
      name: "Anna Schmidt",
    });
    expect(withOrg.success).toBe(true);
    expect(withoutOrg.success).toBe(true);
  });

  test("rejects invalid email entries", () => {
    const result = personSchema.safeParse({
      ...base,
      emails: ["not-an-email"],
      name: "Anna",
    });
    expect(result.success).toBe(false);
  });
});

describe("engagementSchema", () => {
  test("requires organizationId and validates status", () => {
    const ok = engagementSchema.safeParse({
      ...base,
      organizationId: new ObjectId(),
      startDate: new Date("2026-09-01"),
      status: "planned",
      title: "Intrapreneurship-Workshop Q3",
      type: "workshop",
    });
    expect(ok.success).toBe(true);
    const missingOrg = engagementSchema.safeParse({
      ...base,
      status: "planned",
      title: "X",
      type: "workshop",
    });
    expect(missingOrg.success).toBe(false);
  });
});

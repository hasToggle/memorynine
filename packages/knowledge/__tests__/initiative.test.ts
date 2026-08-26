import { describe, expect, test } from "bun:test";
import { ObjectId } from "mongodb";
import {
  deliveryOutcomeValues,
  initiativeDeliverySchema,
  initiativeSettingsSchema,
} from "../schemas/initiative";

const now = () => ({ createdAt: new Date(), updatedAt: new Date() });

describe("initiativeSettingsSchema", () => {
  test("accepts an enabled tenant with recipients", () => {
    const parsed = initiativeSettingsSchema.parse({
      _id: new ObjectId(),
      ...now(),
      enabled: true,
      recipients: ["founder@example.com"],
      tenantId: "tenant-a",
    });
    expect(parsed.enabled).toBe(true);
  });

  test("rejects empty recipients", () => {
    const result = initiativeSettingsSchema.safeParse({
      _id: new ObjectId(),
      ...now(),
      enabled: true,
      recipients: [],
      tenantId: "tenant-a",
    });
    expect(result.success).toBe(false);
  });

  test("rejects a non-email recipient", () => {
    const result = initiativeSettingsSchema.safeParse({
      _id: new ObjectId(),
      ...now(),
      enabled: true,
      recipients: ["not-an-email"],
      tenantId: "tenant-a",
    });
    expect(result.success).toBe(false);
  });
});

describe("initiativeDeliverySchema", () => {
  test("accepts a claimed delivery", () => {
    const parsed = initiativeDeliverySchema.parse({
      _id: new ObjectId(),
      ...now(),
      date: "2026-08-26",
      outcome: "claimed",
      recipients: [],
      tenantId: "tenant-a",
    });
    expect(parsed.outcome).toBe("claimed");
  });

  test("rejects a malformed date key", () => {
    const result = initiativeDeliverySchema.safeParse({
      _id: new ObjectId(),
      ...now(),
      date: "26.08.2026",
      outcome: "sent",
      recipients: [],
      tenantId: "tenant-a",
    });
    expect(result.success).toBe(false);
  });

  test("outcome enum is exactly the four lifecycle states", () => {
    expect(deliveryOutcomeValues).toEqual([
      "claimed",
      "sent",
      "no-news",
      "failed",
    ]);
  });
});

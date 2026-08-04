import { describe, expect, test } from "bun:test";
import { ObjectId } from "mongodb";
import { usageOperationValues, usageSchema } from "../schemas/usage";

const base = {
  _id: new ObjectId(),
  cachedTokens: 0,
  completionTokens: 16,
  createdAt: new Date(),
  gatewayCost: 0.000_116_38,
  inferenceCost: 1.638e-5,
  model: "deepseek/deepseek-v4-flash-0731",
  operation: "extraction" as const,
  promptTokens: 85,
  reasoningTokens: 0,
  surchargeCost: 0.0001,
  tenantId: "t1",
  updatedAt: new Date(),
};

describe("usageSchema", () => {
  test("accepts a well-formed row", () => {
    expect(() => usageSchema.parse(base)).not.toThrow();
  });

  test("rejects an unknown operation", () => {
    expect(() => usageSchema.parse({ ...base, operation: "mining" })).toThrow();
  });

  test("rejects negative costs", () => {
    expect(() => usageSchema.parse({ ...base, gatewayCost: -1 })).toThrow();
  });

  test("covers every operation that spends money", () => {
    expect(new Set(usageOperationValues)).toEqual(
      new Set([
        "extraction",
        "consolidation",
        "contradiction",
        "eval-extraction",
        "eval-judge",
        "rerank",
      ])
    );
  });

  test("estimated is optional and defaults to absent, so a vendor-reported row is never confused with an estimate", () => {
    expect(usageSchema.parse(base).estimated).toBeUndefined();
    expect(usageSchema.parse({ ...base, estimated: true }).estimated).toBe(
      true
    );
  });
});

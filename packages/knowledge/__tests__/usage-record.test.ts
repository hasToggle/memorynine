import { describe, expect, test } from "bun:test";
import { createUsageRecorder, recordUsage } from "../usage";

const stubDb = () => {
  const inserted: Record<string, unknown>[] = [];
  const db = {
    collection: () => ({
      insertOne: (doc: Record<string, unknown>) => {
        inserted.push(doc);
        return Promise.resolve();
      },
    }),
  } as never;
  return { db, inserted };
};

const USAGE = {
  cachedTokens: 0,
  completionTokens: 16,
  gatewayCost: 0.000_116_38,
  generationId: "gen_1",
  inferenceCost: 1.638e-5,
  model: "deepseek/deepseek-v4-flash-0731",
  promptTokens: 85,
  reasoningTokens: 0,
  surchargeCost: 0.0001,
};

describe("recordUsage", () => {
  test("writes a schema-valid row carrying tenant, operation and correlation", async () => {
    const { db, inserted } = stubDb();
    await recordUsage(db, USAGE, {
      correlationId: "src-1",
      operation: "extraction",
      tenantId: "t1",
    });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      correlationId: "src-1",
      gatewayCost: 0.000_116_38,
      operation: "extraction",
      tenantId: "t1",
    });
  });
});

describe("createUsageRecorder", () => {
  test("is fire-and-forget: a rejecting insert never surfaces to the caller", async () => {
    const db = {
      collection: () => ({
        insertOne: () => Promise.reject(new Error("mongo down")),
      }),
    } as never;
    const record = createUsageRecorder(db);
    // Must not throw synchronously and must not produce an unhandled rejection.
    expect(() =>
      record(USAGE, { operation: "extraction", tenantId: "t1" })
    ).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  test("drops the row rather than throwing when no context was passed", () => {
    const { db, inserted } = stubDb();
    createUsageRecorder(db)(USAGE);
    expect(inserted).toHaveLength(0);
  });
});

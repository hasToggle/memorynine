import { describe, expect, test } from "bun:test";
import {
  buildTenantSpendPipeline,
  buildUnitEconomicsPipeline,
  formatTenantSpendTable,
  formatUnitEconomicsTable,
} from "../scripts/usage-report";

describe("buildTenantSpendPipeline", () => {
  test("filters by date range and groups by tenant and operation", () => {
    const from = new Date("2026-08-01");
    const to = new Date("2026-09-01");
    const pipeline = buildTenantSpendPipeline({ from, to });
    expect(pipeline[0]).toEqual({
      $match: { createdAt: { $gte: from, $lt: to } },
    });
    const group = pipeline.find((stage) => "$group" in stage);
    expect(group).toBeDefined();
    // gatewayCost, not inferenceCost — the surcharge is most of a short call.
    expect(JSON.stringify(group)).toContain("gatewayCost");
    expect(JSON.stringify(group)).not.toContain("inferenceCost");
  });

  test("narrows to one tenant when asked", () => {
    const pipeline = buildTenantSpendPipeline({
      from: new Date(0),
      tenantId: "t1",
      to: new Date(),
    });
    expect(JSON.stringify(pipeline[0])).toContain("t1");
  });

  test("omits tenantId from the match entirely when not narrowed", () => {
    const pipeline = buildTenantSpendPipeline({
      from: new Date(0),
      to: new Date(),
    });
    const match = pipeline[0] as { $match: Record<string, unknown> };
    expect(match.$match).not.toHaveProperty("tenantId");
  });
});

describe("buildUnitEconomicsPipeline", () => {
  test("groups by correlationId so cost per source is derivable", () => {
    const pipeline = buildUnitEconomicsPipeline({
      from: new Date(0),
      operation: "extraction",
      to: new Date(),
    });
    expect(JSON.stringify(pipeline)).toContain("$correlationId");
  });

  test("filters by operation when narrowed", () => {
    const pipeline = buildUnitEconomicsPipeline({
      from: new Date(0),
      operation: "extraction",
      to: new Date(),
    });
    expect(pipeline[0]).toEqual({
      $match: {
        createdAt: { $gte: new Date(0), $lt: expect.any(Date) },
        operation: "extraction",
      },
    });
  });
});

describe("formatTenantSpendTable", () => {
  test("surfaces the estimated portion separately rather than folding it into one silent total", () => {
    const table = formatTenantSpendTable(
      [
        {
          _id: { operation: "rerank", tenantId: "t1" },
          estimatedGatewayCost: 0.0002,
          exactGatewayCost: 0,
          requestCount: 2,
          totalGatewayCost: 0.0002,
        },
      ],
      { from: new Date("2026-08-01"), to: new Date("2026-09-01") }
    );
    expect(table).toContain("t1");
    expect(table).toContain("rerank");
    // Both the raw total and the estimated subset must be visible — an
    // estimate must never be indistinguishable from a vendor-reported figure.
    expect(table.toLowerCase()).toContain("estimated");
  });

  test("says so, rather than printing an empty table, when there are no rows", () => {
    const table = formatTenantSpendTable([], {
      from: new Date("2026-08-01"),
      to: new Date("2026-09-01"),
    });
    expect(table.toLowerCase()).toContain("no usage");
  });
});

describe("formatUnitEconomicsTable", () => {
  test("includes the correlationId per row", () => {
    const table = formatUnitEconomicsTable(
      [
        {
          _id: {
            correlationId: "src-42",
            operation: "extraction",
            tenantId: "t1",
          },
          estimatedGatewayCost: 0,
          exactGatewayCost: 0.0034,
          requestCount: 3,
          totalGatewayCost: 0.0034,
        },
      ],
      { from: new Date("2026-08-01"), to: new Date("2026-09-01") }
    );
    expect(table).toContain("src-42");
  });
});

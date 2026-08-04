// Pure aggregation builders and table formatting for the operator-run spend
// report. Deliberately free of MongoClient, argv parsing, process.exit and
// any entrypoint guard — the CLI wrapper lives in usage-report.cli.ts.
//
// Split for the same reason seed-evals.cli.ts is split from seed-evals.ts
// (see that file's header): this module's pipeline builders are imported
// directly by its own test today, and Spend T6 (eval cost reporting) is
// expected to import them from an eval file next — eval files get bundled
// by eve as ESM, where `module` is undefined, so a `require.main === module`
// guard in an imported module throws at eval-discovery time before any
// credentials are even needed. Keeping every entrypoint concern out of this
// file means there is nothing here for that bundling to choke on, and the
// pipelines stay testable as plain data with no cluster involved.
import type { Document } from "mongodb";
import type { UsageOperation } from "../schemas/usage";

export interface TenantSpendPipelineOptions {
  readonly from: Date;
  readonly tenantId?: string;
  readonly to: Date;
}

export interface UnitEconomicsPipelineOptions {
  readonly from: Date;
  readonly operation?: UsageOperation;
  readonly to: Date;
}

export interface SpendGroupRow {
  readonly estimatedGatewayCost: number;
  readonly exactGatewayCost: number;
  readonly requestCount: number;
  readonly totalGatewayCost: number;
}

export interface TenantSpendRow extends SpendGroupRow {
  readonly _id: { readonly operation: string; readonly tenantId: string };
}

export interface UnitEconomicsRow extends SpendGroupRow {
  readonly _id: {
    readonly correlationId: string | null;
    readonly operation: string;
    readonly tenantId: string;
  };
}

// `estimated` is only ever `true` (rerank, see gateway.ts's
// createVoyageRerank) or entirely absent (everything reported by the
// gateway itself — see schemas/usage.ts). `$eq: [..., true]` buckets
// missing/false the same way as "not estimated", which is what we want:
// there is no third state.
const spendAccumulators = {
  estimatedGatewayCost: {
    $sum: { $cond: [{ $eq: ["$estimated", true] }, "$gatewayCost", 0] },
  },
  exactGatewayCost: {
    $sum: { $cond: [{ $eq: ["$estimated", true] }, 0, "$gatewayCost"] },
  },
  requestCount: { $sum: 1 },
  // The number to report — gatewayCost is inference plus surcharges
  // (including the flat $0.0001 ZDR/tool surcharge), never inferenceCost
  // alone. See schemas/usage.ts's field comment: on a short call the
  // surcharge is most of the bill, and inferenceCost alone understates it.
  totalGatewayCost: { $sum: "$gatewayCost" },
} as const;

/**
 * Per-tenant, per-operation spend over `[from, to)`. `to` is exclusive: to
 * cover a whole calendar day/month, pass the day/month *after* the last one
 * you want — this mirrors the TTL index convention in collections.ts and
 * avoids an off-by-one that silently drops the last day from a report.
 */
export const buildTenantSpendPipeline = ({
  from,
  tenantId,
  to,
}: TenantSpendPipelineOptions): Document[] => {
  const match: Document = { createdAt: { $gte: from, $lt: to } };
  if (tenantId) {
    match.tenantId = tenantId;
  }

  return [
    { $match: match },
    {
      $group: {
        _id: { operation: "$operation", tenantId: "$tenantId" },
        ...spendAccumulators,
      },
    },
    // biome-ignore-start assist/source/useSortedKeys: sort key order is semantically significant — tenantId must lead so output groups by tenant first
    { $sort: { "_id.tenantId": 1, "_id.operation": 1 } },
    // biome-ignore-end assist/source/useSortedKeys: sort key order is semantically significant — tenantId must lead so output groups by tenant first
  ];
};

/**
 * Per-correlationId spend over `[from, to)` — the "what did ingesting
 * source X cost" question. `operation` is included in the group key
 * alongside `correlationId` because correlationId namespaces differ per
 * operation (a sourceId for extraction, an anchor id for
 * consolidation/contradiction, a run id for evals) and are not guaranteed
 * collision-free across them.
 */
export const buildUnitEconomicsPipeline = ({
  from,
  operation,
  to,
}: UnitEconomicsPipelineOptions): Document[] => {
  const match: Document = { createdAt: { $gte: from, $lt: to } };
  if (operation) {
    match.operation = operation;
  }

  return [
    { $match: match },
    {
      $group: {
        _id: {
          correlationId: "$correlationId",
          operation: "$operation",
          tenantId: "$tenantId",
        },
        ...spendAccumulators,
      },
    },
    { $sort: { totalGatewayCost: -1 } },
  ];
};

const formatCost = (value: number): string => `$${value.toFixed(4)}`;

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

const renderTable = (
  headers: readonly string[],
  rows: readonly (readonly string[])[]
): string => {
  const widths = headers.map((header, i) =>
    Math.max(header.length, ...rows.map((row) => (row[i] ?? "").length))
  );
  const renderRow = (cells: readonly string[]) =>
    cells.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join("  ");
  return [
    renderRow(headers),
    renderRow(widths.map((width) => "-".repeat(width))),
    ...rows.map(renderRow),
  ].join("\n");
};

const ESTIMATED_FOOTNOTE =
  "* Estimated cost is computed from a rate constant (currently only " +
  "rerank), not reported by the vendor. It is already included in Gateway " +
  "Cost above and broken out here so it is never mistaken for an exact, " +
  "vendor-reported figure.";

export interface TableRange {
  readonly from: Date;
  readonly tenantId?: string;
  readonly to: Date;
}

export const formatTenantSpendTable = (
  rows: readonly TenantSpendRow[],
  range: TableRange
): string => {
  const scope = range.tenantId ? ` — tenant ${range.tenantId}` : "";
  const header = `Tenant spend, ${isoDate(range.from)} to ${isoDate(range.to)} (exclusive)${scope}`;

  if (rows.length === 0) {
    return `${header}\n\n(no usage rows in range)`;
  }

  const table = renderTable(
    ["Tenant", "Operation", "Requests", "Gateway Cost", "Estimated*"],
    rows.map((row) => [
      row._id.tenantId,
      row._id.operation,
      String(row.requestCount),
      formatCost(row.totalGatewayCost),
      formatCost(row.estimatedGatewayCost),
    ])
  );

  const totalGatewayCost = rows.reduce(
    (sum, row) => sum + row.totalGatewayCost,
    0
  );
  const totalEstimated = rows.reduce(
    (sum, row) => sum + row.estimatedGatewayCost,
    0
  );

  return [
    header,
    "",
    table,
    "",
    `Total gateway cost: ${formatCost(totalGatewayCost)} (of which ${formatCost(totalEstimated)} estimated)`,
    ESTIMATED_FOOTNOTE,
  ].join("\n");
};

export const formatUnitEconomicsTable = (
  rows: readonly UnitEconomicsRow[],
  range: TableRange
): string => {
  const header = `Unit economics, ${isoDate(range.from)} to ${isoDate(range.to)} (exclusive)`;

  if (rows.length === 0) {
    return `${header}\n\n(no usage rows in range)`;
  }

  const table = renderTable(
    [
      "Correlation ID",
      "Tenant",
      "Operation",
      "Requests",
      "Gateway Cost",
      "Estimated*",
    ],
    rows.map((row) => [
      row._id.correlationId ?? "(none)",
      row._id.tenantId,
      row._id.operation,
      String(row.requestCount),
      formatCost(row.totalGatewayCost),
      formatCost(row.estimatedGatewayCost),
    ])
  );

  return [header, "", table, "", ESTIMATED_FOOTNOTE].join("\n");
};

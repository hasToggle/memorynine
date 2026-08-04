// CLI entrypoint for the usage report:
//   KNOWLEDGE_MONGODB_URI=... bun scripts/usage-report.cli.ts \
//     [--mode=tenant|unit] --from=YYYY-MM-DD --to=YYYY-MM-DD \
//     [--tenant=<id>] [--operation=<op>]
//
// Split from usage-report.ts for the same reason seed-evals.cli.ts is split
// from seed-evals.ts (see that file's header, and usage-report.ts's): the
// pipeline builders in usage-report.ts are imported by its own test, and
// may be imported by an eve-bundled eval file later (Spend T6). Keeping
// argv parsing, the MongoClient connection and the unconditional run() call
// here — in a file nothing else imports — means there is no entrypoint to
// guard in the module eval files would actually load, and no CJS-only
// global (`require`, `module`) anywhere near it.
//
// Never prints the connection string — only database names and figures.
import { MongoClient } from "mongodb";
import { getCollections } from "../collections";
import type { UsageOperation } from "../schemas/usage";
import { usageOperationValues } from "../schemas/usage";
import {
  buildTenantSpendPipeline,
  buildUnitEconomicsPipeline,
  formatTenantSpendTable,
  formatUnitEconomicsTable,
  type TenantSpendRow,
  type UnitEconomicsRow,
} from "./usage-report";

const HELP_TEXT = `Usage: bun scripts/usage-report.cli.ts [options]

Reports spend from the "usage" collection: either per tenant/operation
(--mode=tenant, the default) or per correlationId for unit economics
(--mode=unit, "what did ingesting source X cost").

Options:
  --mode=tenant|unit   Report shape. Default: tenant.
  --from=YYYY-MM-DD    Inclusive start of the range. Required.
  --to=YYYY-MM-DD      Exclusive end of the range — rows dated exactly on
                        this day are NOT included. Pass the day after the
                        last day you want (e.g. --to=2026-09-01 to cover all
                        of August).
  --tenant=<id>        Restrict to one tenant (tenant mode only).
  --operation=<op>     Restrict to one operation (unit mode only). One of:
                        ${usageOperationValues.join(", ")}
  --help, -h            Show this help and exit.

Env:
  KNOWLEDGE_MONGODB_URI   Required. Never printed.
  KNOWLEDGE_MONGODB_DB    Optional, default "knowledge".`;

const DATE_FLAG_REGEX = /^\d{4}-\d{2}-\d{2}$/;

interface ParsedArgs {
  readonly from?: string;
  readonly help: boolean;
  readonly mode: "tenant" | "unit";
  readonly operation?: string;
  readonly tenantId?: string;
  readonly to?: string;
}

const FLAG_PREFIXES = {
  from: "--from=",
  mode: "--mode=",
  operation: "--operation=",
  tenant: "--tenant=",
  to: "--to=",
} as const;

export const parseArgs = (argv: readonly string[]): ParsedArgs => {
  let mode: "tenant" | "unit" = "tenant";
  let from: string | undefined;
  let to: string | undefined;
  let tenantId: string | undefined;
  let operation: string | undefined;
  let help = false;

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg.startsWith(FLAG_PREFIXES.mode)) {
      const value = arg.slice(FLAG_PREFIXES.mode.length);
      if (value !== "tenant" && value !== "unit") {
        throw new Error(`--mode must be "tenant" or "unit", got "${value}"`);
      }
      mode = value;
    } else if (arg.startsWith(FLAG_PREFIXES.from)) {
      from = arg.slice(FLAG_PREFIXES.from.length);
    } else if (arg.startsWith(FLAG_PREFIXES.to)) {
      to = arg.slice(FLAG_PREFIXES.to.length);
    } else if (arg.startsWith(FLAG_PREFIXES.tenant)) {
      tenantId = arg.slice(FLAG_PREFIXES.tenant.length);
    } else if (arg.startsWith(FLAG_PREFIXES.operation)) {
      operation = arg.slice(FLAG_PREFIXES.operation.length);
    } else {
      throw new Error(`Unrecognized argument: ${arg}. Try --help.`);
    }
  }

  return { from, help, mode, operation, tenantId, to };
};

const requireFlag = (value: string | undefined, flag: string): string => {
  if (!value) {
    throw new Error(`${flag} is required (YYYY-MM-DD). Try --help.`);
  }
  return value;
};

const parseDateFlag = (value: string, flag: string): Date => {
  if (!DATE_FLAG_REGEX.test(value)) {
    throw new Error(`${flag} must be YYYY-MM-DD, got "${value}"`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${flag} is not a valid date: "${value}"`);
  }
  return date;
};

const isUsageOperation = (value: string): value is UsageOperation =>
  (usageOperationValues as readonly string[]).includes(value);

const run = async () => {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(HELP_TEXT);
    return;
  }

  const from = parseDateFlag(requireFlag(args.from, "--from"), "--from");
  const to = parseDateFlag(requireFlag(args.to, "--to"), "--to");

  if (args.operation && !isUsageOperation(args.operation)) {
    throw new Error(
      `--operation must be one of: ${usageOperationValues.join(", ")}`
    );
  }

  const uri = process.env.KNOWLEDGE_MONGODB_URI;
  if (!uri) {
    console.error("KNOWLEDGE_MONGODB_URI is required");
    process.exit(1);
  }

  const client = new MongoClient(uri);
  const db = client.db(process.env.KNOWLEDGE_MONGODB_DB ?? "knowledge");

  try {
    const { usage } = getCollections(db);

    if (args.mode === "unit") {
      const pipeline = buildUnitEconomicsPipeline({
        from,
        operation: args.operation as UsageOperation | undefined,
        to,
      });
      const rows = await usage.aggregate<UnitEconomicsRow>(pipeline).toArray();
      console.log(formatUnitEconomicsTable(rows, { from, to }));
    } else {
      const pipeline = buildTenantSpendPipeline({
        from,
        tenantId: args.tenantId,
        to,
      });
      const rows = await usage.aggregate<TenantSpendRow>(pipeline).toArray();
      console.log(
        formatTenantSpendTable(rows, { from, tenantId: args.tenantId, to })
      );
    }
  } finally {
    await client.close();
  }
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

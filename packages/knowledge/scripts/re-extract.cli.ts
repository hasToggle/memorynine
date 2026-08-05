// CLI entrypoint for bulk re-extraction:
//   KNOWLEDGE_MONGODB_URI=... AI_GATEWAY_API_KEY=... \
//     bun scripts/re-extract.cli.ts --skipped-only --limit=<n> [--apply] [--tenant=<id>]
//
// Split from re-extract.ts for the same reason usage-report.cli.ts and
// seed-evals.cli.ts are split from their pure modules (see those files'
// headers, and re-extract.ts's): keeping argv parsing, the MongoClient
// connection, the gateway call and the unconditional run() here — in a file
// nothing else imports — means the pure selector in re-extract.ts stays
// importable by anything (an eve-bundled eval file, a future caller)
// without pulling in a CJS-only global or a live network client.
//
// Dry run by default: --apply is required to write anything, and --limit is
// required unconditionally, with no default — this script spends a real
// model call per source, and refusing to guess a bound is the safety rail.
//
// Never prints the connection string — only ids, generations and outcomes.
import { type Db, MongoClient } from "mongodb";
import { getCollections } from "../collections";
import { createGatewayGenerate } from "../gateway";
import { reExtractSource } from "../re-extraction";
import { createUsageRecorder } from "../usage";
import {
  buildSkippedSourcesPipeline,
  formatSourceReportLine,
  type SkippedSourceRow,
} from "./re-extract";

const HELP_TEXT = `Usage: bun scripts/re-extract.cli.ts --skipped-only --limit=<n> [options]

Bulk re-extraction for sources whose MOST RECENT proposal was a skip. A
source skipped at an earlier generation and later extracted successfully is
NOT reselected here — only the latest proposal's outcome counts.

Options:
  --skipped-only   Required. The only selector this script supports — a
                    broader "re-extract everything" would create competing
                    proposals for already-reviewed material.
  --limit=<n>      Required. Caps how many sources are processed in this
                    run — this spends a real model call per source.
  --apply          Write changes. Without it, prints what WOULD happen and
                    touches nothing (the default).
  --tenant=<id>    Restrict to one tenant. Without it, all tenants.
  --help, -h       Show this help and exit.

Env:
  KNOWLEDGE_MONGODB_URI   Required. Never printed.
  KNOWLEDGE_MONGODB_DB    Optional, default "knowledge".
  AI_GATEWAY_API_KEY      Required when --apply is set. Not needed for a
                          dry run.`;

interface ParsedArgs {
  readonly apply: boolean;
  readonly help: boolean;
  readonly limit?: string;
  readonly skippedOnly: boolean;
  readonly tenantId?: string;
}

const FLAG_PREFIXES = {
  limit: "--limit=",
  tenant: "--tenant=",
} as const;

export const parseArgs = (argv: readonly string[]): ParsedArgs => {
  let apply = false;
  let help = false;
  let limit: string | undefined;
  let skippedOnly = false;
  let tenantId: string | undefined;

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--apply") {
      apply = true;
    } else if (arg === "--skipped-only") {
      skippedOnly = true;
    } else if (arg.startsWith(FLAG_PREFIXES.limit)) {
      limit = arg.slice(FLAG_PREFIXES.limit.length);
    } else if (arg.startsWith(FLAG_PREFIXES.tenant)) {
      tenantId = arg.slice(FLAG_PREFIXES.tenant.length);
    } else {
      throw new Error(`Unrecognized argument: ${arg}. Try --help.`);
    }
  }

  return { apply, help, limit, skippedOnly, tenantId };
};

export const parseLimit = (value: string | undefined): number => {
  if (!value) {
    throw new Error(
      "--limit is required (a positive integer) — this script spends a real model call per source. Try --help."
    );
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--limit must be a positive integer, got "${value}"`);
  }
  return parsed;
};

// Validated before any I/O: the safety rails must fire with no env set and
// no connection attempted, not get lost behind a later, unrelated error.
const validateArgs = (args: ParsedArgs): number => {
  const limit = parseLimit(args.limit);
  if (!args.skippedOnly) {
    throw new Error(
      "--skipped-only is required — it is the only selector this script supports. Try --help."
    );
  }
  return limit;
};

const requireEnv = (apply: boolean): string => {
  const uri = process.env.KNOWLEDGE_MONGODB_URI;
  if (!uri) {
    console.error("KNOWLEDGE_MONGODB_URI is required");
    process.exit(1);
  }
  if (apply && !process.env.AI_GATEWAY_API_KEY) {
    console.error("AI_GATEWAY_API_KEY is required when --apply is set");
    process.exit(1);
  }
  return uri;
};

/** Re-extracts (or, in a dry run, describes) one source, and returns its
 *  report line. Never throws — a failed re-extraction is reported as an
 *  "error" outcome so one bad source doesn't abort the whole batch. */
const processRow = async (
  db: Db,
  row: SkippedSourceRow,
  generate: ReturnType<typeof createGatewayGenerate> | undefined
): Promise<string> => {
  const sourceId = row.sourceId.toHexString();

  if (!generate) {
    return formatSourceReportLine({
      generation: row.generation,
      outcome: "dry-run",
      reason: row.skipReason,
      sourceId,
    });
  }

  try {
    const result = await reExtractSource(db, row.tenantId, {
      generate,
      sourceId: row.sourceId,
    });
    return formatSourceReportLine({
      generation: row.generation,
      outcome: result.status,
      reason: result.status === "skipped" ? result.reason : undefined,
      sourceId,
    });
  } catch (error) {
    return formatSourceReportLine({
      generation: row.generation,
      outcome: "error",
      reason: error instanceof Error ? error.message : String(error),
      sourceId,
    });
  }
};

const run = async () => {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(HELP_TEXT);
    return;
  }

  const limit = validateArgs(args);
  const uri = requireEnv(args.apply);

  const client = new MongoClient(uri);
  const db = client.db(process.env.KNOWLEDGE_MONGODB_DB ?? "knowledge");

  try {
    const { proposals } = getCollections(db);
    const pipeline = buildSkippedSourcesPipeline({
      before: new Date(),
      limit,
      tenantId: args.tenantId,
    });
    const rows = await proposals
      .aggregate<SkippedSourceRow>(pipeline)
      .toArray();

    const scope = args.tenantId ? ` for tenant ${args.tenantId}` : "";
    console.log(
      `${args.apply ? "Re-extracting" : "[dry run] Would re-extract"} ${rows.length} source(s)${scope}.`
    );

    const generate = args.apply
      ? createGatewayGenerate({ onUsage: createUsageRecorder(db) })
      : undefined;

    for (const row of rows) {
      // biome-ignore lint/performance/noAwaitInLoops: sequential real model calls against a real budget — nothing here should run concurrently
      console.log(await processRow(db, row, generate));
    }
  } finally {
    await client.close();
  }
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

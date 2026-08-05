// Pure aggregation builder and report-line formatting for the bulk
// re-extraction script. Deliberately free of MongoClient, argv parsing,
// process.exit and any entrypoint guard — the CLI wrapper lives in
// re-extract.cli.ts.
//
// Split for the same reason usage-report.cli.ts and seed-evals.cli.ts are
// split from their pure modules (see those files' headers): an importable
// module carrying `require.main === module` once broke an entire nine-eval
// suite, because eve bundles authored modules as ESM where `module` is
// undefined, and discovery imports every eval file before filtering.
// Keeping every entrypoint concern out of this file means there is nothing
// here for that bundling to choke on, and the selector stays testable as
// plain data with no cluster involved.
import type { Document, ObjectId } from "mongodb";

export interface SkippedSourcesPipelineOptions {
  /**
   * Exclusive upper bound on `proposal.createdAt`. Bounds the selection to a
   * stable snapshot — a concurrent sweep writing new proposals mid-run does
   * not change which sources this pass considers.
   */
  readonly before: Date;
  /**
   * Caps how many sources the aggregation itself returns — spend control at
   * the query level, not just a slice applied after the fact by the caller.
   */
  readonly limit?: number;
  readonly tenantId?: string;
}

export interface SkippedSourceRow {
  readonly generation: number;
  readonly proposalId: ObjectId;
  readonly skipReason: string;
  readonly sourceId: ObjectId;
  readonly tenantId: string;
}

/**
 * Selects sources whose MOST RECENT proposal was a skip — not sources that
 * have ever had a skip. A source skipped at generation 1 and later
 * extracted successfully at generation 2 must NOT be reselected here:
 * re-extracting it again would create a competing proposal for material
 * already resolved, at cost.
 *
 * Expressed as: group proposals by (sourceId, tenantId), keep only the
 * highest-`extractionGeneration` proposal per source (its "latest"), then
 * keep only the sources where THAT proposal carries a `skipReason`. Only
 * `kind: "ingestion"` proposals carry `extractionGeneration`/`skipReason` at
 * all — consolidation and contradiction proposals have neither and use
 * `derivedFrom` instead of `sourceId` for provenance, so they are excluded
 * up front rather than landing in a bogus "no sourceId" group.
 */
export const buildSkippedSourcesPipeline = ({
  before,
  limit,
  tenantId,
}: SkippedSourcesPipelineOptions): Document[] => {
  const match: Document = { createdAt: { $lt: before }, kind: "ingestion" };
  if (tenantId) {
    match.tenantId = tenantId;
  }

  const pipeline: Document[] = [
    { $match: match },
    // biome-ignore-start assist/source/useSortedKeys: sort key order is semantically significant — sourceId must lead so $group's $first below sees each source's documents together, generation descending so $first picks the LATEST one
    { $sort: { sourceId: 1, extractionGeneration: -1 } },
    // biome-ignore-end assist/source/useSortedKeys: sort key order is semantically significant — sourceId must lead so $group's $first below sees each source's documents together, generation descending so $first picks the LATEST one
    {
      $group: {
        _id: { sourceId: "$sourceId", tenantId: "$tenantId" },
        generation: { $first: "$extractionGeneration" },
        proposalId: { $first: "$_id" },
        skipReason: { $first: "$skipReason" },
      },
    },
    // The whole selector: keep a source only when ITS OWN latest proposal
    // carries a skipReason. A source resolved cleanly at a later generation
    // has skipReason absent on that proposal and is dropped, not reselected.
    //
    // Deliberately `$ne: null`, not `$exists: true`: $group's $first/$last
    // accumulators materialize a field that was ABSENT on the source
    // document as an explicit `null` in the group's output, so `$exists`
    // would be true for every group regardless of whether the winning
    // proposal actually had a skipReason. `$ne: null` matches only when the
    // field is present AND non-null — verified against a real Mongo, not
    // assumed from the docs.
    { $match: { skipReason: { $ne: null } } },
    {
      $project: {
        _id: 0,
        generation: 1,
        proposalId: 1,
        skipReason: 1,
        sourceId: "$_id.sourceId",
        tenantId: "$_id.tenantId",
      },
    },
    { $sort: { sourceId: 1 } },
  ];

  if (limit !== undefined) {
    pipeline.push({ $limit: limit });
  }

  return pipeline;
};

export interface SourceReportEntry {
  readonly generation: number;
  readonly outcome: string;
  /** Present for a dry-run candidate (its current skip reason) or when the
   *  outcome itself is another skip. Absent otherwise. */
  readonly reason?: string;
  readonly sourceId: string;
}

/** One human-readable line per source: id, generation, outcome, and the
 *  reason when there is one to show. Pure so the report format is testable
 *  without a database or a model call. */
export const formatSourceReportLine = ({
  generation,
  outcome,
  reason,
  sourceId,
}: SourceReportEntry): string => {
  const base = `${sourceId}  gen ${generation}  ${outcome}`;
  return reason ? `${base}  (${reason})` : base;
};

import type { Db, ObjectId } from "mongodb";
import { getCollections } from "./collections";
import type {
  ExtractionRunResult,
  RunExtractionOptions,
} from "./extraction-run";
import { runExtraction } from "./extraction-run";

// Re-extraction: the recourse for a source that was captured when the
// knowledge base had nothing to anchor against, or that was wrongly skipped.
// It supersedes the prior generation's proposal(s), bumps the generation
// counter, resets the source to an extractable status, then delegates to
// runExtraction — which reads the new generation off the source and does
// everything else (prompt building, parsing, proposal writing). That
// delegation is deliberate: reimplementing any of it here would drift.

export interface ReExtractSourceOptions {
  generate: RunExtractionOptions["generate"];
  /** Optional. Re-running against a knowledge base that has since grown
   *  entities is valuable with no hint at all — that is the bulk case. */
  hint?: string;
  sourceId: ObjectId;
}

export const reExtractSource = async (
  db: Db,
  tenantId: string,
  { generate, hint, sourceId }: ReExtractSourceOptions
): Promise<ExtractionRunResult> => {
  const { proposals, sources } = getCollections(db);

  const source = await sources.findOne({ _id: sourceId, tenantId });
  if (!source) {
    throw new Error(`Source ${sourceId.toHexString()} not found`);
  }
  if (!source.content) {
    throw new Error("Source has no content to extract from");
  }

  // A first extraction is runExtraction's job. Re-extracting something with
  // no prior proposal would create a generation-2 proposal with no
  // generation 1, which makes the history unreadable.
  const priorProposal = await proposals.findOne({ sourceId, tenantId });
  if (!priorProposal) {
    throw new Error(
      `Source ${sourceId.toHexString()} has no prior proposal — run runExtraction first`
    );
  }

  const writtenAt = new Date();

  // Superseded, not resolved — no human resolved this, and resolvedAt/
  // resolvedBy exist to record that one did. Writing them here would
  // corrupt the audit trail.
  await proposals.updateMany(
    { sourceId, status: "open", tenantId },
    { $set: { status: "superseded", updatedAt: writtenAt } }
  );

  // Must happen before runExtraction is called: it reads
  // source.extractionGeneration to derive the new proposal id. Bumping
  // after would make it write to the old generation's id instead, which
  // hits the crash-recovery early-return rather than extracting.
  const generation = (source.extractionGeneration ?? 1) + 1;
  // guardExtractable only accepts received/transcribed/extracting; a
  // skipped or previously-extracted source sits on "proposed", so it must
  // be reset to its extractable resting status first.
  const restingStatus = source.type === "voice" ? "transcribed" : "received";
  await sources.updateOne(
    { _id: sourceId, tenantId },
    {
      $set: {
        extractionGeneration: generation,
        status: restingStatus,
        updatedAt: writtenAt,
      },
    }
  );

  return runExtraction(db, tenantId, { generate, hint, sourceId });
};

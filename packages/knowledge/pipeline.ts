import type { Db } from "mongodb";
import { getCollections } from "./collections";
import { runExtraction } from "./extraction-run";
import { runTranscription, type TranscriptResult } from "./transcription";

// The cron-driven sweep: pick up every source waiting on a pipeline stage,
// across all tenants, and advance it. Each source is processed under its own
// tenantId, and one source's failure never stops the others — it lands in
// the report and the per-source failure budget decides its fate.

export interface SweepOptions {
  generate: (prompt: string) => Promise<string>;
  /** Max sources per stage per sweep. Default 10. */
  limit?: number;
  /** See RunTranscriptionOptions.resolveAudioUrl (private blob stores). */
  resolveAudioUrl?: (blobUrl: string) => Promise<string>;
  /**
   * An in-flight status (transcribing/extracting) older than this is a
   * crashed run, not a busy worker, and gets swept again. Default 10 min —
   * longer than any function timeout that could have been mid-flight.
   */
  staleAfterMs?: number;
  transcribe: (audioUrl: string) => Promise<TranscriptResult>;
}

export interface SweepReport {
  failures: string[];
  proposed: number;
  skipped: number;
  transcribed: number;
}

const DEFAULT_STALE_AFTER_MS = 10 * 60_000;

export const sweepPipeline = async (
  db: Db,
  {
    generate,
    limit = 10,
    resolveAudioUrl,
    staleAfterMs,
    transcribe,
  }: SweepOptions
): Promise<SweepReport> => {
  const { sources } = getCollections(db);
  const report: SweepReport = {
    failures: [],
    proposed: 0,
    skipped: 0,
    transcribed: 0,
  };
  const staleCutoff = new Date(
    Date.now() - (staleAfterMs ?? DEFAULT_STALE_AFTER_MS)
  );

  // Stage 1: voice sources waiting for a transcript — including ones a
  // crashed worker left in "transcribing" (stale updatedAt tells a crash
  // apart from a run that is still in flight elsewhere).
  const awaitingTranscription = await sources
    .find({
      $or: [
        { status: "received" },
        { status: "transcribing", updatedAt: { $lt: staleCutoff } },
      ],
      "audio.blobUrl": { $exists: true },
      type: "voice",
    })
    .sort({ createdAt: 1 })
    .limit(limit)
    .toArray();

  for (const source of awaitingTranscription) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: sources are processed sequentially on purpose — parallel transcription would multiply provider load and interleave failure-budget writes
      const result = await runTranscription(db, source.tenantId, {
        resolveAudioUrl,
        sourceId: source._id,
        transcribe,
      });
      if (result.status === "transcribed") {
        report.transcribed += 1;
      } else {
        report.failures.push(
          `${source._id.toHexString()}: ${result.reason ?? result.status}`
        );
      }
    } catch (error) {
      report.failures.push(
        `${source._id.toHexString()}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Stage 2: sources with content waiting for extraction — freshly
  // transcribed voice sources and crashed "extracting" runs included.
  // runExtraction resumes the latter idempotently (an existing proposal
  // just heals the status).
  const awaitingExtraction = await sources
    .find({
      $or: [
        { status: "transcribed" },
        {
          content: { $exists: true },
          status: "received",
          type: { $in: ["email", "manual"] },
        },
        {
          content: { $exists: true },
          status: "extracting",
          updatedAt: { $lt: staleCutoff },
        },
      ],
    })
    .sort({ createdAt: 1 })
    .limit(limit)
    .toArray();

  for (const source of awaitingExtraction) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: sequential keeps LLM concurrency and failure-budget writes predictable
      const result = await runExtraction(db, source.tenantId, {
        generate,
        sourceId: source._id,
      });
      if (result.status === "proposed") {
        report.proposed += 1;
      } else if (result.status === "skipped") {
        report.skipped += 1;
      } else {
        report.failures.push(
          `${source._id.toHexString()}: ${result.reason ?? result.status}`
        );
      }
    } catch (error) {
      report.failures.push(
        `${source._id.toHexString()}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return report;
};

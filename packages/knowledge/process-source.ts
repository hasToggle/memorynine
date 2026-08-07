import type { Db, ObjectId } from "mongodb";
import { getCollections } from "./collections";
import { runExtraction } from "./extraction-run";
import type { UsageContext } from "./gateway";
import { runTranscription, type TranscriptResult } from "./transcription";

// The instant path: advance ONE just-captured source as far as it can go,
// right now, instead of waiting for the next cron sweep. The sweep stays the
// backstop — anything this leaves behind (no transcriber wired, a retryable
// failure, a crash) is picked up by the sweep exactly as before, because
// both paths speak the same source statuses and the same idempotent workers.

export interface ProcessSourceOptions {
  generate: (prompt: string, context?: UsageContext) => Promise<string>;
  /** See RunTranscriptionOptions.resolveAudioUrl (private blob stores). */
  resolveAudioUrl?: (blobUrl: string) => Promise<string>;
  sourceId: ObjectId;
  /** Omitted (no key in this runtime), a voice source is left for the cron. */
  transcribe?: (audioUrl: string) => Promise<TranscriptResult>;
}

export interface ProcessSourceResult {
  proposalId?: ObjectId;
  reason?: string;
  status: "deferred" | "failed" | "noop" | "proposed" | "retry" | "skipped";
}

// Only sources at rest are picked up. "extracting"/"transcribing" means a
// worker is on it right now — racing it would just double the LLM spend —
// and everything from "proposed" onward is already past this stage.
const RESTING_STATUSES = new Set(["received", "transcribed"]);

export const processSource = async (
  db: Db,
  tenantId: string,
  { generate, resolveAudioUrl, sourceId, transcribe }: ProcessSourceOptions
): Promise<ProcessSourceResult> => {
  const { sources } = getCollections(db);
  const source = await sources.findOne({ _id: sourceId, tenantId });
  if (!source) {
    throw new Error(`Source ${sourceId.toHexString()} not found`);
  }
  if (!RESTING_STATUSES.has(source.status)) {
    return { reason: `source is ${source.status}`, status: "noop" };
  }

  if (source.type === "voice" && !source.content) {
    if (!transcribe) {
      return {
        reason: "no transcriber in this runtime; the cron sweep will",
        status: "deferred",
      };
    }
    const transcription = await runTranscription(db, tenantId, {
      resolveAudioUrl,
      sourceId,
      transcribe,
    });
    if (transcription.status !== "transcribed") {
      return { reason: transcription.reason, status: transcription.status };
    }
  } else if (!source.content) {
    return { reason: "source has no content", status: "noop" };
  }

  return await runExtraction(db, tenantId, { generate, sourceId });
};

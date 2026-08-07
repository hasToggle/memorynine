import {
  createAssemblyAiTranscriber,
  createGatewayGenerate,
  createUsageRecorder,
  type ObjectId,
  processSource,
} from "@repo/knowledge";
import { getKnowledgeDb } from "@repo/knowledge/client";
import { log } from "@repo/observability/log";
import { issueSignedToken, presignUrl } from "@repo/storage";

// The instant leg of the capture pipeline: fired via after() the moment a
// source is stored, so a note or memo is usually review-ready in seconds
// instead of waiting for the next cron sweep. Strictly best-effort — every
// outcome here (missing env, a retryable failure, a crash mid-run) leaves
// the source in a state the 5-minute sweep already knows how to pick up.

const PRESIGN_TTL_MS = 60 * 60 * 1000;

// Same presign dance as the cron route: the blob store is private, so the
// transcription provider gets a short-lived GET URL, never the stored one.
const resolveAudioUrl = async (blobUrl: string): Promise<string> => {
  const pathname = decodeURIComponent(new URL(blobUrl).pathname.slice(1));
  const token = await issueSignedToken({
    operations: ["get"],
    pathname,
    validUntil: Date.now() + PRESIGN_TTL_MS,
  });
  const { presignedUrl } = await presignUrl(token, {
    access: "private",
    operation: "get",
    pathname,
  });
  return presignedUrl;
};

export const processSourceNow = async (
  tenantId: string,
  sourceId: ObjectId
): Promise<void> => {
  try {
    const db = getKnowledgeDb();
    const result = await processSource(db, tenantId, {
      generate: createGatewayGenerate({ onUsage: createUsageRecorder(db) }),
      sourceId,
      // No transcription key in this runtime? The voice source is simply
      // deferred to the cron, which may run where the key exists.
      ...(process.env.ASSEMBLYAI_API_KEY
        ? { resolveAudioUrl, transcribe: createAssemblyAiTranscriber() }
        : {}),
    });
    if (result.status === "failed" || result.status === "retry") {
      log.warn(
        `instant pipeline: source ${sourceId.toHexString()} ${result.status}: ${result.reason ?? ""}`
      );
    }
  } catch (error) {
    // Never let the instant leg break the capture it rides on.
    log.error(
      `instant pipeline: source ${sourceId.toHexString()} threw: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

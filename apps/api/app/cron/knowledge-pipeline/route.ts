import {
  createAssemblyAiTranscriber,
  createGatewayGenerate,
  listBlobCleanupCandidates,
  markSourceBlobsDeleted,
  sweepPipeline,
} from "@repo/knowledge";
import { getKnowledgeDb } from "@repo/knowledge/client";
import { del, issueSignedToken, presignUrl } from "@repo/storage";

// Transcription polling dominates the runtime; a busy sweep with several
// voice memos needs more than the default function budget.
export const maxDuration = 300;

// The blob store is private, so AssemblyAI cannot fetch stored URLs
// directly. Hand it a short-lived presigned GET URL instead — long enough
// to cover queueing plus the transcription itself.
const PRESIGN_TTL_MS = 60 * 60 * 1000;

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

export const GET = async (request: Request) => {
  // Vercel Cron sends `authorization: Bearer ${CRON_SECRET}` when the env
  // var is set. Without the secret configured, the route stays open (dev).
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = getKnowledgeDb();
  const report = await sweepPipeline(db, {
    generate: createGatewayGenerate(),
    resolveAudioUrl,
    transcribe: createAssemblyAiTranscriber(),
  });

  // Crash recovery for erasure: if an erase action died between reporting
  // orphaned blobs and deleting them, the flag is still set — finish the
  // job here. del() is idempotent, so double-deletes are harmless.
  let blobsCleaned = 0;
  for (const candidate of await listBlobCleanupCandidates(db)) {
    try {
      if (candidate.blobUrls.length > 0) {
        // biome-ignore lint/performance/noAwaitInLoops: sequential keeps delete-then-mark ordering per source
        await del(candidate.blobUrls);
        blobsCleaned += candidate.blobUrls.length;
      }
      await markSourceBlobsDeleted(db, candidate.tenantId, candidate.sourceId);
    } catch (error) {
      report.failures.push(
        `blob cleanup ${candidate.sourceId.toHexString()}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return Response.json(
    { ...report, blobsCleaned },
    { status: report.failures.length > 0 ? 207 : 200 }
  );
};

import {
  createAssemblyAiTranscriber,
  createGatewayGenerate,
  sweepPipeline,
} from "@repo/knowledge";
import { getKnowledgeDb } from "@repo/knowledge/client";
import { issueSignedToken, presignUrl } from "@repo/storage";

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

  const report = await sweepPipeline(getKnowledgeDb(), {
    generate: createGatewayGenerate(),
    resolveAudioUrl,
    transcribe: createAssemblyAiTranscriber(),
  });

  return Response.json(report, {
    status: report.failures.length > 0 ? 207 : 200,
  });
};

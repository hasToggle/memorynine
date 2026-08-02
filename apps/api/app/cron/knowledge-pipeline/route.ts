import {
  createAssemblyAiTranscriber,
  createGatewayGenerate,
  sweepPipeline,
} from "@repo/knowledge";
import { getKnowledgeDb } from "@repo/knowledge/client";

// Transcription polling dominates the runtime; a busy sweep with several
// voice memos needs more than the default function budget.
export const maxDuration = 300;

export const GET = async (request: Request) => {
  // Vercel Cron sends `authorization: Bearer ${CRON_SECRET}` when the env
  // var is set. Without the secret configured, the route stays open (dev).
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const report = await sweepPipeline(getKnowledgeDb(), {
    generate: createGatewayGenerate(),
    transcribe: createAssemblyAiTranscriber(),
  });

  return Response.json(report, {
    status: report.failures.length > 0 ? 207 : 200,
  });
};

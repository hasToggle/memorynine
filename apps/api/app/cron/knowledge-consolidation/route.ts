import { createGatewayGenerate, sweepConsolidation } from "@repo/knowledge";
import { getKnowledgeDb } from "@repo/knowledge/client";

// A handful of anchors, one LLM call each — but reasoning models can take
// a while per call, so give the sweep room.
export const maxDuration = 300;

export const GET = async (request: Request) => {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const report = await sweepConsolidation(getKnowledgeDb(), {
    generate: createGatewayGenerate(),
  });

  return Response.json(report, {
    status: report.failures.length > 0 ? 207 : 200,
  });
};

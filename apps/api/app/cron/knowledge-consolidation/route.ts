import {
  createGatewayGenerate,
  sweepConsolidation,
  sweepContradictions,
} from "@repo/knowledge";
import { getKnowledgeDb } from "@repo/knowledge/client";
import { requireCronSecret } from "../auth";

// The dream cycle: two sweeps, a handful of anchors each, one LLM call per
// anchor. Reasoning models can take a while per call, so give it room.
export const maxDuration = 300;

export const GET = async (request: Request) => {
  const unauthorized = requireCronSecret(request);
  if (unauthorized) {
    return unauthorized;
  }

  const db = getKnowledgeDb();
  const generate = createGatewayGenerate();

  // Consolidation first: it collapses redundant restatements, so the
  // contradiction pass compares a smaller, cleaner set and is less likely to
  // read two phrasings of the same fact as a disagreement.
  const consolidation = await sweepConsolidation(db, { generate });
  const contradiction = await sweepContradictions(db, { generate });

  const failures = [
    ...consolidation.failures.map((f) => `consolidation: ${f}`),
    ...contradiction.failures.map((f) => `contradiction: ${f}`),
  ];

  return Response.json(
    { consolidation, contradiction, failures },
    { status: failures.length > 0 ? 207 : 200 }
  );
};

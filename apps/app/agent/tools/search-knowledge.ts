import {
  createVoyageRerank,
  type Fact,
  factCategoryValues,
  findContestedFactIds,
  retrieveFacts,
} from "@repo/knowledge";
import { getKnowledgeDb } from "@repo/knowledge/client";
import { defineTool } from "eve/tools";
import { z } from "zod";

// Built once, not per call, and only when a key is configured — without one
// the read path still works, it just returns fusion order instead of
// cross-encoder order.
let rerank: ReturnType<typeof createVoyageRerank<Fact>> | null | undefined;
const getRerank = () => {
  if (rerank === undefined) {
    rerank = process.env.VOYAGE_API_KEY ? createVoyageRerank<Fact>() : null;
  }
  return rerank ?? undefined;
};

export default defineTool({
  description:
    "Search the company knowledge base for confirmed facts about people, organizations and engagements. Call this before answering any question about who someone is, what a client wants, or what was decided — you have no knowledge of this company otherwise. Returns each fact with the id you must cite it by.",
  async execute(input, ctx) {
    // The tenant comes from the verified session, never from the model. A
    // tenantId in the tool input would be attacker-reachable through prompt
    // injection in any ingested email.
    const tenantId = ctx.session.auth.current?.attributes?.tenantId;
    if (typeof tenantId !== "string" || tenantId.length === 0) {
      throw new Error(
        "No active organization on this session; cannot search the knowledge base."
      );
    }

    const results = await retrieveFacts(getKnowledgeDb(), {
      category: input.category,
      query: input.query,
      rerank: getRerank(),
      tenantId,
    });

    // Whether a reviewer is currently being asked to settle a disagreement
    // about this fact. The instructions require conflicts to be shown rather
    // than silently resolved; without this the model cannot tell.
    //
    // Failures degrade to empty set (all facts contested: false) rather than
    // failing the entire search. Retrieval must not be held hostage by a
    // supplementary lookup. The authoritative warning surface is getReceipts,
    // which runs its own independent findContestedFactIds call when a citation
    // is opened; a reader who clicks through still sees "Two versions on
    // record" even if this lookup failed. What is lost is only the model's
    // ability to mention the conflict in prose.
    let contested: Set<string>;
    try {
      contested = await findContestedFactIds(
        getKnowledgeDb(),
        tenantId,
        results.map(({ fact }) => fact._id)
      );
    } catch (error) {
      console.warn(
        `search-knowledge: contested lookup failed, assuming no conflicts: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      contested = new Set();
    }

    return {
      // Shaped for citation: the id is the thing the model has to reproduce
      // exactly, so it leads. Dates and ObjectIds are stringified because tool
      // output crosses a durable JSON boundary.
      //
      // Provenance deliberately does NOT travel here — see get-receipts.ts.
      facts: results.map(({ fact, relevanceScore }) => ({
        category: fact.category,
        confidence: fact.confidence,
        contested: contested.has(fact._id.toHexString()),
        id: fact._id.toHexString(),
        relevanceScore,
        text: fact.text,
        validFrom: fact.validFrom?.toISOString() ?? null,
      })),
      searched: input.query,
    };
  },
  inputSchema: z.object({
    category: z
      .enum(factCategoryValues)
      .optional()
      .describe(
        "Narrow to one kind of fact. Omit unless the question is clearly about only one — narrowing costs recall."
      ),
    query: z
      .string()
      .min(1)
      .describe(
        "What to look for, in the language the facts are likely written in. A name, a topic, or a short phrase works better than a full sentence."
      ),
  }),
});

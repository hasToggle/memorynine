import { retrieveSources } from "@repo/knowledge";
import { getKnowledgeDb } from "@repo/knowledge/client";
import { defineTool } from "eve/tools";
import { z } from "zod";

// The unverified tier of the ask surface: raw captured material is
// searchable the moment it lands, hours to days before a reviewer distills
// any of it into confirmed facts. The tool exists so "what did we ingest
// this morning?" has an answer before the review queue has been worked.

export default defineTool({
  description:
    "Search the raw captured sources — voice-memo transcripts, forwarded emails, pasted notes — including material no reviewer has confirmed yet. Use this when search-knowledge returns nothing or too little, or when the question concerns something captured very recently. Everything returned is UNVERIFIED raw material: attribute it to its source when you use it, never present it as established fact.",
  async execute(input, ctx) {
    // The tenant comes from the verified session, never from the model. A
    // tenantId in the tool input would be attacker-reachable through prompt
    // injection in any ingested email.
    const tenantId = ctx.session.auth.current?.attributes?.tenantId;
    if (typeof tenantId !== "string" || tenantId.length === 0) {
      throw new Error(
        "No active organization on this session; cannot search sources."
      );
    }

    const hits = await retrieveSources(getKnowledgeDb(), {
      query: input.query,
      tenantId,
      ...(input.type ? { type: input.type } : {}),
    });

    return {
      searched: input.query,
      // Shaped for citation, like search-knowledge: the id leads. Dates and
      // ObjectIds are stringified because tool output crosses a durable JSON
      // boundary.
      sources: hits.map((hit) => ({
        capturedAt: hit.createdAt?.toISOString() ?? null,
        capturedBy: hit.capturedBy,
        excerpt: hit.excerpt,
        id: hit._id.toHexString(),
        occurredAt: hit.occurredAt?.toISOString() ?? null,
        // "reviewed" means a human worked this source's proposal — anything
        // else is still waiting on review.
        reviewed: hit.status === "reviewed",
        subject: hit.email?.subject ?? null,
        type: hit.type,
      })),
    };
  },
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .describe(
        "What to look for, in the language the source is likely written in. A name, a topic, or a short phrase works better than a full sentence."
      ),
    type: z
      .enum(["voice", "email", "manual"])
      .optional()
      .describe(
        "Narrow to one capture channel. Omit unless the question names one — narrowing costs recall."
      ),
  }),
});

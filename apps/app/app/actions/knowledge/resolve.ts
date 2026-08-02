"use server";

import { auth } from "@repo/auth/server";
import {
  getCollections,
  ObjectId,
  refreshDossier,
  resolveProposalItems,
} from "@repo/knowledge";
import { getKnowledgeDb } from "@repo/knowledge/client";
import { revalidatePath } from "next/cache";
import {
  buildResolveInput,
  collectDossierAnchors,
  type ReviewSelections,
} from "@/lib/review-decisions";

export interface ResolveResult {
  createdFactCount: number;
  error?: string;
  proposalResolved: boolean;
}

export const resolveProposal = async (
  proposalId: string,
  selections: ReviewSelections,
  originalFactTexts: Record<number, string>
): Promise<ResolveResult> => {
  const { orgId, userId } = await auth();
  if (!(orgId && userId)) {
    return {
      createdFactCount: 0,
      error: "Not signed in to an organization",
      proposalResolved: false,
    };
  }

  const db = getKnowledgeDb();
  const input = buildResolveInput(selections, originalFactTexts);

  try {
    const result = await resolveProposalItems(db, orgId, {
      entities: input.entities,
      facts: input.facts,
      proposalId: new ObjectId(proposalId),
      resolvedBy: userId,
    });

    // Keep the always-loadable tier current: refresh the dossier of every
    // anchor that just gained a fact.
    if (result.createdFactIds.length > 0) {
      const { facts } = getCollections(db);
      const created = await facts
        .find({ _id: { $in: result.createdFactIds }, tenantId: orgId })
        .toArray();
      for (const anchor of collectDossierAnchors(created)) {
        // biome-ignore lint/performance/noAwaitInLoops: a handful of anchors per review; sequential keeps it simple
        await refreshDossier(db, orgId, anchor);
      }
    }

    revalidatePath("/review");
    revalidatePath(`/review/${proposalId}`);
    return {
      createdFactCount: result.createdFactIds.length,
      proposalResolved: result.proposalResolved,
    };
  } catch (error) {
    return {
      createdFactCount: 0,
      error: error instanceof Error ? error.message : "Resolution failed",
      proposalResolved: false,
    };
  }
};

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
  friendlyResolveError,
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
  const objectId = new ObjectId(proposalId);

  try {
    // resolveProposalItems treats "resolved" as a safe no-op (crash-resume:
    // re-running the same decisions on an already-fully-resolved proposal is
    // deliberately idempotent, see review.ts). "superseded" is different — a
    // re-extraction replaced this proposal with a new generation, so acting
    // on it here would silently do nothing while still reporting success.
    // Caught here, at the same layer I2's re-extract guard lives in, rather
    // than inside resolveProposalItems itself, so the documented idempotent-
    // resume behaviour for "resolved" stays intact for every caller.
    const proposal = await getCollections(db).proposals.findOne({
      _id: objectId,
      tenantId: orgId,
    });
    if (proposal?.status === "superseded") {
      return {
        createdFactCount: 0,
        error:
          "This proposal has been superseded — open the current one from the review queue.",
        proposalResolved: false,
      };
    }

    const result = await resolveProposalItems(db, orgId, {
      entities: input.entities,
      facts: input.facts,
      proposalId: objectId,
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
      // The referential invariants read like stack traces; translate them.
      // With the form's cascade they only surface from a stale tab.
      error: friendlyResolveError(
        error instanceof Error ? error.message : "Resolution failed"
      ),
      proposalResolved: false,
    };
  }
};

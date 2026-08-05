"use server";

import { auth } from "@repo/auth/server";
import {
  createGatewayGenerate,
  createUsageRecorder,
  getCollections,
  ObjectId,
  reExtractSource,
} from "@repo/knowledge";
import { getKnowledgeDb } from "@repo/knowledge/client";
import { revalidatePath } from "next/cache";

// The recourse this whole review surface exists for: a source the model got
// nothing from (or wrongly skipped) can be re-run, optionally with a hint,
// straight from the review UI. Delegates entirely to reExtractSource (Task
// 4) — this action's only job is auth, tenant-scoped lookup, and wiring the
// gateway so spend lands in the usage collection like every other
// extraction.

export interface ReExtractResult {
  error?: string;
  proposalId?: string;
  reason?: string;
  status?: "failed" | "proposed" | "retry" | "skipped";
}

const HEX_ID_REGEX = /^[0-9a-f]{24}$/;

export const reExtractProposal = async (
  proposalId: string,
  hint?: string
): Promise<ReExtractResult> => {
  const { orgId } = await auth();
  if (!orgId) {
    return { error: "Not signed in to an organization" };
  }
  if (!HEX_ID_REGEX.test(proposalId)) {
    return { error: "Invalid proposal id" };
  }

  const db = getKnowledgeDb();

  // tenantId comes from the verified session and is part of the lookup
  // filter itself, not a post-hoc comparison — a proposal id from another
  // tenant simply does not match and looks identical to "not found".
  const proposal = await getCollections(db).proposals.findOne({
    _id: new ObjectId(proposalId),
    tenantId: orgId,
  });
  if (!proposal) {
    return { error: "Proposal not found" };
  }
  if (!proposal.sourceId) {
    return { error: "Proposal has no source to re-extract" };
  }

  try {
    const result = await reExtractSource(db, orgId, {
      generate: createGatewayGenerate({ onUsage: createUsageRecorder(db) }),
      ...(hint ? { hint } : {}),
      sourceId: proposal.sourceId,
    });
    revalidatePath("/review");
    return {
      proposalId: result.proposalId?.toHexString(),
      reason: result.reason,
      status: result.status,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Re-extraction failed",
    };
  }
};

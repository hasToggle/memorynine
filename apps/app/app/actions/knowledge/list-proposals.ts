"use server";

import { auth } from "@repo/auth/server";
import { getCollections } from "@repo/knowledge";
import { getKnowledgeDb } from "@repo/knowledge/client";

export interface ProposalListItem {
  createdAt: Date;
  entityDraftCount: number;
  factDraftCount: number;
  id: string;
  kind: string;
  pendingCount: number;
  sourceType: string | null;
}

export const listOpenProposals = async (): Promise<ProposalListItem[]> => {
  const { orgId } = await auth();
  if (!orgId) {
    return [];
  }
  const { proposals, sources } = getCollections(getKnowledgeDb());

  const open = await proposals
    .find({ status: "open", tenantId: orgId })
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();

  const sourceIds = open.flatMap((proposal) =>
    proposal.sourceId ? [proposal.sourceId] : []
  );
  const sourceDocs = await sources
    .find({ _id: { $in: sourceIds }, tenantId: orgId })
    .toArray();
  const sourceTypeById = new Map(
    sourceDocs.map((source) => [source._id.toHexString(), source.type])
  );

  return open.map((proposal) => ({
    createdAt: proposal.createdAt,
    entityDraftCount: proposal.entityDrafts.length,
    factDraftCount: proposal.factDrafts.length,
    id: proposal._id.toHexString(),
    kind: proposal.kind,
    pendingCount:
      proposal.entityDrafts.filter(
        (draft) => draft.resolution.status === "pending"
      ).length +
      proposal.factDrafts.filter(
        (draft) => draft.resolution.status === "pending"
      ).length,
    sourceType: proposal.sourceId
      ? (sourceTypeById.get(proposal.sourceId.toHexString()) ?? null)
      : null,
  }));
};

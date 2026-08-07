"use server";

import { auth } from "@repo/auth/server";
import { getCollections, type Proposal } from "@repo/knowledge";
import { getKnowledgeDb } from "@repo/knowledge/client";
import type { Filter } from "mongodb";

export interface ProposalListItem {
  createdAt: Date;
  entityDraftCount: number;
  factDraftCount: number;
  id: string;
  kind: string;
  pendingCount: number;
  rejectedCount: number;
  skipReason: string | null;
  sourceType: string | null;
}

const listProposals = async (
  extraFilter: Filter<Proposal>
): Promise<ProposalListItem[]> => {
  const { orgId } = await auth();
  if (!orgId) {
    return [];
  }
  const { proposals, sources } = getCollections(getKnowledgeDb());

  const matched = await proposals
    .find({ status: "open", tenantId: orgId, ...extraFilter })
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();

  const sourceIds = matched.flatMap((proposal) =>
    proposal.sourceId ? [proposal.sourceId] : []
  );
  const sourceDocs = await sources
    .find({ _id: { $in: sourceIds }, tenantId: orgId })
    .toArray();
  const sourceTypeById = new Map(
    sourceDocs.map((source) => [source._id.toHexString(), source.type])
  );

  return matched.map((proposal) => ({
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
    rejectedCount: proposal.rejectedDrafts?.length ?? 0,
    skipReason: proposal.skipReason ?? null,
    sourceType: proposal.sourceId
      ? (sourceTypeById.get(proposal.sourceId.toHexString()) ?? null)
      : null,
  }));
};

export const listOpenProposals = async (): Promise<ProposalListItem[]> =>
  // skipReason is set only on proposals extraction judged empty (see
  // proposals.ts). Zod's .optional() never materialises an absent key as
  // stored `undefined`/`null`, and the driver connects with
  // `ignoreUndefined: true`, so this key is genuinely absent on every
  // ordinary proposal — $exists: false cannot hide one. Do not loosen this
  // to `{ $ne: null }` or similar; that would rely on a storage guarantee
  // this codebase does not make.
  listProposals({ skipReason: { $exists: false } });

export const listSkippedProposals = async (): Promise<ProposalListItem[]> =>
  listProposals({ skipReason: { $exists: true } });

/** The sidebar badge: open, reviewable proposals — no documents fetched. */
export const countOpenProposals = async (): Promise<number> => {
  const { orgId } = await auth();
  if (!orgId) {
    return 0;
  }
  const { proposals } = getCollections(getKnowledgeDb());
  return await proposals.countDocuments({
    skipReason: { $exists: false },
    status: "open",
    tenantId: orgId,
  });
};

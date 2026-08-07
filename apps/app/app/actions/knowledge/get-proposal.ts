"use server";

import { auth } from "@repo/auth/server";
import { getCollections, ObjectId } from "@repo/knowledge";
import { getKnowledgeDb } from "@repo/knowledge/client";

export interface ReviewEntityDraft {
  data: Record<string, unknown>;
  draftId: string;
  entityType: string;
  resolutionStatus: string;
}

export interface ReviewSupersededFact {
  id: string;
  text: string;
}

export interface ReviewFactDraft {
  /**
   * Sibling entity drafts this fact anchors, by draftId. Non-empty means the
   * fact cannot exist unless those drafts are confirmed — the dependency the
   * review form's cascade makes visible.
   */
  anchorDraftIds: string[];
  /** Human-readable target: a known entity name or a sibling draft ref. */
  anchorLabel: string;
  category: string;
  confidence: number;
  index: number;
  resolutionStatus: string;
  supersedes: ReviewSupersededFact[];
  text: string;
}

export interface ReviewRejectedDraft {
  /** Verbatim, unvalidated model output — shown as-is for a reviewer to judge. */
  raw: unknown;
  reason: string;
}

export interface ReviewProposal {
  createdAt: Date;
  entityDrafts: ReviewEntityDraft[];
  factDrafts: ReviewFactDraft[];
  id: string;
  kind: string;
  /** Drafts the model produced that failed validation — recorded, not silently dropped. */
  rejectedDrafts: ReviewRejectedDraft[];
  skipReason: string | null;
  source: { capturedBy: string; content: string; type: string } | null;
  status: string;
}

const HEX_ID_REGEX = /^[0-9a-f]{24}$/;

export const getProposal = async (
  proposalId: string
): Promise<ReviewProposal | null> => {
  const { orgId } = await auth();
  if (!(orgId && HEX_ID_REGEX.test(proposalId))) {
    return null;
  }
  const db = getKnowledgeDb();
  const { engagements, facts, organizations, people, proposals, sources } =
    getCollections(db);

  const proposal = await proposals.findOne({
    _id: new ObjectId(proposalId),
    tenantId: orgId,
  });
  if (!proposal) {
    return null;
  }

  const source = proposal.sourceId
    ? await sources.findOne({ _id: proposal.sourceId, tenantId: orgId })
    : null;

  // Resolve anchor ids to display names, and superseded ids to fact texts.
  const anchorIds = proposal.factDrafts.flatMap((draft) =>
    [
      draft.anchors.engagementId,
      draft.anchors.organizationId,
      draft.anchors.personId,
    ].flatMap((id) => (id ? [id] : []))
  );
  const supersededIds = proposal.factDrafts.flatMap(
    (draft) => draft.supersedes ?? []
  );
  const [orgDocs, personDocs, engagementDocs, supersededDocs] =
    await Promise.all([
      organizations
        .find({ _id: { $in: anchorIds }, tenantId: orgId })
        .toArray(),
      people.find({ _id: { $in: anchorIds }, tenantId: orgId }).toArray(),
      engagements.find({ _id: { $in: anchorIds }, tenantId: orgId }).toArray(),
      facts.find({ _id: { $in: supersededIds }, tenantId: orgId }).toArray(),
    ]);
  const nameById = new Map<string, string>([
    ...orgDocs.map((doc) => [doc._id.toHexString(), doc.name] as const),
    ...personDocs.map((doc) => [doc._id.toHexString(), doc.name] as const),
    ...engagementDocs.map((doc) => [doc._id.toHexString(), doc.title] as const),
  ]);
  const supersededById = new Map(
    supersededDocs.map((doc) => [doc._id.toHexString(), doc.text])
  );

  const anchorLabel = (draft: (typeof proposal.factDrafts)[number]): string => {
    const entityId =
      draft.anchors.personId ??
      draft.anchors.organizationId ??
      draft.anchors.engagementId;
    if (entityId) {
      return nameById.get(entityId.toHexString()) ?? "unknown entity";
    }
    const draftRef =
      draft.anchors.personDraftId ??
      draft.anchors.organizationDraftId ??
      draft.anchors.engagementDraftId;
    return draftRef ? `new: ${draftRef}` : "unanchored";
  };

  return {
    createdAt: proposal.createdAt,
    entityDrafts: proposal.entityDrafts.map((draft) => ({
      data: draft.data,
      draftId: draft.draftId,
      entityType: draft.entityType,
      resolutionStatus: draft.resolution.status,
    })),
    factDrafts: proposal.factDrafts.map((draft, index) => ({
      anchorDraftIds: [
        draft.anchors.personDraftId,
        draft.anchors.organizationDraftId,
        draft.anchors.engagementDraftId,
      ].flatMap((draftId) => (draftId ? [draftId] : [])),
      anchorLabel: anchorLabel(draft),
      category: draft.category,
      confidence: draft.confidence,
      index,
      resolutionStatus: draft.resolution.status,
      supersedes: (draft.supersedes ?? []).map((id) => ({
        id: id.toHexString(),
        text: supersededById.get(id.toHexString()) ?? "(fact no longer exists)",
      })),
      text: draft.text,
    })),
    id: proposal._id.toHexString(),
    kind: proposal.kind,
    rejectedDrafts: (proposal.rejectedDrafts ?? []).map((draft) => ({
      raw: draft.raw,
      reason: draft.reason,
    })),
    skipReason: proposal.skipReason ?? null,
    source: source
      ? {
          capturedBy: source.capturedBy,
          content: source.content ?? "",
          type: source.type,
        }
      : null,
    status: proposal.status,
  };
};

import type { Db, ObjectId } from "mongodb";
import { getCollections } from "./collections";
import type { DossierAnchor } from "./dossier";
import type { Fact, FactAnchors } from "./schemas/facts";
import { currentlyValidFilter } from "./schemas/facts";

// Anchor plumbing shared by every job that proposes facts under one anchor
// (consolidation, contradiction). Kept in one place so the two cannot drift:
// the union rule below is load-bearing for GDPR erasure, which finds facts by
// anchor.

export const anchorFilter = (anchor: DossierAnchor) => {
  switch (anchor.kind) {
    case "engagement":
      return { "anchors.engagementId": anchor.id };
    case "organization":
      return { "anchors.organizationId": anchor.id };
    default:
      return { "anchors.personId": anchor.id };
  }
};

export const anchorDraftField = (anchor: DossierAnchor) => {
  switch (anchor.kind) {
    case "engagement":
      return { engagementId: anchor.id };
    case "organization":
      return { organizationId: anchor.id };
    default:
      return { personId: anchor.id };
  }
};

export const anchorNameFor = async (
  collections: ReturnType<typeof getCollections>,
  tenantId: string,
  anchor: DossierAnchor
): Promise<string> => {
  if (anchor.kind === "organization") {
    const doc = await collections.organizations.findOne({
      _id: anchor.id,
      tenantId,
    });
    return doc?.name ?? "unknown";
  }
  if (anchor.kind === "person") {
    const doc = await collections.people.findOne({ _id: anchor.id, tenantId });
    return doc?.name ?? "unknown";
  }
  const doc = await collections.engagements.findOne({
    _id: anchor.id,
    tenantId,
  });
  return doc?.title ?? "unknown";
};

export interface CandidateAnchor {
  anchor: DossierAnchor;
  tenantId: string;
}

const ANCHOR_FIELDS = [
  { field: "anchors.engagementId", kind: "engagement" },
  { field: "anchors.organizationId", kind: "organization" },
  { field: "anchors.personId", kind: "person" },
] as const;

/**
 * Anchors worth running a nightly job against: any entity with at least
 * `minFacts` currently valid facts, across every tenant and anchor kind.
 * Shared by the consolidation and contradiction sweeps, which differ in what
 * they ask the model, not in how they pick candidates.
 */
export const findCandidateAnchors = async (
  db: Db,
  { limit, minFacts }: { limit: number; minFacts: number }
): Promise<CandidateAnchor[]> => {
  const { facts } = getCollections(db);
  const candidates: CandidateAnchor[] = [];

  for (const { field, kind } of ANCHOR_FIELDS) {
    // biome-ignore lint/performance/noAwaitInLoops: three sequential aggregations over an indexed field; parallelism buys nothing here
    const groups = await facts
      .aggregate<{ _id: { anchorId: ObjectId; tenantId: string } }>([
        { $match: { [field]: { $exists: true }, ...currentlyValidFilter } },
        {
          $group: {
            _id: { anchorId: `$${field}`, tenantId: "$tenantId" },
            count: { $sum: 1 },
          },
        },
        { $match: { count: { $gte: minFacts } } },
        { $limit: limit },
      ])
      .toArray();
    for (const group of groups) {
      candidates.push({
        anchor: { id: group._id.anchorId, kind },
        tenantId: group._id.tenantId,
      });
    }
  }
  return candidates.slice(0, limit);
};

/**
 * A proposed fact inherits every anchor its parents carried, not only the
 * anchor the job ran on. Narrowing to the run anchor drops the result out of
 * the other entities' dossiers — and out of an anchor-scoped GDPR erasure,
 * which is how a person's name survives inside an org-anchored merge.
 *
 * Parents that disagree are a genuine ambiguity: factAnchorsSchema has one
 * slot per kind, so a result spanning two people cannot be represented.
 * Reject rather than silently keeping one.
 */
export const unionAnchors = (
  anchor: DossierAnchor,
  parents: Fact[]
): { anchors: FactAnchors } | { conflict: string } => {
  const union: Record<string, ObjectId> = {};
  for (const [key, value] of Object.entries(anchorDraftField(anchor))) {
    if (value) {
      union[key] = value;
    }
  }
  for (const parent of parents) {
    for (const [key, value] of Object.entries(parent.anchors)) {
      if (!value) {
        continue;
      }
      const existing = union[key];
      if (existing && !existing.equals(value)) {
        return {
          conflict: `parents disagree on ${key} (${existing.toHexString()} vs ${value.toHexString()})`,
        };
      }
      union[key] = value;
    }
  }
  return { anchors: union as FactAnchors };
};

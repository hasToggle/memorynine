"use server";

import { auth } from "@repo/auth/server";
import {
  type Brief,
  buildBrief,
  currentlyValidFilter,
  type DossierAnchor,
  type Fact,
  findContestedFactIds,
  getCollections,
  type ObjectId,
  PREVIEW_LENGTH,
  type ReceiptSource,
} from "@repo/knowledge";
import { getKnowledgeDb } from "@repo/knowledge/client";

// What the Ask surface shows before anyone types. The dossiers collection is
// the index here, not the content: it already tracks factCount and updatedAt
// per anchor and is refreshed on every change, so it answers "whom is it worth
// briefing, freshest first" in one query. The lines then come from the facts,
// which is where the ids a receipt needs still exist.

const BRIEF_TARGET_LIMIT = 6;
/** Unreviewed sources considered per tenant before buildBrief caps per anchor. */
const RAW_SOURCE_SCAN = 20;

/** Which anchor field on a fact corresponds to each dossier anchor kind. */
const ANCHOR_ID: Record<
  DossierAnchor["kind"],
  (fact: Fact) => ObjectId | undefined
> = {
  engagement: (fact) => fact.anchors.engagementId,
  organization: (fact) => fact.anchors.organizationId,
  person: (fact) => fact.anchors.personId,
};

export const listBriefs = async (): Promise<Brief[]> => {
  const { orgId } = await auth();
  if (!orgId) {
    return [];
  }
  const db = getKnowledgeDb();
  const { dossiers, engagements, facts, organizations, people, sources } =
    getCollections(db);

  const targets = await dossiers
    .find({ tenantId: orgId })
    .sort({ updatedAt: -1 })
    .limit(BRIEF_TARGET_LIMIT)
    .toArray();
  if (targets.length === 0) {
    return [];
  }

  // Three queries for all six anchors, not three per anchor: a per-target loop
  // here is an eighteen-round-trip page load.
  const anchorIds = targets.map((target) => target.anchor.id);
  const [factDocs, orgDocs, personDocs, engagementDocs, rawSources] =
    await Promise.all([
      facts
        .find({
          tenantId: orgId,
          ...currentlyValidFilter,
          $or: [
            { "anchors.organizationId": { $in: anchorIds } },
            { "anchors.personId": { $in: anchorIds } },
            { "anchors.engagementId": { $in: anchorIds } },
          ],
        })
        .toArray(),
      organizations
        .find({ _id: { $in: anchorIds }, tenantId: orgId })
        .toArray(),
      people.find({ _id: { $in: anchorIds }, tenantId: orgId }).toArray(),
      engagements.find({ _id: { $in: anchorIds }, tenantId: orgId }).toArray(),
      // Only the fields ReceiptSource needs, and only PREVIEW_LENGTH characters
      // of content — never the full attachments/audio/content of up to 20 raw
      // documents, of which buildBrief keeps at most BRIEF_SOURCE_LIMIT (2).
      // The excerpt is truncated in the database, the same budget the receipt
      // itself uses, so a 40KB forwarded email can never reach the client as a
      // brief line.
      sources
        .aggregate<ReceiptSource>([
          { $match: { status: { $ne: "reviewed" }, tenantId: orgId } },
          { $sort: { createdAt: -1 } },
          { $limit: RAW_SOURCE_SCAN },
          {
            $project: {
              capturedBy: 1,
              createdAt: 1,
              "email.subject": 1,
              excerpt: { $substrCP: ["$content", 0, PREVIEW_LENGTH] },
              occurredAt: 1,
              status: 1,
              type: 1,
            },
          },
        ])
        .toArray(),
    ]);

  const contested = await findContestedFactIds(
    db,
    orgId,
    factDocs.map((fact) => fact._id)
  );

  const nameById = new Map<string, string>();
  for (const doc of orgDocs) {
    nameById.set(doc._id.toHexString(), doc.name);
  }
  for (const doc of personDocs) {
    nameById.set(doc._id.toHexString(), doc.name);
  }
  for (const doc of engagementDocs) {
    nameById.set(doc._id.toHexString(), doc.title);
  }

  const now = new Date();
  return targets
    .map((target, index) => {
      const anchorHex = target.anchor.id.toHexString();
      const anchorIdOf = ANCHOR_ID[target.anchor.kind];
      return buildBrief({
        anchor: {
          id: anchorHex,
          kind: target.anchor.kind,
          name: nameById.get(anchorHex) ?? "Unknown",
        },
        contestedIds: contested,
        facts: factDocs.filter(
          (fact) => anchorIdOf(fact)?.equals(target.anchor.id) ?? false
        ),
        now,
        // Raw material is not anchored to an entity until review, so it cannot
        // be attributed to one brief. It rides along with the freshest anchor
        // only (index 0, since targets is sorted by updatedAt desc), where
        // "something new landed" is the useful signal.
        sources: index === 0 ? rawSources : [],
      });
    })
    .filter((brief) => brief.lines.length > 0);
};

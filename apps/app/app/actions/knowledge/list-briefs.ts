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
/** Unfiled sources considered per tenant before buildBrief caps the group. */
const RAW_SOURCE_SCAN = 20;

/**
 * The statuses at which a source actually has wording to show. `received`,
 * `transcribing` and `failed` are excluded because their `content` is absent
 * or empty, and a brief line with no text is a chip with nothing to read
 * beside it. Matching on the list rather than on `{ $ne: "reviewed" }` also
 * lets the `{tenantId, status, createdAt}` index serve the scan: `$ne` on the
 * middle key cannot use it and forces a blocking sort over the tenant's whole
 * unreviewed backlog on every page load.
 */
const READABLE_SOURCE_STATUSES = ["transcribed", "extracting", "proposed"];

/** Which anchor field on a fact corresponds to each dossier anchor kind. */
const ANCHOR_ID: Record<
  DossierAnchor["kind"],
  (fact: Fact) => ObjectId | undefined
> = {
  engagement: (fact) => fact.anchors.engagementId,
  organization: (fact) => fact.anchors.organizationId,
  person: (fact) => fact.anchors.personId,
};

/**
 * Dossier documents are not schema-validated on read, so `anchor.kind` may be
 * something this build has never heard of. Widened on purpose: an unknown kind
 * has to skip its anchor, not throw a TypeError out of a Promise.all that also
 * carries Capture, Review and People.
 */
const anchorAccessor = (
  kind: string
): ((fact: Fact) => ObjectId | undefined) | undefined =>
  (
    ANCHOR_ID as Record<
      string,
      ((fact: Fact) => ObjectId | undefined) | undefined
    >
  )[kind];

const readBriefs = async (): Promise<Brief[]> => {
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
      // Only the fields ReceiptSource needs, and only a preview of the
      // content — never the full attachments/audio/content of up to 20 raw
      // documents, of which buildBrief keeps at most BRIEF_SOURCE_LIMIT (2),
      // so a 40KB forwarded email can never reach the client as a brief line.
      // One character past PREVIEW_LENGTH so buildBrief's truncatePreview can
      // tell "cut here" from "ends here" and mark the cut exactly the way the
      // receipt opened from the line will.
      sources
        .aggregate<ReceiptSource>([
          {
            $match: {
              status: { $in: READABLE_SOURCE_STATUSES },
              tenantId: orgId,
            },
          },
          { $sort: { createdAt: -1 } },
          { $limit: RAW_SOURCE_SCAN },
          {
            $project: {
              capturedBy: 1,
              createdAt: 1,
              "email.subject": 1,
              excerpt: { $substrCP: ["$content", 0, PREVIEW_LENGTH + 1] },
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
  const briefs: Brief[] = [];
  // Unfiled material is not anchored to an entity until review, so it belongs
  // to no anchor at all — targets is sorted by updatedAt, which is the *review*
  // clock, so position here says nothing about where newly captured material
  // came from. It is carried once, on the first card, and the pane renders it
  // under its own heading that says it is filed against nobody.
  let unfiledCarried = false;

  for (const target of targets) {
    const anchorIdOf = anchorAccessor(target.anchor.kind);
    if (!anchorIdOf) {
      console.warn(
        `listBriefs: skipping dossier ${target._id.toHexString()} — unrecognised anchor kind`
      );
      continue;
    }
    const anchorHex = target.anchor.id.toHexString();
    const brief = buildBrief({
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
      sources: unfiledCarried ? [] : rawSources,
    });
    unfiledCarried = true;
    if (brief.lines.length > 0) {
      briefs.push(brief);
    }
  }
  return briefs;
};

/**
 * The brief pane is the most optional thing on the Brain page, and it shares a
 * Promise.all with Capture, Review and People. A rejection here would blank all
 * four — there is no error boundary between them — so an unexpected failure
 * degrades to "nothing to brief you on" and leaves a warning behind instead.
 */
export const listBriefs = async (): Promise<Brief[]> => {
  try {
    return await readBriefs();
  } catch (error) {
    console.warn(
      `listBriefs: returning no briefs: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return [];
  }
};

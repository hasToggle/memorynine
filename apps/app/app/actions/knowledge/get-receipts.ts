"use server";

import { auth, listOrganizationMembers } from "@repo/auth/server";
import {
  composeReceipt,
  findContestedFactIds,
  getCollections,
  ObjectId,
  type Receipt,
  type ReceiptSource,
} from "@repo/knowledge";
import { getKnowledgeDb } from "@repo/knowledge/client";
import { buildNameResolver } from "@/lib/member-names";

// Receipts travel out of band rather than inside the tool payload. A source
// excerpt is up to SOURCE_EXCERPT_LENGTH (1500) characters; attaching one to
// each of twenty retrieved facts would push ~30KB of provenance through the
// model's context describing things it must never narrate. The model cites;
// this explains.

/** Ignore anything that is not a real ObjectId rather than throwing on it. */
const toObjectIds = (ids: string[]): ObjectId[] =>
  ids.flatMap((id) => (ObjectId.isValid(id) ? [new ObjectId(id)] : []));

export const getReceipts = async ({
  factIds,
  sourceIds,
}: {
  factIds: string[];
  sourceIds: string[];
}): Promise<Receipt[]> => {
  const { orgId } = await auth();
  if (!orgId) {
    return [];
  }

  const wantedFacts = toObjectIds(factIds);
  const wantedSources = toObjectIds(sourceIds);
  if (wantedFacts.length === 0 && wantedSources.length === 0) {
    return [];
  }

  const { facts, sources } = getCollections(getKnowledgeDb());

  // tenantId is on every filter: an id from another organization must return
  // nothing, not a receipt.
  const factDocs = await facts
    .find({ _id: { $in: wantedFacts }, tenantId: orgId })
    .toArray();

  // A fact's own provenance source is loaded alongside the directly cited ones.
  const provenanceIds = factDocs.flatMap((fact) =>
    fact.sourceId ? [fact.sourceId] : []
  );

  const [sourceDocs, contested, members] = await Promise.all([
    sources
      .find({
        _id: { $in: [...wantedSources, ...provenanceIds] },
        tenantId: orgId,
      })
      .toArray(),
    findContestedFactIds(getKnowledgeDb(), orgId, wantedFacts),
    listOrganizationMembers(orgId),
  ]);

  const sourceById = new Map(
    sourceDocs.map((source) => [
      source._id.toHexString(),
      source as ReceiptSource,
    ])
  );
  const nameOf = buildNameResolver(members);
  const now = new Date();

  const factReceipts = factDocs.map((fact) =>
    composeReceipt({
      contested: contested.has(fact._id.toHexString()),
      fact,
      nameOf,
      now,
      source: fact.sourceId
        ? sourceById.get(fact.sourceId.toHexString())
        : undefined,
    })
  );

  const sourceReceipts = wantedSources.flatMap((id) => {
    const source = sourceById.get(id.toHexString());
    return source
      ? [composeReceipt({ contested: false, nameOf, now, source })]
      : [];
  });

  return [...factReceipts, ...sourceReceipts];
};

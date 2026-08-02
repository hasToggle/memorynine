"use server";

import { auth } from "@repo/auth/server";
import { currentlyValidFilter, getCollections } from "@repo/knowledge";
import { getKnowledgeDb } from "@repo/knowledge/client";

export interface PersonListItem {
  emails: string[];
  factCount: number;
  id: string;
  name: string;
  organizationName: string | null;
  role: string | null;
}

export const listPeople = async (): Promise<PersonListItem[]> => {
  const { orgId } = await auth();
  if (!orgId) {
    return [];
  }
  const { facts, organizations, people } = getCollections(getKnowledgeDb());

  const [personDocs, orgDocs, counts] = await Promise.all([
    people.find({ tenantId: orgId }).sort({ name: 1 }).limit(500).toArray(),
    organizations.find({ tenantId: orgId }).toArray(),
    facts
      .aggregate<{ _id: unknown; count: number }>([
        {
          $match: {
            "anchors.personId": { $exists: true },
            tenantId: orgId,
            ...currentlyValidFilter,
          },
        },
        { $group: { _id: "$anchors.personId", count: { $sum: 1 } } },
      ])
      .toArray(),
  ]);

  const orgNameById = new Map(
    orgDocs.map((doc) => [doc._id.toHexString(), doc.name])
  );
  const countByPerson = new Map(
    counts.map((entry) => [String(entry._id), entry.count])
  );

  return personDocs.map((doc) => ({
    emails: doc.emails,
    factCount: countByPerson.get(doc._id.toHexString()) ?? 0,
    id: doc._id.toHexString(),
    name: doc.name,
    organizationName: doc.organizationId
      ? (orgNameById.get(doc.organizationId.toHexString()) ?? null)
      : null,
    role: doc.role ?? null,
  }));
};

"use server";

import { auth } from "@repo/auth/server";
import { getCollections } from "@repo/knowledge";
import { getKnowledgeDb } from "@repo/knowledge/client";

export interface SourceListItem {
  createdAt: Date;
  error: string | null;
  id: string;
  preview: string | null;
  status: string;
  type: string;
}

/** The tenant's most recent sources, for the capture page's pipeline view. */
export const listRecentSources = async (): Promise<SourceListItem[]> => {
  const { orgId } = await auth();
  if (!orgId) {
    return [];
  }
  const { sources } = getCollections(getKnowledgeDb());
  const docs = await sources
    .find({ tenantId: orgId })
    .sort({ createdAt: -1 })
    .limit(10)
    .toArray();

  return docs.map((doc) => ({
    createdAt: doc.createdAt,
    error: doc.error ?? null,
    id: doc._id.toHexString(),
    preview: doc.content ? doc.content.slice(0, 120) : null,
    status: doc.status,
    type: doc.type,
  }));
};

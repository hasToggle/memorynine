"use server";

import { auth } from "@repo/auth/server";
import {
  erasePerson,
  listBlobCleanupCandidates,
  markSourceBlobsDeleted,
  ObjectId,
} from "@repo/knowledge";
import { getKnowledgeDb } from "@repo/knowledge/client";
import { del } from "@repo/storage";
import { revalidatePath } from "next/cache";

// GDPR Art. 17: the whole cascade in one action — facts deleted, drafts
// discarded, identifiers redacted from sources and proposals, dossier cache
// dropped, and orphaned audio/attachment blobs removed from storage. The
// cron sweep re-runs the blob half if this crashes between report and
// delete (blobsPendingDeletion stays set until markSourceBlobsDeleted).

export interface ErasePersonActionResult {
  blobsDeleted: number;
  /** Consolidated facts removed because a parent fact was erased. */
  derivedFactsDeleted: number;
  error?: string;
  factsDeleted: number;
  /** Facts anchored elsewhere whose text still named the person. */
  factsRedacted: number;
  personDeleted: boolean;
  proposalsRedacted: number;
  sourcesRedacted: number;
}

const HEX_ID_REGEX = /^[0-9a-f]{24}$/;

export const erasePersonAction = async (
  personId: string
): Promise<ErasePersonActionResult> => {
  const { orgId } = await auth();
  const failed = (error: string): ErasePersonActionResult => ({
    blobsDeleted: 0,
    derivedFactsDeleted: 0,
    error,
    factsDeleted: 0,
    factsRedacted: 0,
    personDeleted: false,
    proposalsRedacted: 0,
    sourcesRedacted: 0,
  });
  if (!orgId) {
    return failed("Not signed in to an organization");
  }
  if (!HEX_ID_REGEX.test(personId)) {
    return failed("Invalid person id");
  }

  const db = getKnowledgeDb();
  const report = await erasePerson(db, orgId, new ObjectId(personId));

  // Complete the blob half for this tenant's flagged sources. del() is
  // idempotent, so re-running after a partial failure is safe.
  let blobsDeleted = 0;
  const candidates = (await listBlobCleanupCandidates(db)).filter(
    (candidate) => candidate.tenantId === orgId
  );
  for (const candidate of candidates) {
    if (candidate.blobUrls.length > 0) {
      // biome-ignore lint/performance/noAwaitInLoops: sequential keeps delete-then-mark ordering per source
      await del(candidate.blobUrls);
      blobsDeleted += candidate.blobUrls.length;
    }
    await markSourceBlobsDeleted(db, orgId, candidate.sourceId);
  }

  revalidatePath("/people");
  revalidatePath("/review");
  return {
    blobsDeleted,
    derivedFactsDeleted: report.derivedFactsDeleted,
    factsDeleted: report.factsDeleted,
    factsRedacted: report.factsRedacted,
    personDeleted: report.personDeleted,
    proposalsRedacted: report.proposalsRedacted,
    sourcesRedacted: report.sourcesRedacted,
  };
};

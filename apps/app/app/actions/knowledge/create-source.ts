"use server";

import { auth, currentUser } from "@repo/auth/server";
import { getCollections, ObjectId } from "@repo/knowledge";
import { getKnowledgeDb } from "@repo/knowledge/client";
import { revalidatePath } from "next/cache";
import { normalizeAudioContentType } from "@/lib/capture";

// Capture endpoints: create a source and let the cron sweep do the rest.
// A voice source starts at "received" with only the private blob URL; the
// pipeline transcribes and extracts it. A manual note already has content,
// so it goes straight to extraction on the next sweep.

export interface CreateSourceResult {
  error?: string;
  sourceId?: string;
}

const PRIVATE_BLOB_HOST_REGEX =
  /^[a-z0-9]+\.(?:private\.)?blob\.vercel-storage\.com$/;

const capturer = async (): Promise<string> => {
  const user = await currentUser();
  if (!user) {
    return "unknown";
  }
  return user.emailAddresses.at(0)?.emailAddress ?? user.id;
};

export const createVoiceSource = async (
  blobUrl: string,
  contentType: string
): Promise<CreateSourceResult> => {
  const { orgId } = await auth();
  if (!orgId) {
    return { error: "Not signed in to an organization" };
  }
  const normalized = normalizeAudioContentType(contentType);
  if (!normalized) {
    return { error: `Not an audio content type: ${contentType}` };
  }
  let host = "";
  try {
    host = new URL(blobUrl).hostname;
  } catch {
    return { error: "Invalid blob URL" };
  }
  if (!PRIVATE_BLOB_HOST_REGEX.test(host)) {
    return { error: "URL is not a Vercel Blob URL" };
  }

  const { sources } = getCollections(getKnowledgeDb());
  const sourceId = new ObjectId();
  await sources.insertOne({
    _id: sourceId,
    audio: { blobUrl, contentType: normalized },
    capturedBy: await capturer(),
    createdAt: new Date(),
    status: "received",
    tenantId: orgId,
    type: "voice",
    updatedAt: new Date(),
  });
  revalidatePath("/capture");
  return { sourceId: sourceId.toHexString() };
};

export const createManualSource = async (
  text: string
): Promise<CreateSourceResult> => {
  const { orgId } = await auth();
  if (!orgId) {
    return { error: "Not signed in to an organization" };
  }
  const content = text.trim();
  if (content.length === 0) {
    return { error: "The note is empty" };
  }

  const { sources } = getCollections(getKnowledgeDb());
  const sourceId = new ObjectId();
  await sources.insertOne({
    _id: sourceId,
    capturedBy: await capturer(),
    content,
    createdAt: new Date(),
    status: "received",
    tenantId: orgId,
    type: "manual",
    updatedAt: new Date(),
  });
  revalidatePath("/capture");
  return { sourceId: sourceId.toHexString() };
};

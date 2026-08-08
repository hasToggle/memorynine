"use server";

import { database, ObjectId } from "@repo/database";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function getPublishedDigests() {
  const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS);

  const digests = await database.digest
    .find({
      sentAt: { $lte: sevenDaysAgo },
      status: "sent",
    })
    .sort({ sentAt: -1 })
    .toArray();

  return digests.map((d) => ({
    id: d._id.toString(),
    misconception: d.misconception,
    sentAt: d.sentAt,
    series: d.series,
    title: d.title,
  }));
}

export async function getDigestById(id: string) {
  const digest = await database.digest.findOne({
    _id: new ObjectId(id),
  });

  if (!digest) {
    return null;
  }

  const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS);
  if (!digest.sentAt || digest.sentAt > sevenDaysAgo) {
    return null;
  }

  return {
    content: digest.content,
    id: digest._id.toString(),
    misconception: digest.misconception,
    sentAt: digest.sentAt,
    series: digest.series,
    title: digest.title,
  };
}

import type { Db, ObjectId } from "mongodb";
import { getCollections } from "./collections";
import { truncatePreview } from "./receipt";
import { currentlyValidFilter } from "./schemas/facts";

// The initiative loop, increment ① (spec §5): the morning brief. Everything
// here is deterministic — outbound mail quotes captured material, and captured
// material is untrusted input, so composition stays a pure function instead of
// an LLM call. Side effects (mail, clock) are injected the way process-source
// injects generate/transcribe.

export const COLD_AFTER_DAYS = 28;
export const GOING_COLD_LIMIT = 3;
export const CAPTURE_PREVIEW_LIMIT = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface MorningBriefData {
  captures: {
    count: number;
    latest: { excerpt: string | null; type: string; when: Date }[];
    newFactCount: number;
  };
  goingCold: { lastActivity: Date; name: string; personId: ObjectId }[];
  reviewQueue: {
    contradictionCount: number;
    count: number;
    oldestCreatedAt: Date | null;
  };
}

export const gatherMorningBriefData = async (
  db: Db,
  tenantId: string,
  now: Date
): Promise<MorningBriefData> => {
  const { facts, people, proposals, sources } = getCollections(db);
  const since = new Date(now.getTime() - DAY_MS);
  const coldBefore = new Date(now.getTime() - COLD_AFTER_DAYS * DAY_MS);

  const inWindow = { createdAt: { $gte: since }, tenantId };
  const reviewable = {
    skipReason: { $exists: false },
    status: "open" as const,
    tenantId,
  };

  const [captureCount, latestSources, newFactCount] = await Promise.all([
    sources.countDocuments(inWindow),
    sources
      .find(inWindow, {
        projection: { content: 1, createdAt: 1, type: 1 },
        sort: { createdAt: -1 },
      })
      .limit(CAPTURE_PREVIEW_LIMIT)
      .toArray(),
    facts.countDocuments(inWindow),
  ]);

  const [reviewCount, contradictionCount, oldestOpen] = await Promise.all([
    proposals.countDocuments(reviewable),
    proposals.countDocuments({ ...reviewable, kind: "contradiction" }),
    proposals.findOne(reviewable, {
      projection: { createdAt: 1 },
      sort: { createdAt: 1 },
    }),
  ]);

  // Latest currently-valid fact activity per person. Sources carry no entity
  // anchors, so facts are the only recency signal — which means an unreviewed
  // backlog reads as coldness until trust tiers land (spec §5, known limit).
  const coldRows = (await facts
    .aggregate([
      {
        $match: {
          "anchors.personId": { $exists: true },
          ...currentlyValidFilter,
          tenantId,
        },
      },
      {
        $group: {
          _id: "$anchors.personId",
          lastActivity: { $max: { $ifNull: ["$validFrom", "$createdAt"] } },
        },
      },
      { $match: { lastActivity: { $lte: coldBefore } } },
      { $sort: { lastActivity: 1 } },
      { $limit: GOING_COLD_LIMIT },
    ])
    .toArray()) as { _id: ObjectId; lastActivity: Date }[];

  const coldPeople = await people
    .find(
      { _id: { $in: coldRows.map((row) => row._id) }, tenantId },
      { projection: { name: 1 } }
    )
    .toArray();
  const nameOf = new Map(
    coldPeople.map((person) => [person._id.toHexString(), person.name])
  );

  return {
    captures: {
      count: captureCount,
      latest: latestSources.map((source) => ({
        excerpt: source.content ? truncatePreview(source.content) : null,
        type: source.type,
        when: source.createdAt,
      })),
      newFactCount,
    },
    goingCold: coldRows.flatMap((row) => {
      const name = nameOf.get(row._id.toHexString());
      return name
        ? [{ lastActivity: row.lastActivity, name, personId: row._id }]
        : [];
    }),
    reviewQueue: {
      contradictionCount,
      count: reviewCount,
      oldestCreatedAt: oldestOpen?.createdAt ?? null,
    },
  };
};

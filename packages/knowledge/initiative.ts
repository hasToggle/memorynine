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

export interface MorningBriefEmail {
  html: string;
  subject: string;
  text: string;
}

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const plural = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

const daysAgo = (from: Date, now: Date): number =>
  Math.max(0, Math.floor((now.getTime() - from.getTime()) / DAY_MS));

const typeLabels: Record<string, string> = {
  email: "Forwarded email",
  manual: "Note",
  voice: "Voice memo",
};

export const composeMorningBrief = (
  data: MorningBriefData,
  { appOrigin, now }: { appOrigin: string; now: Date }
): MorningBriefEmail | null => {
  const { captures, goingCold, reviewQueue } = data;

  // The attention budget (spec §5): silence is a feature. Going-quiet alone
  // would fire daily forever about the same cold trio, so it only rides along
  // when something actually happened.
  const hasNews =
    captures.count > 0 || captures.newFactCount > 0 || reviewQueue.count > 0;
  if (!hasNews) {
    return null;
  }

  const subjectParts: string[] = [];
  if (captures.count > 0) {
    subjectParts.push(`${plural(captures.count, "new capture")}`);
  }
  if (reviewQueue.count > 0) {
    subjectParts.push(`${reviewQueue.count} waiting for review`);
  }
  if (subjectParts.length === 0) {
    subjectParts.push(`${plural(captures.newFactCount, "new fact")}`);
  }
  const subject = `Morning brief: ${subjectParts.join(" · ")}`;

  const textLines: string[] = [];
  const htmlBlocks: string[] = [];

  if (captures.count > 0 || captures.newFactCount > 0) {
    textLines.push("Captured in the last 24 hours");
    textLines.push(
      `${plural(captures.count, "capture")}, ${plural(captures.newFactCount, "new confirmed fact")}.`
    );
    const captureItems = captures.latest.map((capture) => {
      const label = typeLabels[capture.type] ?? capture.type;
      return capture.excerpt ? `${label}: "${capture.excerpt}"` : label;
    });
    textLines.push(...captureItems.map((item) => `- ${item}`), "");
    htmlBlocks.push(
      `<h2>Captured in the last 24 hours</h2><p>${plural(captures.count, "capture")}, ${plural(captures.newFactCount, "new confirmed fact")}.</p><ul>${captureItems
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join("")}</ul>`
    );
  }

  if (reviewQueue.count > 0) {
    const oldest = reviewQueue.oldestCreatedAt
      ? `, oldest ${plural(daysAgo(reviewQueue.oldestCreatedAt, now), "day")} old`
      : "";
    const contradictions =
      reviewQueue.contradictionCount > 0
        ? ` ${plural(reviewQueue.contradictionCount, "contradiction")} await${reviewQueue.contradictionCount === 1 ? "s" : ""} resolution.`
        : "";
    const line = `${plural(reviewQueue.count, "item")} waiting${oldest}.${contradictions}`;
    textLines.push("Waiting for you", line, `${appOrigin}/review`, "");
    htmlBlocks.push(
      `<h2>Waiting for you</h2><p>${escapeHtml(line)} <a href="${appOrigin}/review">Open the review queue</a></p>`
    );
  }

  if (goingCold.length > 0) {
    textLines.push("Going quiet");
    const coldItems = goingCold.map(
      (person) =>
        `${person.name} — ${plural(daysAgo(person.lastActivity, now), "day")} since the last confirmed activity`
    );
    textLines.push(...coldItems.map((item) => `- ${item}`), "");
    htmlBlocks.push(
      `<h2>Going quiet</h2><ul>${coldItems
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join("")}</ul>`
    );
  }

  textLines.push(`Open memorynine: ${appOrigin}/`);
  htmlBlocks.push(
    `<p><a href="${appOrigin}/">Open memorynine</a></p><p style="color:#6b7280;font-size:12px">You receive this because morning briefs are enabled for your workspace.</p>`
  );

  return {
    html: htmlBlocks.join(""),
    subject,
    text: textLines.join("\n"),
  };
};

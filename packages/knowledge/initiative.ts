import type { Db, ObjectId } from "mongodb";
import { MongoServerError } from "mongodb";
import { getCollections } from "./collections";
import { deterministicId } from "./idempotency";
import { truncatePreview } from "./receipt";
import { currentlyValidFilter } from "./schemas/facts";
import type { DeliveryOutcome } from "./schemas/initiative";

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

export type SendMorningBrief = (email: {
  html: string;
  subject: string;
  text: string;
  to: string[];
}) => Promise<void>;

export interface MorningBriefSweepReport {
  alreadyDelivered: number;
  failed: number;
  failures: string[];
  noNews: number;
  sent: number;
}

// Claim-then-send: inserting the deterministic delivery row IS the day's lock.
// A crash between claim and send costs that tenant one brief; the alternative
// (send-then-record) risks a double send on retry, which is worse for a
// product whose whole pitch is respecting attention (spec §5).
const claimDelivery = async (
  db: Db,
  tenantId: string,
  date: string,
  now: Date
): Promise<boolean> => {
  const { initiativeDeliveries } = getCollections(db);
  try {
    await initiativeDeliveries.insertOne({
      _id: deterministicId(`morning-brief:${tenantId}:${date}`),
      createdAt: now,
      date,
      outcome: "claimed",
      recipients: [],
      tenantId,
      updatedAt: now,
    });
    return true;
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11_000) {
      return false;
    }
    throw error;
  }
};

const recordOutcome = async (
  db: Db,
  tenantId: string,
  date: string,
  now: Date,
  outcome: DeliveryOutcome,
  extra: { error?: string; recipients?: string[] } = {}
): Promise<void> => {
  const { initiativeDeliveries } = getCollections(db);
  await initiativeDeliveries.updateOne(
    { _id: deterministicId(`morning-brief:${tenantId}:${date}`) },
    { $set: { ...extra, outcome, updatedAt: now } }
  );
};

export const runMorningBriefSweep = async (
  db: Db,
  {
    appOrigin,
    now,
    send,
  }: { appOrigin: string; now: Date; send: SendMorningBrief }
): Promise<MorningBriefSweepReport> => {
  const { initiativeSettings } = getCollections(db);
  const date = now.toISOString().slice(0, 10);
  const report: MorningBriefSweepReport = {
    alreadyDelivered: 0,
    failed: 0,
    failures: [],
    noNews: 0,
    sent: 0,
  };

  const enabled = await initiativeSettings.find({ enabled: true }).toArray();
  for (const settings of enabled) {
    const { recipients, tenantId } = settings;
    // Sequential on purpose: tenant counts are small, and one slow tenant
    // holding a connection beats a burst of parallel aggregation load at
    // 05:00 UTC.
    // biome-ignore lint/performance/noAwaitInLoops: Intentional sequential processing
    if (!(await claimDelivery(db, tenantId, date, now))) {
      report.alreadyDelivered += 1;
      continue;
    }
    try {
      const data = await gatherMorningBriefData(db, tenantId, now);
      const email = composeMorningBrief(data, { appOrigin, now });
      if (!email) {
        report.noNews += 1;
        // The claim row guarantees at-most-once delivery. A bookkeeping failure
        // must not reclassify the outcome or abort the sweep for other tenants.
        try {
          await recordOutcome(db, tenantId, date, now, "no-news");
        } catch (error) {
          console.error(
            `Failed to record no-news outcome for ${tenantId}:`,
            error
          );
        }
        continue;
      }
      await send({ ...email, to: recipients });
      report.sent += 1;
      // The mail is out and the claim doc already guarantees at-most-once; a
      // bookkeeping failure must not reclassify a delivered brief as failed.
      try {
        await recordOutcome(db, tenantId, date, now, "sent", { recipients });
      } catch (error) {
        console.error(`Failed to record sent outcome for ${tenantId}:`, error);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      report.failed += 1;
      report.failures.push(`${tenantId}: ${message}`);
      // The failure is already in the report; a second write failure must not
      // abort the sweep for the remaining tenants.
      try {
        await recordOutcome(db, tenantId, date, now, "failed", {
          error: message,
        });
      } catch (recordError) {
        console.error(
          `Failed to record failed outcome for ${tenantId}:`,
          recordError
        );
      }
    }
  }
  return report;
};

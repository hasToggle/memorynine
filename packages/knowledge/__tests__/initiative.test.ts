import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { MongoClient, ObjectId } from "mongodb";
import {
  deliveryOutcomeValues,
  initiativeDeliverySchema,
  initiativeSettingsSchema,
} from "../schemas/initiative";
import { getCollections } from "../collections";
import { gatherMorningBriefData } from "../initiative";

const now = () => ({ createdAt: new Date(), updatedAt: new Date() });

describe("initiativeSettingsSchema", () => {
  test("accepts an enabled tenant with recipients", () => {
    const parsed = initiativeSettingsSchema.parse({
      _id: new ObjectId(),
      ...now(),
      enabled: true,
      recipients: ["founder@example.com"],
      tenantId: "tenant-a",
    });
    expect(parsed.enabled).toBe(true);
  });

  test("rejects empty recipients", () => {
    const result = initiativeSettingsSchema.safeParse({
      _id: new ObjectId(),
      ...now(),
      enabled: true,
      recipients: [],
      tenantId: "tenant-a",
    });
    expect(result.success).toBe(false);
  });

  test("rejects a non-email recipient", () => {
    const result = initiativeSettingsSchema.safeParse({
      _id: new ObjectId(),
      ...now(),
      enabled: true,
      recipients: ["not-an-email"],
      tenantId: "tenant-a",
    });
    expect(result.success).toBe(false);
  });
});

describe("initiativeDeliverySchema", () => {
  test("accepts a claimed delivery", () => {
    const parsed = initiativeDeliverySchema.parse({
      _id: new ObjectId(),
      ...now(),
      date: "2026-08-26",
      outcome: "claimed",
      recipients: [],
      tenantId: "tenant-a",
    });
    expect(parsed.outcome).toBe("claimed");
  });

  test("rejects a malformed date key", () => {
    const result = initiativeDeliverySchema.safeParse({
      _id: new ObjectId(),
      ...now(),
      date: "26.08.2026",
      outcome: "sent",
      recipients: [],
      tenantId: "tenant-a",
    });
    expect(result.success).toBe(false);
  });

  test("outcome enum is exactly the four lifecycle states", () => {
    expect(deliveryOutcomeValues).toEqual([
      "claimed",
      "sent",
      "no-news",
      "failed",
    ]);
  });
});

const uri = process.env.MONGODB_TEST_URI;
const TENANT = "tenant-a";
const OTHER_TENANT = "tenant-b";
const NOW = new Date("2026-08-26T05:00:00Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const at = (msAgo: number) => new Date(NOW.getTime() - msAgo);

describe.skipIf(!uri)("gatherMorningBriefData", () => {
  const client = new MongoClient(uri ?? "mongodb://localhost:27017");
  const db = client.db("knowledge_test_initiative_gather");

  beforeAll(async () => {
    await client.connect();
    await db.dropDatabase();
    const { facts, people, proposals, sources } = getCollections(db);
    const doc = (msAgo: number) => ({
      createdAt: at(msAgo),
      updatedAt: at(msAgo),
    });

    const fresh = new ObjectId();
    const cold = new ObjectId();
    const colder = new ObjectId();
    const supersededOnly = new ObjectId();
    await people.insertMany([
      {
        _id: fresh,
        ...doc(90 * DAY),
        emails: [],
        name: "Frida Frisch",
        tenantId: TENANT,
      },
      {
        _id: cold,
        ...doc(90 * DAY),
        emails: [],
        name: "Karl Kalt",
        tenantId: TENANT,
      },
      {
        _id: colder,
        ...doc(90 * DAY),
        emails: [],
        name: "Elke Eis",
        tenantId: TENANT,
      },
      {
        _id: supersededOnly,
        ...doc(90 * DAY),
        emails: [],
        name: "Petra Pause",
        tenantId: TENANT,
      },
    ]);
    await facts.insertMany([
      // Fresh activity (2 days) — must not appear in goingCold. Also created
      // inside the 24h window? No: createdAt 2 days ago, so newFactCount
      // counts only the one below.
      {
        _id: new ObjectId(),
        ...doc(2 * DAY),
        anchors: { personId: fresh },
        category: "preference",
        confidence: 0.9,
        confirmedBy: "reviewer",
        sourceId: new ObjectId(),
        tenantId: TENANT,
        text: "Frida bevorzugt Vormittagstermine.",
      },
      // Confirmed 1h ago → newFactCount = 1.
      {
        _id: new ObjectId(),
        ...doc(1 * HOUR),
        anchors: { personId: fresh },
        category: "logistics",
        confidence: 0.9,
        confirmedBy: "reviewer",
        sourceId: new ObjectId(),
        tenantId: TENANT,
        text: "Frida ist diese Woche in Berlin.",
      },
      // 40 days cold.
      {
        _id: new ObjectId(),
        ...doc(40 * DAY),
        anchors: { personId: cold },
        category: "background",
        confidence: 0.8,
        confirmedBy: "reviewer",
        sourceId: new ObjectId(),
        tenantId: TENANT,
        text: "Karl leitet den Einkauf.",
      },
      // 60 days cold — oldest first in the result.
      {
        _id: new ObjectId(),
        ...doc(60 * DAY),
        anchors: { personId: colder },
        category: "background",
        confidence: 0.8,
        confirmedBy: "reviewer",
        sourceId: new ObjectId(),
        tenantId: TENANT,
        text: "Elke entscheidet über Budgets.",
      },
      // Superseded 90-day fact for the fresh person must not drag her cold.
      {
        _id: new ObjectId(),
        ...doc(90 * DAY),
        anchors: { personId: fresh },
        category: "preference",
        confidence: 0.9,
        confirmedBy: "reviewer",
        sourceId: new ObjectId(),
        supersededBy: new ObjectId(),
        tenantId: TENANT,
        text: "Frida bevorzugte Nachmittage.",
      },
      // 50 days old and superseded — the ONLY fact for Petra. With
      // currentlyValidFilter she has no valid facts → no group row →
      // excluded from goingCold. Without the filter she would appear.
      {
        _id: new ObjectId(),
        ...doc(50 * DAY),
        anchors: { personId: supersededOnly },
        category: "background",
        confidence: 0.8,
        confirmedBy: "reviewer",
        sourceId: new ObjectId(),
        supersededBy: new ObjectId(),
        tenantId: TENANT,
        text: "Petra war mal aktiv.",
      },
    ]);
    await sources.insertMany([
      {
        _id: new ObjectId(),
        ...doc(2 * HOUR),
        capturedBy: "user-1",
        content: "Notiz aus dem Kundengespräch mit Karl.",
        status: "reviewed",
        tenantId: TENANT,
        type: "manual",
      },
      {
        _id: new ObjectId(),
        ...doc(3 * HOUR),
        capturedBy: "user-1",
        status: "received",
        tenantId: TENANT,
        type: "voice",
      },
      // Outside the 24h window.
      {
        _id: new ObjectId(),
        ...doc(30 * HOUR),
        capturedBy: "user-1",
        content: "Alte Notiz.",
        status: "reviewed",
        tenantId: TENANT,
        type: "manual",
      },
      // Other tenant, inside the window — must not leak.
      {
        _id: new ObjectId(),
        ...doc(1 * HOUR),
        capturedBy: "user-9",
        content: "Fremder Mandant.",
        status: "received",
        tenantId: OTHER_TENANT,
        type: "manual",
      },
    ]);
    await proposals.insertMany([
      {
        _id: new ObjectId(),
        ...doc(5 * DAY),
        entityDrafts: [],
        factDrafts: [],
        kind: "ingestion",
        status: "open",
        tenantId: TENANT,
      },
      {
        _id: new ObjectId(),
        ...doc(1 * DAY),
        entityDrafts: [],
        factDrafts: [],
        kind: "contradiction",
        status: "open",
        tenantId: TENANT,
      },
      // Skipped → not reviewable, excluded from the count.
      {
        _id: new ObjectId(),
        ...doc(1 * DAY),
        entityDrafts: [],
        factDrafts: [],
        kind: "ingestion",
        skipReason: "nothing worth recording",
        status: "open",
        tenantId: TENANT,
      },
      // Resolved → excluded.
      {
        _id: new ObjectId(),
        ...doc(10 * DAY),
        entityDrafts: [],
        factDrafts: [],
        kind: "ingestion",
        status: "resolved",
        tenantId: TENANT,
      },
    ]);
  });

  afterAll(async () => {
    await client.close();
  });

  test("counts captures and new facts inside the 24h window", async () => {
    const data = await gatherMorningBriefData(db, TENANT, NOW);
    expect(data.captures.count).toBe(2);
    expect(data.captures.newFactCount).toBe(1);
    expect(data.captures.latest).toHaveLength(2);
    expect(data.captures.latest[0]?.type).toBe("manual");
    expect(data.captures.latest[0]?.excerpt).toContain("Kundengespräch");
    expect(data.captures.latest[1]?.excerpt).toBeNull();
  });

  test("counts reviewable proposals with oldest age and contradictions", async () => {
    const data = await gatherMorningBriefData(db, TENANT, NOW);
    expect(data.reviewQueue.count).toBe(2);
    expect(data.reviewQueue.contradictionCount).toBe(1);
    expect(data.reviewQueue.oldestCreatedAt?.getTime()).toBe(
      at(5 * DAY).getTime()
    );
  });

  test("lists cold people oldest-first from currently valid facts only", async () => {
    const data = await gatherMorningBriefData(db, TENANT, NOW);
    // Petra has only a superseded fact, so she must not appear in goingCold even
    // though her fact is older than the 28-day threshold. This exercises the
    // currentlyValidFilter exclusion.
    expect(data.goingCold.map((p) => p.name)).toEqual([
      "Elke Eis",
      "Karl Kalt",
    ]);
    expect(data.goingCold.some((p) => p.name === "Petra Pause")).toBe(false);
  });

  test("is tenant-isolated", async () => {
    const data = await gatherMorningBriefData(db, OTHER_TENANT, NOW);
    expect(data.captures.count).toBe(1);
    expect(data.reviewQueue.count).toBe(0);
    expect(data.goingCold).toEqual([]);
  });
});

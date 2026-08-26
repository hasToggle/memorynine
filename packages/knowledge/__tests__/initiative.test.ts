import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { MongoClient, ObjectId } from "mongodb";
import { getCollections } from "../collections";
import {
  composeMorningBrief,
  gatherMorningBriefData,
  runMorningBriefSweep,
} from "../initiative";
import {
  deliveryOutcomeValues,
  initiativeDeliverySchema,
  initiativeSettingsSchema,
} from "../schemas/initiative";

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

const NO_NEWS = {
  captures: { count: 0, latest: [], newFactCount: 0 },
  goingCold: [],
  reviewQueue: { contradictionCount: 0, count: 0, oldestCreatedAt: null },
};

describe("composeMorningBrief", () => {
  const options = { appOrigin: "https://app.example.com", now: NOW };

  test("returns null when there is no news", () => {
    expect(composeMorningBrief(NO_NEWS, options)).toBeNull();
  });

  test("going-quiet alone never triggers a send", () => {
    const email = composeMorningBrief(
      {
        ...NO_NEWS,
        goingCold: [
          {
            lastActivity: at(40 * DAY),
            name: "Karl Kalt",
            personId: new ObjectId(),
          },
        ],
      },
      options
    );
    expect(email).toBeNull();
  });

  test("composes subject, text and html with review link", () => {
    const email = composeMorningBrief(
      {
        captures: {
          count: 2,
          latest: [
            {
              excerpt: "Notiz aus dem Gespräch",
              type: "manual",
              when: at(2 * HOUR),
            },
            { excerpt: null, type: "voice", when: at(3 * HOUR) },
          ],
          newFactCount: 1,
        },
        goingCold: [
          {
            lastActivity: at(40 * DAY),
            name: "Karl Kalt",
            personId: new ObjectId(),
          },
        ],
        reviewQueue: {
          contradictionCount: 1,
          count: 3,
          oldestCreatedAt: at(5 * DAY),
        },
      },
      options
    );
    expect(email?.subject).toBe(
      "Morning brief: 2 new captures · 3 waiting for review"
    );
    expect(email?.text).toContain("https://app.example.com/review");
    expect(email?.text).toContain("Karl Kalt");
    expect(email?.text).toContain("40 days");
    expect(email?.text).toContain("1 contradiction");
    expect(email?.html).toContain("Notiz aus dem Gespräch");
  });

  test("escapes captured material in html", () => {
    const email = composeMorningBrief(
      {
        ...NO_NEWS,
        captures: {
          count: 1,
          latest: [
            {
              excerpt: "<script>alert(1)</script>",
              type: "manual",
              when: at(HOUR),
            },
          ],
          newFactCount: 0,
        },
      },
      options
    );
    expect(email?.html).not.toContain("<script>");
    expect(email?.html).toContain("&lt;script&gt;");
  });

  test("singularizes counts", () => {
    const email = composeMorningBrief(
      {
        ...NO_NEWS,
        captures: { count: 1, latest: [], newFactCount: 1 },
      },
      options
    );
    expect(email?.subject).toBe("Morning brief: 1 new capture");
  });
});

describe.skipIf(!uri)("runMorningBriefSweep", () => {
  const client = new MongoClient(uri ?? "mongodb://localhost:27017");
  const db = client.db("knowledge_test_initiative_sweep");
  const sent: { subject: string; to: string[] }[] = [];
  const send = (email: { subject: string; to: string[] }) => {
    sent.push({ subject: email.subject, to: email.to });
    return Promise.resolve();
  };
  const options = { appOrigin: "https://app.example.com", now: NOW, send };

  beforeAll(async () => {
    await client.connect();
  });

  beforeEach(async () => {
    await db.dropDatabase();
    sent.length = 0;
    const { initiativeSettings, sources } = getCollections(db);
    const doc = (msAgo: number) => ({
      createdAt: at(msAgo),
      updatedAt: at(msAgo),
    });
    await initiativeSettings.insertMany([
      {
        _id: new ObjectId(),
        ...doc(30 * DAY),
        enabled: true,
        recipients: ["a@example.com"],
        tenantId: TENANT,
      },
      {
        _id: new ObjectId(),
        ...doc(30 * DAY),
        enabled: true,
        recipients: ["b@example.com"],
        tenantId: OTHER_TENANT,
      },
      {
        _id: new ObjectId(),
        ...doc(30 * DAY),
        enabled: false,
        recipients: ["c@example.com"],
        tenantId: "tenant-disabled",
      },
    ]);
    // Only TENANT has news; OTHER_TENANT is quiet; disabled has news that
    // must never send.
    await sources.insertMany([
      {
        _id: new ObjectId(),
        ...doc(2 * HOUR),
        capturedBy: "u",
        content: "Frische Notiz",
        status: "received",
        tenantId: TENANT,
        type: "manual",
      },
      {
        _id: new ObjectId(),
        ...doc(2 * HOUR),
        capturedBy: "u",
        content: "Sollte nie ankommen",
        status: "received",
        tenantId: "tenant-disabled",
        type: "manual",
      },
    ]);
  });

  afterAll(async () => {
    await client.close();
  });

  test("sends to enabled tenants with news, records outcomes", async () => {
    const report = await runMorningBriefSweep(db, options);
    expect(report).toEqual({
      alreadyDelivered: 0,
      failed: 0,
      failures: [],
      noNews: 1,
      sent: 1,
    });
    expect(sent).toEqual([
      {
        subject: "Morning brief: 1 new capture",
        to: ["a@example.com"],
      },
    ]);
    const { initiativeDeliveries } = getCollections(db);
    const outcomes = await initiativeDeliveries
      .find({}, { projection: { outcome: 1, tenantId: 1 } })
      .toArray();
    expect(outcomes.map((d) => [d.tenantId, d.outcome]).sort()).toEqual([
      [TENANT, "sent"],
      [OTHER_TENANT, "no-news"],
    ]);
  });

  test("second run on the same day delivers nothing", async () => {
    await runMorningBriefSweep(db, options);
    sent.length = 0;
    const report = await runMorningBriefSweep(db, options);
    expect(sent).toEqual([]);
    expect(report.sent).toBe(0);
    expect(report.alreadyDelivered).toBe(2);
  });

  test("one tenant's send failure never blocks another's", async () => {
    const failingSend = async (email: { to: string[] }) => {
      if (email.to[0] === "a@example.com") {
        throw new Error("mailbox on fire");
      }
      await send(email as never);
    };
    const report = await runMorningBriefSweep(db, {
      ...options,
      send: failingSend as never,
    });
    expect(report.failed).toBe(1);
    expect(report.failures[0]).toContain(TENANT);
    expect(report.failures[0]).toContain("mailbox on fire");
    expect(report.noNews).toBe(1);
    const { initiativeDeliveries } = getCollections(db);
    const failedDelivery = await initiativeDeliveries.findOne({
      tenantId: TENANT,
    });
    expect(failedDelivery?.outcome).toBe("failed");
    expect(failedDelivery?.error).toContain("mailbox on fire");
  });
});

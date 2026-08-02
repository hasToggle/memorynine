import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { MongoClient, ObjectId } from "mongodb";
import { ensureIndexes, getCollections } from "../collections";
import { sweepPipeline } from "../pipeline";

const uri = process.env.MONGODB_TEST_URI;
const now = () => ({ createdAt: new Date(), updatedAt: new Date() });

const PROPOSAL_REPLY = JSON.stringify({
  entities: [
    {
      data: { name: "Nordwind GmbH" },
      draftId: "org-1",
      entityType: "organization",
    },
  ],
  facts: [
    {
      anchors: { organizationDraftId: "org-1" },
      category: "logistics",
      confidence: 0.9,
      text: "Angebot bis Ende August.",
    },
  ],
});

describe.skipIf(!uri)("sweepPipeline", () => {
  const client = new MongoClient(uri ?? "mongodb://localhost:27017");
  const db = client.db("knowledge_test_pipeline");
  const { proposals, sources } = getCollections(db);

  beforeAll(async () => {
    await client.connect();
    await db.dropDatabase();
    await ensureIndexes(db);
  });

  beforeEach(async () => {
    await Promise.all([proposals.deleteMany({}), sources.deleteMany({})]);
  });

  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
  });

  const insertVoiceSource = async (tenantId: string): Promise<ObjectId> => {
    const _id = new ObjectId();
    await sources.insertOne({
      _id,
      audio: {
        blobUrl: `https://blob.example/${_id}.wav`,
        contentType: "audio/wav",
      },
      capturedBy: "user_ceo1",
      status: "received",
      tenantId,
      type: "voice",
      ...now(),
    });
    return _id;
  };

  const insertManualSource = async (tenantId: string): Promise<ObjectId> => {
    const _id = new ObjectId();
    await sources.insertOne({
      _id,
      capturedBy: "user_ceo1",
      content: "Angebot bis Ende August an Nordwind GmbH.",
      status: "received",
      tenantId,
      type: "manual",
      ...now(),
    });
    return _id;
  };

  test("carries a voice source from audio to proposal in one sweep, across tenants", async () => {
    const voiceA = await insertVoiceSource("tenant-a");
    const manualB = await insertManualSource("tenant-b");

    const report = await sweepPipeline(db, {
      generate: () => Promise.resolve(PROPOSAL_REPLY),
      transcribe: () =>
        Promise.resolve({
          languageCode: "de",
          text: "Angebot bis Ende August.",
        }),
    });

    expect(report.transcribed).toBe(1);
    expect(report.proposed).toBe(2);
    expect(report.failures).toEqual([]);

    const sourceA = await sources.findOne({ _id: voiceA });
    expect(sourceA?.status).toBe("proposed");
    const sourceB = await sources.findOne({ _id: manualB });
    expect(sourceB?.status).toBe("proposed");
    // Tenancy is preserved: each proposal belongs to its source's tenant.
    expect(await proposals.countDocuments({ tenantId: "tenant-a" })).toBe(1);
    expect(await proposals.countDocuments({ tenantId: "tenant-b" })).toBe(1);
  });

  test("one failing source does not stop the sweep", async () => {
    await insertVoiceSource("tenant-a");
    const manual = await insertManualSource("tenant-a");

    const report = await sweepPipeline(db, {
      generate: () => Promise.resolve(PROPOSAL_REPLY),
      transcribe: () => Promise.reject(new Error("assemblyai down")),
    });

    expect(report.transcribed).toBe(0);
    expect(report.proposed).toBe(1);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]).toContain("assemblyai down");
    const manualSource = await sources.findOne({ _id: manual });
    expect(manualSource?.status).toBe("proposed");
  });

  test("respects the per-sweep limit", async () => {
    await insertManualSource("tenant-a");
    await insertManualSource("tenant-a");
    await insertManualSource("tenant-a");

    const report = await sweepPipeline(db, {
      generate: () => Promise.resolve(PROPOSAL_REPLY),
      limit: 2,
      transcribe: () => Promise.resolve({ text: "x" }),
    });

    expect(report.proposed).toBe(2);
    expect(await sources.countDocuments({ status: "received" })).toBe(1);
  });

  test("an idle database sweeps to zeros", async () => {
    const report = await sweepPipeline(db, {
      generate: () => Promise.reject(new Error("must not be called")),
      transcribe: () => Promise.reject(new Error("must not be called")),
    });
    expect(report).toEqual({
      failures: [],
      proposed: 0,
      skipped: 0,
      transcribed: 0,
    });
  });
});

describe.skipIf(!uri)("sweepPipeline stale recovery", () => {
  const client = new MongoClient(uri ?? "mongodb://localhost:27017");
  const db = client.db("knowledge_test_pipeline_recovery");
  const { proposals, sources } = getCollections(db);
  const TEN_MINUTES_AGO = () => new Date(Date.now() - 10 * 60_000);

  beforeAll(async () => {
    await client.connect();
    await db.dropDatabase();
    await ensureIndexes(db);
  });

  beforeEach(async () => {
    await Promise.all([proposals.deleteMany({}), sources.deleteMany({})]);
  });

  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
  });

  test("a source stuck in extracting from a crashed run is swept again", async () => {
    const _id = new ObjectId();
    await sources.insertOne({
      _id,
      capturedBy: "user_ceo1",
      content: "Angebot bis Ende August an Nordwind GmbH.",
      createdAt: TEN_MINUTES_AGO(),
      status: "extracting",
      tenantId: "tenant-a",
      type: "voice",
      updatedAt: TEN_MINUTES_AGO(),
    });

    const report = await sweepPipeline(db, {
      generate: () => Promise.resolve(PROPOSAL_REPLY),
      transcribe: () => Promise.reject(new Error("must not be called")),
    });

    expect(report.proposed).toBe(1);
    const source = await sources.findOne({ _id });
    expect(source?.status).toBe("proposed");
  });

  test("a source stuck in transcribing from a crashed run is swept again", async () => {
    const _id = new ObjectId();
    await sources.insertOne({
      _id,
      audio: {
        blobUrl: "https://blob.example/x.wav",
        contentType: "audio/wav",
      },
      capturedBy: "user_ceo1",
      createdAt: TEN_MINUTES_AGO(),
      status: "transcribing",
      tenantId: "tenant-a",
      type: "voice",
      updatedAt: TEN_MINUTES_AGO(),
    });

    const report = await sweepPipeline(db, {
      generate: () => Promise.resolve(PROPOSAL_REPLY),
      transcribe: () => Promise.resolve({ text: "Wieder da." }),
    });

    expect(report.transcribed).toBe(1);
  });

  test("a source freshly in-flight on another worker is left alone", async () => {
    const _id = new ObjectId();
    await sources.insertOne({
      _id,
      capturedBy: "user_ceo1",
      content: "Gerade in Arbeit.",
      createdAt: new Date(),
      status: "extracting",
      tenantId: "tenant-a",
      type: "voice",
      updatedAt: new Date(),
    });

    const report = await sweepPipeline(db, {
      generate: () => Promise.reject(new Error("must not be called")),
      transcribe: () => Promise.reject(new Error("must not be called")),
    });

    expect(report).toEqual({
      failures: [],
      proposed: 0,
      skipped: 0,
      transcribed: 0,
    });
  });
});

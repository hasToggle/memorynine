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
import { processSource } from "../process-source";

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

const mustNotGenerate = () =>
  Promise.reject(new Error("generate must not be called"));
const mustNotTranscribe = () =>
  Promise.reject(new Error("transcribe must not be called"));

describe.skipIf(!uri)("processSource", () => {
  const client = new MongoClient(uri ?? "mongodb://localhost:27017");
  const db = client.db("knowledge_test_process_source");
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

  test("a manual source becomes an open proposal in one call", async () => {
    const sourceId = await insertManualSource("tenant-a");

    const result = await processSource(db, "tenant-a", {
      generate: () => Promise.resolve(PROPOSAL_REPLY),
      sourceId,
    });

    expect(result.status).toBe("proposed");
    const source = await sources.findOne({ _id: sourceId });
    expect(source?.status).toBe("proposed");
    expect(
      await proposals.countDocuments({ sourceId, tenantId: "tenant-a" })
    ).toBe(1);
  });

  test("a voice source is transcribed and extracted in the same call", async () => {
    const sourceId = await insertVoiceSource("tenant-a");

    const result = await processSource(db, "tenant-a", {
      generate: () => Promise.resolve(PROPOSAL_REPLY),
      sourceId,
      transcribe: () =>
        Promise.resolve({ languageCode: "de", text: "Angebot bis August." }),
    });

    expect(result.status).toBe("proposed");
    const source = await sources.findOne({ _id: sourceId });
    expect(source?.status).toBe("proposed");
    expect(source?.content).toBe("Angebot bis August.");
  });

  test("a voice source without a transcriber is deferred untouched", async () => {
    const sourceId = await insertVoiceSource("tenant-a");

    const result = await processSource(db, "tenant-a", {
      generate: mustNotGenerate,
      sourceId,
    });

    expect(result.status).toBe("deferred");
    const source = await sources.findOne({ _id: sourceId });
    expect(source?.status).toBe("received");
  });

  test("a source that is already past capture is left alone", async () => {
    const sourceId = await insertManualSource("tenant-a");
    await sources.updateOne(
      { _id: sourceId },
      { $set: { status: "proposed" } }
    );

    const result = await processSource(db, "tenant-a", {
      generate: mustNotGenerate,
      sourceId,
      transcribe: mustNotTranscribe,
    });

    expect(result.status).toBe("noop");
    expect(await proposals.countDocuments({})).toBe(0);
  });

  test("an extraction failure is left for the cron backstop to retry", async () => {
    const sourceId = await insertManualSource("tenant-a");

    const result = await processSource(db, "tenant-a", {
      generate: () => Promise.resolve("I cannot help with that."),
      sourceId,
    });

    expect(result.status).toBe("retry");
    const source = await sources.findOne({ _id: sourceId });
    expect(source?.status).toBe("received");
    expect(source?.extractionAttempts).toBe(1);
  });

  test("a missing source throws instead of reporting a status", async () => {
    await expect(
      processSource(db, "tenant-a", {
        generate: mustNotGenerate,
        sourceId: new ObjectId(),
      })
    ).rejects.toThrow("not found");
  });

  test("another tenant's source is invisible, not processable", async () => {
    const sourceId = await insertManualSource("tenant-a");

    await expect(
      processSource(db, "tenant-b", {
        generate: mustNotGenerate,
        sourceId,
      })
    ).rejects.toThrow("not found");
  });
});

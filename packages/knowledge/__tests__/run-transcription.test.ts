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
import { runTranscription } from "../transcription";

const uri = process.env.MONGODB_TEST_URI;
const TENANT = "test-tenant";
const now = () => ({ createdAt: new Date(), updatedAt: new Date() });
const noAudioPattern = /audio/;

describe.skipIf(!uri)("runTranscription", () => {
  const client = new MongoClient(uri ?? "mongodb://localhost:27017");
  const db = client.db("knowledge_test_transcription");
  const { sources } = getCollections(db);
  let sourceId: ObjectId;

  beforeAll(async () => {
    await client.connect();
    await db.dropDatabase();
    await ensureIndexes(db);
  });

  beforeEach(async () => {
    await sources.deleteMany({});
    sourceId = new ObjectId();
    await sources.insertOne({
      _id: sourceId,
      audio: {
        blobUrl: "https://blob.example/memo.wav",
        contentType: "audio/wav",
      },
      capturedBy: "user_ceo1",
      status: "received",
      tenantId: TENANT,
      type: "voice",
      ...now(),
    });
  });

  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
  });

  test("stores the transcript and advances the source to transcribed", async () => {
    let seenUrl = "";
    const result = await runTranscription(db, TENANT, {
      sourceId,
      transcribe: (audioUrl) => {
        seenUrl = audioUrl;
        return Promise.resolve({
          languageCode: "de",
          text: "Notiz nach dem Telefonat.",
        });
      },
    });

    expect(result.status).toBe("transcribed");
    expect(seenUrl).toBe("https://blob.example/memo.wav");
    const source = await sources.findOne({ _id: sourceId });
    expect(source?.status).toBe("transcribed");
    expect(source?.content).toBe("Notiz nach dem Telefonat.");
  });

  test("a source that is already transcribed is left alone", async () => {
    await sources.updateOne(
      { _id: sourceId },
      { $set: { content: "Fertig.", status: "transcribed" } }
    );
    const result = await runTranscription(db, TENANT, {
      sourceId,
      transcribe: () => Promise.reject(new Error("must not be called")),
    });

    expect(result.status).toBe("transcribed");
    const source = await sources.findOne({ _id: sourceId });
    expect(source?.content).toBe("Fertig.");
  });

  test("a failure is retryable and counts against the budget", async () => {
    const result = await runTranscription(db, TENANT, {
      sourceId,
      transcribe: () => Promise.reject(new Error("assemblyai 500")),
    });

    expect(result.status).toBe("retry");
    const source = await sources.findOne({ _id: sourceId });
    expect(source?.status).toBe("received");
    expect(source?.transcriptionAttempts).toBe(1);
    expect(source?.error).toContain("assemblyai 500");
  });

  test("the failure budget flips the source to failed", async () => {
    const transcribe = () => Promise.reject(new Error("boom"));
    await runTranscription(db, TENANT, {
      maxAttempts: 2,
      sourceId,
      transcribe,
    });
    const second = await runTranscription(db, TENANT, {
      maxAttempts: 2,
      sourceId,
      transcribe,
    });

    expect(second.status).toBe("failed");
    const source = await sources.findOne({ _id: sourceId });
    expect(source?.status).toBe("failed");
  });

  test("an empty transcript is a failure, not an empty content", async () => {
    const result = await runTranscription(db, TENANT, {
      sourceId,
      transcribe: () => Promise.resolve({ text: "   " }),
    });

    expect(result.status).toBe("retry");
    const source = await sources.findOne({ _id: sourceId });
    expect(source?.content).toBeUndefined();
  });

  test("refuses a voice source without an audio blob", async () => {
    await sources.updateOne({ _id: sourceId }, { $unset: { audio: "" } });
    await expect(
      runTranscription(db, TENANT, {
        sourceId,
        transcribe: () => Promise.resolve({ text: "x" }),
      })
    ).rejects.toThrow(noAudioPattern);
  });
});

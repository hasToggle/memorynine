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
import { proposalIdFor, runExtraction } from "../extraction-run";
import { deterministicId } from "../idempotency";

const uri = process.env.MONGODB_TEST_URI;
const TENANT = "test-tenant";
const now = () => ({ createdAt: new Date(), updatedAt: new Date() });
const noContentPattern = /content/;

describe("proposalIdFor", () => {
  test("generation 1 keeps the id it has today, so existing proposals are not orphaned", () => {
    const tenantId = "t1";
    const sourceId = new ObjectId();
    expect(proposalIdFor(tenantId, sourceId, 1).toHexString()).toBe(
      deterministicId(
        `${tenantId}:${sourceId.toHexString()}:extraction`
      ).toHexString()
    );
  });

  test("generation 2 gets a distinct id", () => {
    const tenantId = "t1";
    const sourceId = new ObjectId();
    expect(proposalIdFor(tenantId, sourceId, 2).toHexString()).not.toBe(
      proposalIdFor(tenantId, sourceId, 1).toHexString()
    );
  });
});

describe.skipIf(!uri)("runExtraction", () => {
  const client = new MongoClient(uri ?? "mongodb://localhost:27017");
  const db = client.db("knowledge_test_extraction");
  const { facts, organizations, proposals, sources } = getCollections(db);
  const orgId = new ObjectId();
  let knownFactId: ObjectId;
  let sourceId: ObjectId;

  const proposalReply = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify({
      entities: [
        {
          data: { name: "Anna Müller" },
          draftId: "person-1",
          entityType: "person",
        },
      ],
      facts: [
        {
          anchors: { personDraftId: "person-1" },
          category: "preference",
          confidence: 0.9,
          supersedes: [knownFactId.toHexString()],
          text: "Bevorzugt jetzt Termine am Nachmittag.",
        },
      ],
      ...overrides,
    });

  beforeAll(async () => {
    await client.connect();
    await db.dropDatabase();
    await ensureIndexes(db);
    await organizations.insertOne({
      _id: orgId,
      domains: [],
      name: "Nordwind GmbH",
      status: "active",
      tenantId: TENANT,
      ...now(),
    });
  });

  beforeEach(async () => {
    await Promise.all([
      facts.deleteMany({}),
      proposals.deleteMany({}),
      sources.deleteMany({}),
    ]);
    knownFactId = new ObjectId();
    await facts.insertOne({
      _id: knownFactId,
      anchors: { organizationId: orgId },
      category: "preference",
      confidence: 0.8,
      confirmedBy: "user_ceo1",
      sourceId: new ObjectId(),
      tenantId: TENANT,
      text: "Bevorzugt Termine am Vormittag.",
      ...now(),
    });
    sourceId = new ObjectId();
    await sources.insertOne({
      _id: sourceId,
      capturedBy: "user_ceo1",
      content: "Frau Müller bevorzugt jetzt Termine am Nachmittag.",
      status: "transcribed",
      tenantId: TENANT,
      type: "voice",
      ...now(),
    });
  });

  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
  });

  test("creates a proposal from the model reply and feeds prior knowledge into the prompt", async () => {
    let seenPrompt = "";
    const result = await runExtraction(db, TENANT, {
      generate: (prompt) => {
        seenPrompt = prompt;
        return Promise.resolve(proposalReply());
      },
      sourceId,
    });

    expect(result.status).toBe("proposed");
    // The remember lesson: the model must see existing entities and facts so
    // it can anchor and supersede instead of duplicating.
    expect(seenPrompt).toContain(orgId.toHexString());
    expect(seenPrompt).toContain("Nordwind GmbH");
    expect(seenPrompt).toContain(knownFactId.toHexString());

    const proposal = await proposals.findOne({ _id: result.proposalId });
    expect(proposal?.kind).toBe("ingestion");
    expect(proposal?.sourceId?.equals(sourceId)).toBe(true);
    expect(proposal?.entityDrafts[0]?.draftId).toBe("person-1");
    expect(proposal?.factDrafts[0]?.resolution.status).toBe("pending");
    expect(proposal?.factDrafts[0]?.supersedes?.[0]?.equals(knownFactId)).toBe(
      true
    );
    // Absence, not an empty array, is how a reader knows nothing was dropped.
    expect(proposal?.rejectedDrafts).toBeUndefined();

    const source = await sources.findOne({ _id: sourceId });
    expect(source?.status).toBe("proposed");
  });

  test("re-running after success is idempotent", async () => {
    const generate = () => Promise.resolve(proposalReply());
    const first = await runExtraction(db, TENANT, { generate, sourceId });
    const second = await runExtraction(db, TENANT, { generate, sourceId });

    expect(second.status).toBe("proposed");
    expect(second.proposalId?.equals(first.proposalId as ObjectId)).toBe(true);
    expect(await proposals.countDocuments({})).toBe(1);
  });

  test("skip token writes a zero-draft proposal carrying the reason, and leaves the source on proposed", async () => {
    const result = await runExtraction(db, TENANT, {
      generate: () =>
        Promise.resolve('{"skip": true, "reason": "greeting only"}'),
      sourceId,
    });

    expect(result.status).toBe("skipped");
    expect(await proposals.countDocuments({})).toBe(1);
    const proposal = await proposals.findOne({ _id: result.proposalId });
    expect(proposal?.skipReason).toBe("greeting only");
    expect(proposal?.entityDrafts).toEqual([]);
    expect(proposal?.factDrafts).toEqual([]);
    expect(proposal?.extractionGeneration).toBe(1);
    const source = await sources.findOne({ _id: sourceId });
    expect(source?.status).toBe("proposed");
  });

  test("a proposal carrying rejected drafts persists them for review", async () => {
    const result = await runExtraction(db, TENANT, {
      generate: () =>
        Promise.resolve(
          JSON.stringify({
            entities: [
              {
                data: { name: "Anna Müller" },
                draftId: "person-1",
                entityType: "person",
              },
            ],
            facts: [
              {
                anchors: { personDraftId: "person-1" },
                category: "not-a-real-category",
                confidence: 0.9,
                text: "Bevorzugt jetzt Termine am Nachmittag.",
              },
            ],
          })
        ),
      sourceId,
    });

    expect(result.status).toBe("proposed");
    const proposal = await proposals.findOne({ _id: result.proposalId });
    expect(proposal?.rejectedDrafts?.length).toBe(1);
    expect(proposal?.rejectedDrafts?.[0]?.reason).toContain("category");
  });

  test("a re-extraction hint is passed to the model and persisted on the proposal", async () => {
    let seenPrompt = "";
    const result = await runExtraction(db, TENANT, {
      generate: (prompt) => {
        seenPrompt = prompt;
        return Promise.resolve(proposalReply());
      },
      hint: "Focus on scheduling preferences.",
      sourceId,
    });

    const hintText = "Focus on scheduling preferences.";
    expect(seenPrompt).toContain(hintText);
    // Position, not just presence: the hint must land after the known-facts
    // block and before the source, per the prompt's trust boundary.
    const knownFactsIndex = seenPrompt.indexOf("Currently valid facts");
    const hintIndex = seenPrompt.indexOf(hintText);
    const sourceIndex = seenPrompt.indexOf("Source (type:");
    expect(knownFactsIndex).toBeGreaterThan(-1);
    expect(hintIndex).toBeGreaterThan(knownFactsIndex);
    expect(sourceIndex).toBeGreaterThan(hintIndex);

    const proposal = await proposals.findOne({ _id: result.proposalId });
    expect(proposal?.hint).toBe(hintText);
  });

  test("a crash between a skip proposal's insert and the status update resumes as skipped", async () => {
    const generation = 1;
    const proposalId = proposalIdFor(TENANT, sourceId, generation);
    await proposals.insertOne({
      _id: proposalId,
      createdAt: new Date(),
      entityDrafts: [],
      extractionGeneration: generation,
      factDrafts: [],
      kind: "ingestion",
      skipReason: "greeting only",
      sourceId,
      status: "open",
      tenantId: TENANT,
      updatedAt: new Date(),
    });
    // Simulate the crash: the proposal landed, but the source is still
    // "extracting" because markSourceProposed never ran.
    await sources.updateOne(
      { _id: sourceId },
      { $set: { status: "extracting" } }
    );

    const result = await runExtraction(db, TENANT, {
      generate: () => Promise.resolve('{"skip": true, "reason": "unused"}'),
      sourceId,
    });

    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("greeting only");
    expect(await proposals.countDocuments({})).toBe(1);
    const source = await sources.findOne({ _id: sourceId });
    expect(source?.status).toBe("proposed");
  });

  test("a failure is retryable and the source returns to its previous status", async () => {
    const result = await runExtraction(db, TENANT, {
      generate: () => Promise.resolve("I'm sorry, I can't do that."),
      sourceId,
    });

    expect(result.status).toBe("retry");
    const source = await sources.findOne({ _id: sourceId });
    expect(source?.status).toBe("transcribed");
    expect(source?.extractionAttempts).toBe(1);
    expect(source?.error).toContain("refused");
  });

  test("the failure budget flips the source to failed after maxAttempts", async () => {
    const generate = () => Promise.resolve("not json at all");
    await runExtraction(db, TENANT, { generate, maxAttempts: 3, sourceId });
    await runExtraction(db, TENANT, { generate, maxAttempts: 3, sourceId });
    const third = await runExtraction(db, TENANT, {
      generate,
      maxAttempts: 3,
      sourceId,
    });

    expect(third.status).toBe("failed");
    const source = await sources.findOne({ _id: sourceId });
    expect(source?.status).toBe("failed");
    expect(source?.extractionAttempts).toBe(3);
  });

  test("rejects hallucinated anchor ids not present in the tenant's knowledge", async () => {
    const ghostId = new ObjectId().toHexString();
    const result = await runExtraction(db, TENANT, {
      generate: () =>
        Promise.resolve(
          JSON.stringify({
            entities: [],
            facts: [
              {
                anchors: { organizationId: ghostId },
                category: "preference",
                confidence: 0.9,
                text: "x",
              },
            ],
          })
        ),
      sourceId,
    });

    expect(result.status).toBe("retry");
    expect(result.reason).toContain(ghostId);
    expect(await proposals.countDocuments({})).toBe(0);
  });

  test("rejects hallucinated supersedes ids", async () => {
    const ghostId = new ObjectId().toHexString();
    const result = await runExtraction(db, TENANT, {
      generate: () =>
        Promise.resolve(
          JSON.stringify({
            entities: [],
            facts: [
              {
                anchors: { organizationId: orgId.toHexString() },
                category: "preference",
                confidence: 0.9,
                supersedes: [ghostId],
                text: "x",
              },
            ],
          })
        ),
      sourceId,
    });

    expect(result.status).toBe("retry");
    expect(await proposals.countDocuments({})).toBe(0);
  });

  test("rejects a fact anchored to an entity draft missing from the reply", async () => {
    const result = await runExtraction(db, TENANT, {
      generate: () =>
        Promise.resolve(
          JSON.stringify({
            entities: [],
            facts: [
              {
                anchors: { personDraftId: "ghost-draft" },
                category: "preference",
                confidence: 0.9,
                text: "x",
              },
            ],
          })
        ),
      sourceId,
    });

    expect(result.status).toBe("retry");
    expect(await proposals.countDocuments({})).toBe(0);
  });

  test("a thrown generate call counts against the failure budget", async () => {
    const result = await runExtraction(db, TENANT, {
      generate: () => Promise.reject(new Error("gateway 500")),
      sourceId,
    });

    expect(result.status).toBe("retry");
    const source = await sources.findOne({ _id: sourceId });
    expect(source?.extractionAttempts).toBe(1);
    expect(source?.error).toContain("gateway 500");
  });

  test("refuses sources that are not ready for extraction", async () => {
    await sources.updateOne(
      { _id: sourceId },
      { $set: { content: undefined, status: "received" } }
    );
    await expect(
      runExtraction(db, TENANT, {
        generate: () => Promise.resolve(proposalReply()),
        sourceId,
      })
    ).rejects.toThrow(noContentPattern);
  });
});

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
import { proposalIdFor } from "../extraction-run";
import { reExtractSource } from "../re-extraction";

const uri = process.env.MONGODB_TEST_URI;
const TENANT = "test-tenant";
const now = () => ({ createdAt: new Date(), updatedAt: new Date() });
const noPriorProposalPattern = /no prior proposal/i;
const noContentPattern = /content/i;

describe.skipIf(!uri)("reExtractSource", () => {
  const client = new MongoClient(uri ?? "mongodb://localhost:27017");
  const db = client.db("knowledge_test_re_extraction");
  const { proposals, sources } = getCollections(db);
  let sourceId: ObjectId;
  let generation1ProposalId: ObjectId;

  const proposalReply = () =>
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
          text: "Bevorzugt jetzt Termine am Nachmittag.",
        },
      ],
    });

  beforeAll(async () => {
    await client.connect();
    await db.dropDatabase();
    await ensureIndexes(db);
  });

  beforeEach(async () => {
    await Promise.all([proposals.deleteMany({}), sources.deleteMany({})]);
    sourceId = new ObjectId();
    generation1ProposalId = proposalIdFor(TENANT, sourceId, 1);
    await sources.insertOne({
      _id: sourceId,
      capturedBy: "user_ceo1",
      content: "Original capture, no anchors existed yet.",
      extractionGeneration: 1,
      status: "proposed",
      tenantId: TENANT,
      type: "manual",
      ...now(),
    });
    await proposals.insertOne({
      _id: generation1ProposalId,
      createdAt: new Date(),
      entityDrafts: [],
      extractionGeneration: 1,
      factDrafts: [],
      kind: "ingestion",
      sourceId,
      status: "open",
      tenantId: TENANT,
      updatedAt: new Date(),
    });
  });

  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
  });

  test("supersedes the prior open proposal and bumps the generation", async () => {
    const result = await reExtractSource(db, TENANT, {
      generate: () => Promise.resolve(proposalReply()),
      sourceId,
    });

    expect(result.status).toBe("proposed");

    const priorProposal = await proposals.findOne({
      _id: generation1ProposalId,
    });
    expect(priorProposal?.status).toBe("superseded");
    // Nobody resolved this — a machine superseded it. Writing resolvedBy/
    // resolvedAt here would falsely claim a human did.
    expect(priorProposal?.resolvedBy).toBeUndefined();
    expect(priorProposal?.resolvedAt).toBeUndefined();

    const source = await sources.findOne({ _id: sourceId });
    expect(source?.extractionGeneration).toBe(2);
  });

  test("the new proposal lands on generation 2's id, not generation 1's", async () => {
    const result = await reExtractSource(db, TENANT, {
      generate: () => Promise.resolve(proposalReply()),
      sourceId,
    });

    const generation2Id = proposalIdFor(TENANT, sourceId, 2);
    expect(result.proposalId?.equals(generation2Id)).toBe(true);
    expect(result.proposalId?.equals(generation1ProposalId)).toBe(false);

    // The generation-1 id must survive, superseded rather than overwritten —
    // if generation were bumped after runExtraction read it, the write would
    // land back on this id instead.
    const oldProposal = await proposals.findOne({
      _id: generation1ProposalId,
    });
    expect(oldProposal?.status).toBe("superseded");

    const newProposal = await proposals.findOne({ _id: generation2Id });
    expect(newProposal?.extractionGeneration).toBe(2);
  });

  test("refuses a source that has never been extracted", async () => {
    const freshSourceId = new ObjectId();
    await sources.insertOne({
      _id: freshSourceId,
      capturedBy: "user_ceo1",
      content: "Never extracted.",
      status: "received",
      tenantId: TENANT,
      type: "manual",
      ...now(),
    });

    await expect(
      reExtractSource(db, TENANT, {
        generate: () => Promise.resolve(proposalReply()),
        sourceId: freshSourceId,
      })
    ).rejects.toThrow(noPriorProposalPattern);
  });

  test("refuses a source with no content, before touching the prior proposal or generation", async () => {
    await sources.updateOne(
      { _id: sourceId },
      { $set: { content: undefined } }
    );

    await expect(
      reExtractSource(db, TENANT, {
        generate: () => Promise.resolve(proposalReply()),
        sourceId,
      })
    ).rejects.toThrow(noContentPattern);

    // Distinguishes "refused cleanly" from "refused after breaking things":
    // runExtraction's own guardExtractable throws the same message text, so
    // asserting on the thrown error alone would also pass if reExtractSource
    // deferred this check to runExtraction — by which point the prior
    // proposal would already have been superseded with nothing to replace it.
    const priorProposal = await proposals.findOne({
      _id: generation1ProposalId,
    });
    expect(priorProposal?.status).toBe("open");
    const source = await sources.findOne({ _id: sourceId });
    expect(source?.extractionGeneration).toBe(1);
  });

  test("resets a voice source to transcribed, not received", async () => {
    const voiceSourceId = new ObjectId();
    const voiceProposalId = proposalIdFor(TENANT, voiceSourceId, 1);
    await sources.insertOne({
      _id: voiceSourceId,
      capturedBy: "user_ceo1",
      content: "Transcript from the call.",
      extractionGeneration: 1,
      status: "proposed",
      tenantId: TENANT,
      type: "voice",
      ...now(),
    });
    await proposals.insertOne({
      _id: voiceProposalId,
      createdAt: new Date(),
      entityDrafts: [],
      extractionGeneration: 1,
      factDrafts: [],
      kind: "ingestion",
      sourceId: voiceSourceId,
      status: "open",
      tenantId: TENANT,
      updatedAt: new Date(),
    });

    // A failing generate makes runExtraction write the source back to its
    // resting status, which is whatever reExtractSource reset it to before
    // delegating (runExtraction reads that status, sees it is not
    // "extracting", and passes it straight through). For a voice source that
    // must be "transcribed" — "received" is the manual/email branch.
    const result = await reExtractSource(db, TENANT, {
      generate: () => Promise.resolve("I'm sorry, I can't do that."),
      sourceId: voiceSourceId,
    });

    expect(result.status).toBe("retry");
    const source = await sources.findOne({ _id: voiceSourceId });
    expect(source?.status).toBe("transcribed");
  });

  test("resets an exhausted failure budget, so one new failure retries instead of failing outright", async () => {
    // Simulates a source that already burned through its 3-attempt budget on
    // a prior generation. Without a reset, runExtraction's guard sees
    // attempts 3 -> 4 on the very first call here and gives up immediately.
    await sources.updateOne(
      { _id: sourceId },
      {
        $set: {
          error: "model refused: previous generation",
          extractionAttempts: 3,
        },
      }
    );

    const result = await reExtractSource(db, TENANT, {
      generate: () => Promise.resolve("I'm sorry, I can't do that."),
      sourceId,
    });

    // Not "failed": the budget was reset, so this is attempt 1 of a fresh 3,
    // not attempt 4 of the old one.
    expect(result.status).toBe("retry");
    const source = await sources.findOne({ _id: sourceId });
    expect(source?.extractionAttempts).toBe(1);
    // runExtraction immediately overwrites error with this attempt's own
    // failure reason — the stale message from the prior generation is gone.
    expect(source?.error).not.toContain("previous generation");
  });

  test("passes the hint through to the prompt", async () => {
    let seenPrompt = "";
    await reExtractSource(db, TENANT, {
      generate: (prompt) => {
        seenPrompt = prompt;
        return Promise.resolve(proposalReply());
      },
      hint: "Focus on the Q3 renewal.",
      sourceId,
    });

    expect(seenPrompt).toContain("Focus on the Q3 renewal.");
  });
});

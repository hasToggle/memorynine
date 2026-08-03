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
import {
  buildContradictionPrompt,
  parseContradictionResponse,
  runContradictionCheck,
} from "../contradiction";
import { resolveProposalItems } from "../review";
import { currentlyValidFilter } from "../schemas/facts";

const uri = process.env.MONGODB_TEST_URI;
const TENANT = "test-tenant";
const now = () => ({ createdAt: new Date(), updatedAt: new Date() });
const unknownIdPattern = /unknown fact id/i;

describe("buildContradictionPrompt", () => {
  test("groups the candidates it shows by category", () => {
    const prompt = buildContradictionPrompt({
      anchorName: "Anna Schmidt",
      facts: [
        {
          category: "preference",
          id: "a".repeat(24),
          text: "Bevorzugt Vormittage.",
        },
        {
          category: "preference",
          id: "b".repeat(24),
          text: "Bevorzugt Nachmittage.",
        },
      ],
    });

    expect(prompt).toContain("Anna Schmidt");
    expect(prompt).toContain("preference");
    expect(prompt).toContain("Bevorzugt Vormittage.");
    expect(prompt).toContain("a".repeat(24));
  });
});

describe("parseContradictionResponse", () => {
  test("reads a resolution list", () => {
    const parsed = parseContradictionResponse(
      JSON.stringify({
        resolutions: [
          {
            category: "preference",
            confidence: 0.9,
            supersedes: ["a".repeat(24), "b".repeat(24)],
            text: "Bevorzugt inzwischen Nachmittage.",
          },
        ],
      })
    );

    expect(parsed.kind).toBe("resolutions");
  });

  test("reads the skip token", () => {
    const parsed = parseContradictionResponse(
      JSON.stringify({ reason: "no contradictions", skip: true })
    );

    expect(parsed.kind).toBe("skip");
  });

  test("an empty resolution list is a skip, not a proposal", () => {
    const parsed = parseContradictionResponse(
      JSON.stringify({ resolutions: [] })
    );

    expect(parsed.kind).toBe("skip");
  });
});

describe.skipIf(!uri)("runContradictionCheck", () => {
  const client = new MongoClient(uri ?? "mongodb://localhost:27017");
  const db = client.db("knowledge_test_contradiction");
  const { facts, people, proposals } = getCollections(db);
  const personId = new ObjectId();
  const anchor = { id: personId, kind: "person" as const };
  let older: ObjectId;
  let newer: ObjectId;

  const insertFact = async (text: string, validFrom: Date) => {
    const _id = new ObjectId();
    await facts.insertOne({
      _id,
      anchors: { personId },
      category: "preference",
      confidence: 0.8,
      confirmedBy: "user_ceo1",
      sourceId: new ObjectId(),
      tenantId: TENANT,
      text,
      validFrom,
      ...now(),
    });
    return _id;
  };

  const reply = () =>
    JSON.stringify({
      resolutions: [
        {
          category: "preference",
          confidence: 0.9,
          supersedes: [older.toHexString(), newer.toHexString()],
          text: "Bevorzugt inzwischen Nachmittage.",
        },
      ],
    });

  beforeAll(async () => {
    await client.connect();
    await db.dropDatabase();
    await ensureIndexes(db);
    await people.insertOne({
      _id: personId,
      emails: [],
      name: "Anna Schmidt",
      tenantId: TENANT,
      ...now(),
    });
  });

  beforeEach(async () => {
    await Promise.all([facts.deleteMany({}), proposals.deleteMany({})]);
    older = await insertFact(
      "Bevorzugt Vormittage.",
      new Date("2026-01-10T00:00:00.000Z")
    );
    newer = await insertFact(
      "Bevorzugt Nachmittage.",
      new Date("2026-06-01T00:00:00.000Z")
    );
  });

  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
  });

  test("proposes a resolution that supersedes both sides", async () => {
    const result = await runContradictionCheck(db, TENANT, {
      anchor,
      generate: () => Promise.resolve(reply()),
    });

    expect(result.status).toBe("proposed");
    const proposal = await proposals.findOne({ _id: result.proposalId });
    expect(proposal?.kind).toBe("contradiction");
    expect(proposal?.factDrafts[0]?.supersedes).toHaveLength(2);
    expect(proposal?.factDrafts[0]?.anchors.personId?.equals(personId)).toBe(
      true
    );
  });

  test("skips an anchor with fewer than two comparable facts", async () => {
    await facts.deleteMany({ _id: newer });

    const result = await runContradictionCheck(db, TENANT, {
      anchor,
      generate: () => Promise.reject(new Error("must not be called")),
    });

    expect(result.status).toBe("skipped");
    expect(await proposals.countDocuments({})).toBe(0);
  });

  test("rejects a resolution that supersedes a fact it was not shown", async () => {
    const result = await runContradictionCheck(db, TENANT, {
      anchor,
      generate: () =>
        Promise.resolve(
          JSON.stringify({
            resolutions: [
              {
                category: "preference",
                confidence: 0.9,
                supersedes: [older.toHexString(), new ObjectId().toHexString()],
                text: "Erfunden.",
              },
            ],
          })
        ),
    });

    expect(result.status).toBe("failure");
    expect(result.reason).toMatch(unknownIdPattern);
    expect(await proposals.countDocuments({})).toBe(0);
  });

  test("a confirmed resolution retires both sides end to end", async () => {
    const run = await runContradictionCheck(db, TENANT, {
      anchor,
      generate: () => Promise.resolve(reply()),
    });

    const resolved = await resolveProposalItems(db, TENANT, {
      facts: [{ action: "confirm", index: 0 }],
      proposalId: run.proposalId as ObjectId,
      resolvedBy: "user_ceo1",
    });

    const created = await facts.findOne({
      _id: resolved.createdFactIds[0] as ObjectId,
    });
    // Provenance is the facts it resolves, exactly like a consolidation merge.
    expect(created?.derivedFrom).toHaveLength(2);
    expect(created?.sourceId).toBeUndefined();

    const current = await facts
      .find({ tenantId: TENANT, ...currentlyValidFilter })
      .toArray();
    expect(current).toHaveLength(1);
    expect(current[0]?._id.equals(created?._id as ObjectId)).toBe(true);
  });
});

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
import { resolveProposalItems } from "../review";
import { currentlyValidFilter, factSchema } from "../schemas/facts";
import { factDraftSchema } from "../schemas/proposals";

const uri = process.env.MONGODB_TEST_URI;
const TENANT = "test-tenant";
const now = () => ({ createdAt: new Date(), updatedAt: new Date() });

const base = {
  _id: new ObjectId(),
  createdAt: new Date(),
  tenantId: TENANT,
  updatedAt: new Date(),
};

const supersedePattern = /supersede/i;
const alreadySupersededPattern = /already superseded/i;
const notFoundPattern = /not found|does not exist/i;

describe("factSchema provenance", () => {
  test("accepts a consolidated fact with derivedFrom and no sourceId", () => {
    const result = factSchema.safeParse({
      ...base,
      anchors: { personId: new ObjectId() },
      category: "preference",
      confidence: 0.9,
      confirmedBy: "user_ceo1",
      derivedFrom: [new ObjectId(), new ObjectId()],
      text: "Bevorzugt Termine am Vormittag, nie freitags.",
    });
    expect(result.success).toBe(true);
    expect(result.data?.derivedFrom).toHaveLength(2);
  });

  test("rejects a fact with neither sourceId nor derivedFrom", () => {
    const result = factSchema.safeParse({
      ...base,
      anchors: { personId: new ObjectId() },
      category: "preference",
      confidence: 0.9,
      confirmedBy: "user_ceo1",
      text: "Bevorzugt Termine am Vormittag.",
    });
    expect(result.success).toBe(false);
  });

  test("rejects an empty derivedFrom without sourceId", () => {
    const result = factSchema.safeParse({
      ...base,
      anchors: { personId: new ObjectId() },
      category: "preference",
      confidence: 0.9,
      confirmedBy: "user_ceo1",
      derivedFrom: [],
      text: "Bevorzugt Termine am Vormittag.",
    });
    expect(result.success).toBe(false);
  });
});

describe("factDraftSchema supersedes", () => {
  test("keeps the supersedes list on a draft", () => {
    const supersededId = new ObjectId();
    const result = factDraftSchema.safeParse({
      anchors: { personId: new ObjectId() },
      category: "preference",
      confidence: 0.85,
      supersedes: [supersededId],
      text: "Bevorzugt inzwischen Termine am Nachmittag.",
    });
    expect(result.success).toBe(true);
    expect(result.data?.supersedes?.[0]?.equals(supersededId)).toBe(true);
  });
});

describe.skipIf(!uri)("resolveProposalItems supersession", () => {
  const client = new MongoClient(uri ?? "mongodb://localhost:27017");
  const db = client.db("knowledge_test_supersession");
  const { facts, sources, proposals } = getCollections(db);
  const personId = new ObjectId();
  let oldFactA: ObjectId;
  let oldFactB: ObjectId;
  let sourceId: ObjectId;

  const insertOldFact = async (text: string): Promise<ObjectId> => {
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
      ...now(),
    });
    return _id;
  };

  const insertConsolidationProposal = async (
    factDrafts: Record<string, unknown>[]
  ): Promise<ObjectId> => {
    const _id = new ObjectId();
    await proposals.insertOne({
      _id,
      entityDrafts: [],
      factDrafts: factDrafts.map((draft) => ({
        resolution: { status: "pending" },
        ...draft,
      })),
      kind: "consolidation",
      status: "open",
      tenantId: TENANT,
      ...now(),
    } as never);
    return _id;
  };

  beforeAll(async () => {
    await client.connect();
    await db.dropDatabase();
    await ensureIndexes(db);
  });

  beforeEach(async () => {
    await Promise.all([
      facts.deleteMany({}),
      sources.deleteMany({}),
      proposals.deleteMany({}),
    ]);
    oldFactA = await insertOldFact("Bevorzugt Termine am Vormittag.");
    oldFactB = await insertOldFact("Freitags nie erreichbar.");
    sourceId = new ObjectId();
    await sources.insertOne({
      _id: sourceId,
      capturedBy: "user_ceo1",
      content: "Notiz nach dem Telefonat.",
      status: "proposed",
      tenantId: TENANT,
      type: "voice",
      ...now(),
    });
  });

  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
  });

  test("confirming a consolidation draft merges facts and retires the originals", async () => {
    const proposalId = await insertConsolidationProposal([
      {
        anchors: { personId },
        category: "preference",
        confidence: 0.9,
        supersedes: [oldFactA, oldFactB],
        text: "Bevorzugt Termine am Vormittag; freitags nie erreichbar.",
      },
    ]);

    const result = await resolveProposalItems(db, TENANT, {
      facts: [{ action: "confirm", index: 0 }],
      proposalId,
      resolvedBy: "user_ceo1",
    });

    expect(result.proposalResolved).toBe(true);
    expect(result.createdFactIds).toHaveLength(1);
    const mergedId = result.createdFactIds[0] as ObjectId;

    const merged = await facts.findOne({ _id: mergedId });
    const byHex = (a: string, b: string) => a.localeCompare(b);
    expect(merged?.sourceId).toBeUndefined();
    expect(
      merged?.derivedFrom?.map((id) => id.toHexString()).sort(byHex)
    ).toEqual([oldFactA, oldFactB].map((id) => id.toHexString()).sort(byHex));

    const retiredA = await facts.findOne({ _id: oldFactA });
    const retiredB = await facts.findOne({ _id: oldFactB });
    expect(retiredA?.supersededBy?.equals(mergedId)).toBe(true);
    expect(retiredB?.supersededBy?.equals(mergedId)).toBe(true);

    // The lifecycle filter now excludes the originals and keeps the merge.
    const current = await facts
      .find({ tenantId: TENANT, ...currentlyValidFilter })
      .toArray();
    expect(current).toHaveLength(1);
    expect(current[0]?._id.equals(mergedId)).toBe(true);
  });

  test("re-running the same consolidation decisions is idempotent", async () => {
    const proposalId = await insertConsolidationProposal([
      {
        anchors: { personId },
        category: "preference",
        confidence: 0.9,
        supersedes: [oldFactA, oldFactB],
        text: "Bevorzugt Termine am Vormittag; freitags nie erreichbar.",
      },
    ]);
    const input = {
      facts: [{ action: "confirm", index: 0 } as const],
      proposalId,
      resolvedBy: "user_ceo1",
    };

    const first = await resolveProposalItems(db, TENANT, { ...input });
    const second = await resolveProposalItems(db, TENANT, { ...input });

    expect(second.proposalResolved).toBe(true);
    expect(await facts.countDocuments({ tenantId: TENANT })).toBe(3);
    const retiredA = await facts.findOne({ _id: oldFactA });
    expect(
      retiredA?.supersededBy?.equals(first.createdFactIds[0] as ObjectId)
    ).toBe(true);
  });

  test("an ingestion draft with supersedes keeps its sourceId and retires the target", async () => {
    const proposalId = new ObjectId();
    await proposals.insertOne({
      _id: proposalId,
      entityDrafts: [],
      factDrafts: [
        {
          anchors: { personId },
          category: "preference",
          confidence: 0.9,
          resolution: { status: "pending" },
          supersedes: [oldFactA],
          text: "Bevorzugt inzwischen Termine am Nachmittag.",
        },
      ],
      kind: "ingestion",
      sourceId,
      status: "open",
      tenantId: TENANT,
      ...now(),
    } as never);

    const result = await resolveProposalItems(db, TENANT, {
      facts: [{ action: "confirm", index: 0 }],
      proposalId,
      resolvedBy: "user_ceo1",
    });

    const created = await facts.findOne({
      _id: result.createdFactIds[0] as ObjectId,
    });
    expect(created?.sourceId?.equals(sourceId)).toBe(true);
    expect(created?.derivedFrom).toBeUndefined();
    const retired = await facts.findOne({ _id: oldFactA });
    expect(
      retired?.supersededBy?.equals(result.createdFactIds[0] as ObjectId)
    ).toBe(true);
  });

  test("rejects a consolidation draft that supersedes nothing", async () => {
    const proposalId = await insertConsolidationProposal([
      {
        anchors: { personId },
        category: "preference",
        confidence: 0.9,
        text: "Zusammenfassung ohne Herkunft.",
      },
    ]);

    await expect(
      resolveProposalItems(db, TENANT, {
        facts: [{ action: "confirm", index: 0 }],
        proposalId,
        resolvedBy: "user_ceo1",
      })
    ).rejects.toThrow(supersedePattern);
    expect(await facts.countDocuments({ tenantId: TENANT })).toBe(2);
  });

  test("rejects superseding a fact already superseded by a different fact", async () => {
    const otherId = new ObjectId();
    await facts.updateOne(
      { _id: oldFactA },
      { $set: { supersededBy: otherId } }
    );
    const proposalId = await insertConsolidationProposal([
      {
        anchors: { personId },
        category: "preference",
        confidence: 0.9,
        supersedes: [oldFactA, oldFactB],
        text: "Bevorzugt Termine am Vormittag; freitags nie erreichbar.",
      },
    ]);

    await expect(
      resolveProposalItems(db, TENANT, {
        facts: [{ action: "confirm", index: 0 }],
        proposalId,
        resolvedBy: "user_ceo1",
      })
    ).rejects.toThrow(alreadySupersededPattern);
    // All-or-nothing: the untouched target must not have been stamped.
    const untouched = await facts.findOne({ _id: oldFactB });
    expect(untouched?.supersededBy).toBeUndefined();
  });

  test("rejects superseding a fact that does not exist", async () => {
    const proposalId = await insertConsolidationProposal([
      {
        anchors: { personId },
        category: "preference",
        confidence: 0.9,
        supersedes: [new ObjectId()],
        text: "Verweist auf eine gelöschte Notiz.",
      },
    ]);

    await expect(
      resolveProposalItems(db, TENANT, {
        facts: [{ action: "confirm", index: 0 }],
        proposalId,
        resolvedBy: "user_ceo1",
      })
    ).rejects.toThrow(notFoundPattern);
  });
});

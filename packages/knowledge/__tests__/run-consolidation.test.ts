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
import { runConsolidation, sweepConsolidation } from "../consolidation";
import { resolveProposalItems } from "../review";
import { currentlyValidFilter } from "../schemas/facts";

const uri = process.env.MONGODB_TEST_URI;
const TENANT = "test-tenant";
const now = () => ({ createdAt: new Date(), updatedAt: new Date() });

describe.skipIf(!uri)("runConsolidation", () => {
  const client = new MongoClient(uri ?? "mongodb://localhost:27017");
  const db = client.db("knowledge_test_consolidation");
  const { facts, organizations, proposals } = getCollections(db);
  const orgId = new ObjectId();
  const anchor = { id: orgId, kind: "organization" as const };
  let factIds: ObjectId[] = [];

  const mergeReply = () =>
    JSON.stringify({
      merges: [
        {
          category: "preference",
          confidence: 0.9,
          supersedes: [factIds[0]?.toHexString(), factIds[1]?.toHexString()],
          text: "Bevorzugt Termine am Vormittag; freitags nie erreichbar.",
        },
      ],
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
    await Promise.all([facts.deleteMany({}), proposals.deleteMany({})]);
    factIds = [];
    for (let i = 0; i < 4; i += 1) {
      const _id = new ObjectId();
      factIds.push(_id);
      // biome-ignore lint/performance/noAwaitInLoops: tiny fixture setup
      await facts.insertOne({
        _id,
        anchors: { organizationId: orgId },
        category: "preference",
        confidence: 0.8,
        confirmedBy: "user_ceo1",
        sourceId: new ObjectId(),
        tenantId: TENANT,
        text: `Fakt Nummer ${i}.`,
        ...now(),
      });
    }
  });

  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
  });

  test("proposes merges as a consolidation proposal", async () => {
    const result = await runConsolidation(db, TENANT, {
      anchor,
      generate: () => Promise.resolve(mergeReply()),
      minFacts: 3,
    });

    expect(result.status).toBe("proposed");
    const proposal = await proposals.findOne({ _id: result.proposalId });
    expect(proposal?.kind).toBe("consolidation");
    expect(proposal?.sourceId).toBeUndefined();
    expect(proposal?.factDrafts[0]?.supersedes).toHaveLength(2);
    expect(proposal?.factDrafts[0]?.anchors.organizationId?.equals(orgId)).toBe(
      true
    );
  });

  test("a confirmed consolidation retires the merged facts end to end", async () => {
    const run = await runConsolidation(db, TENANT, {
      anchor,
      generate: () => Promise.resolve(mergeReply()),
      minFacts: 3,
    });
    const resolved = await resolveProposalItems(db, TENANT, {
      facts: [{ action: "confirm", index: 0 }],
      proposalId: run.proposalId as ObjectId,
      resolvedBy: "user_ceo1",
    });

    expect(resolved.createdFactIds).toHaveLength(1);
    const current = await facts
      .find({ tenantId: TENANT, ...currentlyValidFilter })
      .toArray();
    // 4 facts − 2 merged + 1 merge result = 3 currently valid.
    expect(current).toHaveLength(3);
    const merged = await facts.findOne({
      _id: resolved.createdFactIds[0] as ObjectId,
    });
    expect(merged?.derivedFrom).toHaveLength(2);
  });

  test("skips below the minFacts threshold without calling the model", async () => {
    const result = await runConsolidation(db, TENANT, {
      anchor,
      generate: () => Promise.reject(new Error("must not be called")),
      minFacts: 5,
    });
    expect(result.status).toBe("skipped");
  });

  test("an open proposal for the anchor blocks a second proposal", async () => {
    await runConsolidation(db, TENANT, {
      anchor,
      generate: () => Promise.resolve(mergeReply()),
      minFacts: 3,
    });
    // A new fact changes the fact set, so the deterministic id differs —
    // only the open-proposal guard prevents a parallel proposal.
    await facts.insertOne({
      _id: new ObjectId(),
      anchors: { organizationId: orgId },
      category: "logistics",
      confidence: 0.9,
      confirmedBy: "user_ceo1",
      sourceId: new ObjectId(),
      tenantId: TENANT,
      text: "Neuer Fakt.",
      ...now(),
    });
    const second = await runConsolidation(db, TENANT, {
      anchor,
      generate: () => Promise.reject(new Error("must not be called")),
      minFacts: 3,
    });

    expect(second.status).toBe("skipped");
    expect(second.reason).toContain("open consolidation proposal");
    expect(await proposals.countDocuments({})).toBe(1);
  });

  test("a reviewed fact set is not re-proposed until the facts change", async () => {
    const run = await runConsolidation(db, TENANT, {
      anchor,
      generate: () => Promise.resolve(mergeReply()),
      minFacts: 3,
    });
    await resolveProposalItems(db, TENANT, {
      facts: [{ action: "discard", index: 0 }],
      proposalId: run.proposalId as ObjectId,
      resolvedBy: "user_ceo1",
    });

    const again = await runConsolidation(db, TENANT, {
      anchor,
      generate: () => Promise.reject(new Error("must not be called")),
      minFacts: 3,
    });
    expect(again.status).toBe("skipped");
    expect(again.reason).toContain("already reviewed");
  });

  test("hallucinated merge ids are a failure, not a proposal", async () => {
    const result = await runConsolidation(db, TENANT, {
      anchor,
      generate: () =>
        Promise.resolve(
          JSON.stringify({
            merges: [
              {
                category: "preference",
                confidence: 0.9,
                supersedes: [
                  new ObjectId().toHexString(),
                  new ObjectId().toHexString(),
                ],
                text: "x",
              },
            ],
          })
        ),
      minFacts: 3,
    });

    expect(result.status).toBe("failure");
    expect(await proposals.countDocuments({})).toBe(0);
  });
});

describe.skipIf(!uri)("sweepConsolidation", () => {
  const client = new MongoClient(uri ?? "mongodb://localhost:27017");
  const db = client.db("knowledge_test_consolidation_sweep");
  const { facts, organizations, people, proposals } = getCollections(db);

  beforeAll(async () => {
    await client.connect();
    await db.dropDatabase();
    await ensureIndexes(db);
  });

  beforeEach(async () => {
    await Promise.all([
      facts.deleteMany({}),
      organizations.deleteMany({}),
      people.deleteMany({}),
      proposals.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
  });

  const seedAnchor = async (
    tenantId: string,
    kind: "organization" | "person",
    factCount: number
  ): Promise<ObjectId> => {
    const _id = new ObjectId();
    if (kind === "organization") {
      await organizations.insertOne({
        _id,
        domains: [],
        name: "Nordwind GmbH",
        status: "active",
        tenantId,
        ...now(),
      });
    } else {
      await people.insertOne({
        _id,
        emails: [],
        name: "Anna Müller",
        tenantId,
        ...now(),
      });
    }
    for (let i = 0; i < factCount; i += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: tiny fixture setup
      await facts.insertOne({
        _id: new ObjectId(),
        anchors:
          kind === "organization" ? { organizationId: _id } : { personId: _id },
        category: "preference",
        confidence: 0.8,
        confirmedBy: "user_ceo1",
        sourceId: new ObjectId(),
        tenantId,
        text: `Fakt ${i}.`,
        ...now(),
      });
    }
    return _id;
  };

  test("finds anchors over the threshold across tenants and kinds", async () => {
    await seedAnchor("tenant-a", "organization", 3);
    await seedAnchor("tenant-b", "person", 3);
    await seedAnchor("tenant-a", "person", 1); // below threshold

    const seenPrompts: string[] = [];
    const report = await sweepConsolidation(db, {
      generate: (prompt) => {
        seenPrompts.push(prompt);
        return Promise.resolve('{"skip": true, "reason": "keine Redundanz"}');
      },
      minFacts: 3,
    });

    expect(seenPrompts).toHaveLength(2);
    expect(report.skipped).toBe(2);
    expect(report.proposed).toBe(0);
    expect(report.failures).toEqual([]);
  });

  test("one anchor failing does not stop the sweep", async () => {
    await seedAnchor("tenant-a", "organization", 3);
    await seedAnchor("tenant-b", "person", 3);

    let call = 0;
    const report = await sweepConsolidation(db, {
      generate: () => {
        call += 1;
        return call === 1
          ? Promise.reject(new Error("gateway down"))
          : Promise.resolve('{"skip": true, "reason": "ok"}');
      },
      minFacts: 3,
    });

    expect(report.failures).toHaveLength(1);
    expect(report.skipped).toBe(1);
  });
});

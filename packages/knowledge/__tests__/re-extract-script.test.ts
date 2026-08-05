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
import {
  buildSkippedSourcesPipeline,
  formatSourceReportLine,
  type SkippedSourceRow,
} from "../scripts/re-extract";

describe("buildSkippedSourcesPipeline", () => {
  test("selects only sources whose latest proposal was skipped", () => {
    const pipeline = buildSkippedSourcesPipeline({
      before: new Date("2026-09-01"),
      tenantId: "t1",
    });
    const json = JSON.stringify(pipeline);
    expect(json).toContain("skipReason");
    expect(json).toContain("t1"); // tenant scoping is not optional
  });

  test("omits the tenant filter entirely when not narrowed", () => {
    const pipeline = buildSkippedSourcesPipeline({
      before: new Date("2026-09-01"),
    });
    const match = pipeline[0] as { $match: Record<string, unknown> };
    expect(match.$match).not.toHaveProperty("tenantId");
  });

  test("scopes to ingestion proposals only — consolidation/contradiction carry no generation or skipReason", () => {
    const pipeline = buildSkippedSourcesPipeline({
      before: new Date("2026-09-01"),
    });
    const match = pipeline[0] as { $match: Record<string, unknown> };
    expect(match.$match.kind).toBe("ingestion");
  });

  test("sorts by generation descending within a source before grouping, so $first picks the latest", () => {
    const pipeline = buildSkippedSourcesPipeline({
      before: new Date("2026-09-01"),
    });
    const sortStage = pipeline.find((stage) => "$sort" in stage) as {
      $sort: Record<string, number>;
    };
    expect(sortStage.$sort.sourceId).toBe(1);
    expect(sortStage.$sort.extractionGeneration).toBe(-1);
  });

  test("appends a $limit stage only when a limit is given", () => {
    const withLimit = buildSkippedSourcesPipeline({
      before: new Date("2026-09-01"),
      limit: 5,
    });
    expect(withLimit.at(-1)).toEqual({ $limit: 5 });

    const withoutLimit = buildSkippedSourcesPipeline({
      before: new Date("2026-09-01"),
    });
    expect(withoutLimit.some((stage) => "$limit" in stage)).toBe(false);
  });
});

describe("formatSourceReportLine", () => {
  test("includes id, generation and outcome with no reason", () => {
    const line = formatSourceReportLine({
      generation: 2,
      outcome: "proposed",
      sourceId: "abc123",
    });
    expect(line).toContain("abc123");
    expect(line).toContain("gen 2");
    expect(line).toContain("proposed");
    expect(line).not.toContain("(");
  });

  test("appends the reason in parentheses when there is one", () => {
    const line = formatSourceReportLine({
      generation: 1,
      outcome: "skipped",
      reason: "greetings only, no business knowledge",
      sourceId: "abc123",
    });
    expect(line).toContain("(greetings only, no business knowledge)");
  });
});

// Integration coverage for the subtlety the pure pipeline exists to get
// right: "skipped" means the source's MOST RECENT proposal was a skip, not
// "has ever had a skip". Runs against a real Mongo so $sort→$group→$first
// is verified as actual aggregation behaviour, not assumed.
const uri = process.env.MONGODB_TEST_URI;
const TENANT = "test-tenant";
const now = () => ({ createdAt: new Date(), updatedAt: new Date() });

describe.skipIf(!uri)("buildSkippedSourcesPipeline against Mongo", () => {
  const client = new MongoClient(uri ?? "mongodb://localhost:27017");
  const db = client.db("knowledge_test_re_extract_script");
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

  const insertSource = async (sourceId: ObjectId, generation: number) =>
    sources.insertOne({
      _id: sourceId,
      capturedBy: "user_ceo1",
      content: "content",
      extractionGeneration: generation,
      status: "proposed",
      tenantId: TENANT,
      type: "manual",
      ...now(),
    });

  const insertProposal = async (
    sourceId: ObjectId,
    generation: number,
    skipReason?: string
  ) =>
    proposals.insertOne({
      _id: proposalIdFor(TENANT, sourceId, generation),
      createdAt: new Date(),
      entityDrafts: [],
      extractionGeneration: generation,
      factDrafts: [],
      kind: "ingestion",
      sourceId,
      status: "open",
      tenantId: TENANT,
      updatedAt: new Date(),
      ...(skipReason ? { skipReason } : {}),
    });

  const run = () => {
    const pipeline = buildSkippedSourcesPipeline({
      before: new Date(Date.now() + 60_000),
    });
    return proposals.aggregate<SkippedSourceRow>(pipeline).toArray();
  };

  test("a source skipped once and never re-extracted is selected", async () => {
    const sourceId = new ObjectId();
    await insertSource(sourceId, 1);
    await insertProposal(sourceId, 1, "greetings only");

    const rows = await run();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sourceId.equals(sourceId)).toBe(true);
    expect(rows[0]?.generation).toBe(1);
    expect(rows[0]?.skipReason).toBe("greetings only");
  });

  test("a source skipped at generation 1 then successfully extracted at generation 2 is NOT reselected", async () => {
    const sourceId = new ObjectId();
    await insertSource(sourceId, 2);
    await insertProposal(sourceId, 1, "greetings only");
    await insertProposal(sourceId, 2); // no skipReason: a real proposal

    const rows = await run();
    expect(rows).toHaveLength(0);
  });

  test("a source skipped again at generation 2, after a generation-1 skip, is still selected exactly once", async () => {
    const sourceId = new ObjectId();
    await insertSource(sourceId, 2);
    await insertProposal(sourceId, 1, "greetings only");
    await insertProposal(sourceId, 2, "still nothing to record");

    const rows = await run();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.generation).toBe(2);
    expect(rows[0]?.skipReason).toBe("still nothing to record");
  });

  test("respects the tenant filter", async () => {
    const sourceId = new ObjectId();
    await insertSource(sourceId, 1);
    await insertProposal(sourceId, 1, "greetings only");

    const pipeline = buildSkippedSourcesPipeline({
      before: new Date(Date.now() + 60_000),
      tenantId: "some-other-tenant",
    });
    const rows = await proposals
      .aggregate<SkippedSourceRow>(pipeline)
      .toArray();
    expect(rows).toHaveLength(0);
  });
});

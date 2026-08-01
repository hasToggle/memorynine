import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { MongoClient, ObjectId } from "mongodb";
import { ensureIndexes, getCollections } from "../collections";

const uri = process.env.MONGODB_TEST_URI;
const DUPLICATE_KEY_REGEX = /duplicate key/;

describe.skipIf(!uri)("collections", () => {
  const client = new MongoClient(uri ?? "mongodb://localhost:27017");
  const db = client.db("knowledge_test_collections");

  beforeAll(async () => {
    await client.connect();
    await db.dropDatabase();
    await ensureIndexes(db);
  });

  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
  });

  test("ensureIndexes is idempotent", async () => {
    const indexes = await getCollections(db).facts.indexes();
    const names = indexes.map((index) => index.name);
    expect(names).toContain("tenant_org_anchor");
    expect(names).toContain("tenant_person_anchor");

    await ensureIndexes(db); // second run must not throw
    const indexesAfterRerun = await getCollections(db).facts.indexes();
    expect(indexesAfterRerun.length).toBe(indexes.length);
  });

  test("round-trips a typed fact document", async () => {
    const { facts } = getCollections(db);
    const orgId = new ObjectId();
    const { insertedId } = await facts.insertOne({
      _id: new ObjectId(),
      anchors: { organizationId: orgId },
      category: "preference",
      confidence: 0.9,
      confirmedBy: "user_ceo1",
      createdAt: new Date(),
      sourceId: new ObjectId(),
      tenantId: "test-tenant",
      text: "Bevorzugt Präsenz-Workshops.",
      updatedAt: new Date(),
    });
    const found = await facts.findOne({ _id: insertedId });
    expect(found?.anchors.organizationId?.equals(orgId)).toBe(true);
  });

  test("rejects duplicate gmailMessageId per tenant", async () => {
    const { sources } = getCollections(db);
    const emailSource = {
      capturedBy: "user_ceo1",
      createdAt: new Date(),
      email: {
        forwardedBy: "ceo1@seminarco.de",
        gmailMessageId: "dup-123",
        originalSender: "a@b.de",
        sentAt: new Date(),
        subject: "S",
      },
      status: "received" as const,
      tenantId: "test-tenant",
      type: "email" as const,
      updatedAt: new Date(),
    };
    await sources.insertOne({ ...emailSource, _id: new ObjectId() });
    await expect(
      sources.insertOne({ ...emailSource, _id: new ObjectId() })
    ).rejects.toThrow(DUPLICATE_KEY_REGEX);
  });

  test("allows multiple sources without email per tenant", async () => {
    const { sources } = getCollections(db);
    const voiceSource = {
      capturedBy: "user_ceo1",
      createdAt: new Date(),
      status: "received" as const,
      tenantId: "test-tenant",
      type: "voice" as const,
      updatedAt: new Date(),
    };
    await sources.insertOne({ ...voiceSource, _id: new ObjectId() });
    await sources.insertOne({ ...voiceSource, _id: new ObjectId() });

    expect(
      await sources.countDocuments({
        tenantId: "test-tenant",
        type: "voice",
      })
    ).toBe(2);
  });

  test("accepts the same gmailMessageId for a different tenant", async () => {
    const { sources } = getCollections(db);
    // The "dup-123" gmailMessageId already exists for tenant "test-tenant"
    // from the duplicate-key test above; the unique index is scoped per
    // tenant, so the same message id under a different tenant must succeed.
    await expect(
      sources.insertOne({
        _id: new ObjectId(),
        capturedBy: "user_ceo1",
        createdAt: new Date(),
        email: {
          forwardedBy: "ceo1@seminarco.de",
          gmailMessageId: "dup-123",
          originalSender: "a@b.de",
          sentAt: new Date(),
          subject: "S",
        },
        status: "received" as const,
        tenantId: "other-tenant",
        type: "email" as const,
        updatedAt: new Date(),
      })
    ).resolves.toBeDefined();
  });
});

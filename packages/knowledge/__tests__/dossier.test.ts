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
import { composeDossier, refreshDossier } from "../dossier";
import { erasePerson } from "../erasure";
import type { Fact } from "../schemas/facts";

const uri = process.env.MONGODB_TEST_URI;
const TENANT = "test-tenant";
const now = () => ({ createdAt: new Date(), updatedAt: new Date() });
const truncationMarkerPattern = /\+\d+ (older )?facts?/;

const makeFact = (
  text: string,
  category: Fact["category"],
  updatedAt: Date
): Fact => ({
  _id: new ObjectId(),
  anchors: { organizationId: new ObjectId() },
  category,
  confidence: 0.9,
  confirmedBy: "user_ceo1",
  createdAt: updatedAt,
  sourceId: new ObjectId(),
  tenantId: TENANT,
  text,
  updatedAt,
});

describe("composeDossier", () => {
  test("groups facts under their category and includes the anchor name", () => {
    const content = composeDossier("Nordwind GmbH", [
      makeFact("Bevorzugt Termine am Vormittag.", "preference", new Date()),
      makeFact(
        "Budgetfreigabe dauert zwei Wochen.",
        "decision-process",
        new Date()
      ),
    ]);

    expect(content).toContain("Nordwind GmbH");
    expect(content).toContain("preference");
    expect(content).toContain("decision-process");
    expect(content).toContain("Bevorzugt Termine am Vormittag.");
    expect(content).toContain("Budgetfreigabe dauert zwei Wochen.");
  });

  test("stays within the token budget and keeps the newest facts", () => {
    const facts = Array.from({ length: 100 }, (_, i) =>
      makeFact(
        `Faktum Nummer ${i}: eine ausführliche Notiz über Präferenzen und Abläufe im Unternehmen.`,
        "background",
        new Date(2026, 0, 1 + i)
      )
    );
    const budgetTokens = 150;
    const content = composeDossier("Nordwind GmbH", facts, { budgetTokens });

    // chars≈tokens*4 heuristic; allow slack for the truncation marker line.
    expect(content.length).toBeLessThanOrEqual(budgetTokens * 4 + 80);
    expect(content).toContain("Faktum Nummer 99");
    expect(content).not.toContain("Faktum Nummer 0:");
    expect(content).toMatch(truncationMarkerPattern);
  });
});

describe.skipIf(!uri)("refreshDossier", () => {
  const client = new MongoClient(uri ?? "mongodb://localhost:27017");
  const db = client.db("knowledge_test_dossier");
  const { dossiers, facts, organizations } = getCollections(db);
  const orgId = new ObjectId();

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
    await Promise.all([facts.deleteMany({}), dossiers.deleteMany({})]);
  });

  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
  });

  const insertOrgFact = async (
    text: string,
    extra: Partial<Fact> = {}
  ): Promise<ObjectId> => {
    const _id = new ObjectId();
    await facts.insertOne({
      _id,
      anchors: { organizationId: orgId },
      category: "preference",
      confidence: 0.9,
      confirmedBy: "user_ceo1",
      sourceId: new ObjectId(),
      tenantId: TENANT,
      text,
      ...now(),
      ...extra,
    });
    return _id;
  };

  test("materializes a dossier from currently valid facts only", async () => {
    await insertOrgFact("Bevorzugt Termine am Vormittag.");
    await insertOrgFact("Veraltet: freitags erreichbar.", {
      supersededBy: new ObjectId(),
    });

    const dossier = await refreshDossier(db, TENANT, {
      id: orgId,
      kind: "organization",
    });

    expect(dossier?.factCount).toBe(1);
    expect(dossier?.content).toContain("Bevorzugt Termine am Vormittag.");
    expect(dossier?.content).not.toContain("Veraltet");
    expect(dossier?.anchor.id.equals(orgId)).toBe(true);

    const stored = await dossiers.findOne({ tenantId: TENANT });
    expect(stored?.content).toBe(dossier?.content);
  });

  test("refresh is an upsert — one dossier per anchor", async () => {
    await insertOrgFact("Erster Fakt.");
    await refreshDossier(db, TENANT, { id: orgId, kind: "organization" });
    await insertOrgFact("Zweiter Fakt.");
    const second = await refreshDossier(db, TENANT, {
      id: orgId,
      kind: "organization",
    });

    expect(await dossiers.countDocuments({ tenantId: TENANT })).toBe(1);
    expect(second?.factCount).toBe(2);
  });

  test("erasePerson wipes the tenant's dossier cache", async () => {
    const { people } = getCollections(db);
    const personId = new ObjectId();
    await people.insertOne({
      _id: personId,
      emails: [],
      name: "Tom Test",
      tenantId: TENANT,
      ...now(),
    });
    await insertOrgFact("Bevorzugt Termine am Vormittag.");
    await refreshDossier(db, TENANT, { id: orgId, kind: "organization" });

    const report = await erasePerson(db, TENANT, personId);

    // Dossiers are derived caches: any of them may embed the erased person's
    // name inside fact texts, so the whole tenant cache is dropped.
    expect(report.dossiersDeleted).toBe(1);
    expect(await dossiers.countDocuments({ tenantId: TENANT })).toBe(0);
  });

  test("removes the dossier when no valid facts remain", async () => {
    await insertOrgFact("Einziger Fakt.");
    await refreshDossier(db, TENANT, { id: orgId, kind: "organization" });
    await facts.deleteMany({ tenantId: TENANT });

    const dossier = await refreshDossier(db, TENANT, {
      id: orgId,
      kind: "organization",
    });

    expect(dossier).toBeNull();
    expect(await dossiers.countDocuments({ tenantId: TENANT })).toBe(0);
  });
});

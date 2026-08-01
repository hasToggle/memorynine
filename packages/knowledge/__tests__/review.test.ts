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

const uri = process.env.MONGODB_TEST_URI;
const TENANT = "test-tenant";
const now = () => ({ createdAt: new Date(), updatedAt: new Date() });
const orgDraftPattern = /org-1/;
const finalTextPattern = /finalText/;

describe.skipIf(!uri)("resolveProposalItems", () => {
  const client = new MongoClient(uri ?? "mongodb://localhost:27017");
  const db = client.db("knowledge_test_review");
  const { organizations, people, facts, sources, proposals } =
    getCollections(db);
  const existingPersonId = new ObjectId();
  let sourceId: ObjectId;
  let proposalId: ObjectId;

  beforeAll(async () => {
    await client.connect();
    await db.dropDatabase();
    await ensureIndexes(db);
    await people.insertOne({
      _id: existingPersonId,
      emails: ["frank@bestand.de"],
      name: "Frank Bestand",
      tenantId: TENANT,
      ...now(),
    });
  });

  beforeEach(async () => {
    await Promise.all([
      organizations.deleteMany({}),
      facts.deleteMany({}),
      sources.deleteMany({}),
      proposals.deleteMany({}),
    ]);
    sourceId = new ObjectId();
    proposalId = new ObjectId();
    await sources.insertOne({
      _id: sourceId,
      capturedBy: "user_ceo1",
      content: "Notiz nach dem Telefonat.",
      status: "proposed",
      tenantId: TENANT,
      type: "voice",
      ...now(),
    });
    await proposals.insertOne({
      _id: proposalId,
      entityDrafts: [
        {
          data: { name: "Nordwind GmbH", status: "lead" },
          draftId: "org-1",
          entityType: "organization",
          resolution: { status: "pending" },
        },
      ],
      factDrafts: [
        {
          anchors: { organizationDraftId: "org-1" },
          category: "decision-process",
          confidence: 0.8,
          resolution: { status: "pending" },
          text: "Entscheidungen trifft die Geschäftsführung gemeinsam.",
        },
        {
          anchors: { personId: existingPersonId },
          category: "preference",
          confidence: 0.9,
          resolution: { status: "pending" },
          text: "Bevorzugt Termine am Vormittag.",
        },
      ],
      kind: "ingestion",
      sourceId,
      status: "open",
      tenantId: TENANT,
      ...now(),
    });
  });

  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
  });

  test("confirms entity drafts and facts anchored to them", async () => {
    const result = await resolveProposalItems(db, TENANT, {
      entities: [{ action: "confirm", draftId: "org-1" }],
      facts: [
        { action: "confirm", index: 0 },
        { action: "confirm", index: 1 },
      ],
      proposalId,
      resolvedBy: "user_ceo1",
    });

    const orgId = result.createdEntityIds["org-1"];
    expect(orgId).toBeDefined();
    const org = await organizations.findOne({ _id: orgId });
    expect(org?.name).toBe("Nordwind GmbH");
    expect(org?.status).toBe("lead");
    expect(org?.tenantId).toBe(TENANT);
    expect(org?.domains).toEqual([]);

    const storedFacts = await facts
      .find({ tenantId: TENANT })
      .sort({ category: 1 })
      .toArray();
    expect(storedFacts).toHaveLength(2);
    const orgFact = storedFacts.find(
      (fact) => fact.category === "decision-process"
    );
    expect(orgFact?.anchors.organizationId?.equals(orgId as ObjectId)).toBe(
      true
    );
    expect(orgFact?.confirmedBy).toBe("user_ceo1");
    expect(orgFact?.sourceId.equals(sourceId)).toBe(true);
    const personFact = storedFacts.find(
      (fact) => fact.category === "preference"
    );
    expect(personFact?.anchors.personId?.equals(existingPersonId)).toBe(true);

    expect(result.proposalResolved).toBe(true);
    const proposal = await proposals.findOne({ _id: proposalId });
    expect(proposal?.status).toBe("resolved");
    expect(proposal?.resolvedBy).toBe("user_ceo1");
    expect(proposal?.resolvedAt).toBeInstanceOf(Date);
    expect(proposal?.entityDrafts[0]?.resolution.status).toBe("confirmed");
    expect(
      proposal?.entityDrafts[0]?.resolution.createdEntityId?.equals(
        orgId as ObjectId
      )
    ).toBe(true);
    expect(proposal?.factDrafts[0]?.resolution.status).toBe("confirmed");
    expect(proposal?.factDrafts[0]?.resolution.factId).toBeDefined();

    const source = await sources.findOne({ _id: sourceId });
    expect(source?.status).toBe("reviewed");
  });

  test("edit decisions store finalText and use it as the fact text", async () => {
    await resolveProposalItems(db, TENANT, {
      entities: [{ action: "discard", draftId: "org-1" }],
      facts: [
        { action: "discard", index: 0 },
        {
          action: "edit",
          finalText: "Bevorzugt Termine am Vormittag, nie freitags.",
          index: 1,
        },
      ],
      proposalId,
      resolvedBy: "user_ceo2",
    });

    const fact = await facts.findOne({ tenantId: TENANT });
    expect(fact?.text).toBe("Bevorzugt Termine am Vormittag, nie freitags.");
    const proposal = await proposals.findOne({ _id: proposalId });
    expect(proposal?.factDrafts[1]?.resolution.status).toBe("edited");
    expect(proposal?.factDrafts[1]?.resolution.finalText).toBe(
      "Bevorzugt Termine am Vormittag, nie freitags."
    );
  });

  test("discard decisions resolve the proposal without writing knowledge", async () => {
    const result = await resolveProposalItems(db, TENANT, {
      entities: [{ action: "discard", draftId: "org-1" }],
      facts: [
        { action: "discard", index: 0 },
        { action: "discard", index: 1 },
      ],
      proposalId,
      resolvedBy: "user_ceo1",
    });

    expect(result.proposalResolved).toBe(true);
    expect(result.createdFactIds).toHaveLength(0);
    expect(await organizations.countDocuments({})).toBe(0);
    expect(await facts.countDocuments({})).toBe(0);
    const proposal = await proposals.findOne({ _id: proposalId });
    expect(proposal?.status).toBe("resolved");
  });

  test("partial decisions leave the proposal open for later items", async () => {
    const result = await resolveProposalItems(db, TENANT, {
      facts: [{ action: "confirm", index: 1 }],
      proposalId,
      resolvedBy: "user_ceo1",
    });

    expect(result.proposalResolved).toBe(false);
    const proposal = await proposals.findOne({ _id: proposalId });
    expect(proposal?.status).toBe("open");
    expect(proposal?.factDrafts[1]?.resolution.status).toBe("confirmed");
    expect(proposal?.entityDrafts[0]?.resolution.status).toBe("pending");
    const source = await sources.findOne({ _id: sourceId });
    expect(source?.status).toBe("proposed");
  });

  test("re-running the same decisions creates nothing twice", async () => {
    const input = {
      entities: [{ action: "confirm", draftId: "org-1" }] as const,
      facts: [
        { action: "confirm", index: 0 },
        { action: "confirm", index: 1 },
      ] as const,
      proposalId,
      resolvedBy: "user_ceo1",
    };
    await resolveProposalItems(db, TENANT, {
      entities: [...input.entities],
      facts: [...input.facts],
      proposalId,
      resolvedBy: "user_ceo1",
    });
    const second = await resolveProposalItems(db, TENANT, {
      entities: [...input.entities],
      facts: [...input.facts],
      proposalId,
      resolvedBy: "user_ceo1",
    });

    expect(second.proposalResolved).toBe(true);
    expect(await organizations.countDocuments({})).toBe(1);
    expect(await facts.countDocuments({})).toBe(2);
  });

  test("rejects a fact confirmation anchored to a discarded entity draft", async () => {
    await expect(
      resolveProposalItems(db, TENANT, {
        entities: [{ action: "discard", draftId: "org-1" }],
        facts: [{ action: "confirm", index: 0 }],
        proposalId,
        resolvedBy: "user_ceo1",
      })
    ).rejects.toThrow(orgDraftPattern);
    // Validation is all-or-nothing: nothing may have been written.
    expect(await facts.countDocuments({})).toBe(0);
    const proposal = await proposals.findOne({ _id: proposalId });
    expect(proposal?.entityDrafts[0]?.resolution.status).toBe("pending");
  });

  test("validates entity draft data against the strict schema", async () => {
    await proposals.updateOne(
      { _id: proposalId },
      { $set: { "entityDrafts.0.data": { status: "lead" } } }
    );
    await expect(
      resolveProposalItems(db, TENANT, {
        entities: [{ action: "confirm", draftId: "org-1" }],
        proposalId,
        resolvedBy: "user_ceo1",
      })
    ).rejects.toThrow(orgDraftPattern);
  });

  test("requires finalText for edit decisions", async () => {
    await expect(
      resolveProposalItems(db, TENANT, {
        facts: [{ action: "edit", index: 1 }],
        proposalId,
        resolvedBy: "user_ceo1",
      })
    ).rejects.toThrow(finalTextPattern);
  });
});

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { MongoClient, ObjectId } from "mongodb";
import { ensureIndexes, getCollections } from "../collections";
import { erasePerson } from "../erasure";

const uri = process.env.MONGODB_TEST_URI;
const TENANT = "test-tenant";
const now = () => ({ createdAt: new Date(), updatedAt: new Date() });
const annaIdentifiersPattern = /Anna Schmidt|anna@mueller\.de/i;
const annaNamePattern = /Anna Schmidt/i;
const leaIdentifiersPattern = /Lea|kunde\.de/;
const leaNamePattern = /Lea Sommer/;

describe.skipIf(!uri)("erasePerson", () => {
  const client = new MongoClient(uri ?? "mongodb://localhost:27017");
  const db = client.db("knowledge_test_erasure");
  const personId = new ObjectId();
  const orgId = new ObjectId();
  const voiceSourceId = new ObjectId(); // only person-facts → becomes orphaned
  const mixedSourceId = new ObjectId(); // person + org facts → redacted only

  beforeAll(async () => {
    await client.connect();
    await db.dropDatabase();
    await ensureIndexes(db);
    const { organizations, people, sources, facts, proposals } =
      getCollections(db);

    await organizations.insertOne({
      _id: orgId,
      domains: [],
      name: "Müller GmbH",
      status: "active",
      tenantId: TENANT,
      ...now(),
    });
    await people.insertOne({
      _id: personId,
      emails: ["anna@mueller.de"],
      name: "Anna Schmidt",
      organizationId: orgId,
      tenantId: TENANT,
      ...now(),
    });
    await sources.insertOne({
      _id: voiceSourceId,
      audio: {
        blobUrl: "https://blob.example/voice1.m4a",
        contentType: "audio/mp4",
      },
      capturedBy: "user_ceo1",
      content: "Anna Schmidt sagte, das Budget kommt von anna@mueller.de.",
      status: "reviewed",
      tenantId: TENANT,
      type: "voice",
      ...now(),
    });
    await sources.insertOne({
      _id: mixedSourceId,
      capturedBy: "user_ceo2",
      content: "Anna Schmidt und die Geschäftsführung planen das Q3-Programm.",
      email: {
        forwardedBy: "ceo@seminarco.de",
        gmailMessageId: "msg-1",
        originalSender: "anna@mueller.de",
        sentAt: new Date(),
        subject: "Q3 mit Anna Schmidt",
      },
      status: "reviewed",
      tenantId: TENANT,
      type: "email",
      ...now(),
    });
    await facts.insertMany([
      {
        _id: new ObjectId(),
        anchors: { personId },
        category: "preference",
        confidence: 0.9,
        confirmedBy: "user_ceo1",
        sourceId: voiceSourceId,
        tenantId: TENANT,
        text: "Anna bevorzugt Workshops.",
        ...now(),
      },
      {
        _id: new ObjectId(),
        anchors: { organizationId: orgId, personId },
        category: "decision-process",
        confidence: 0.8,
        confirmedBy: "user_ceo1",
        sourceId: mixedSourceId,
        tenantId: TENANT,
        text: "Anna entscheidet über Budgets.",
        ...now(),
      },
      {
        _id: new ObjectId(),
        anchors: { organizationId: orgId },
        category: "background",
        confidence: 0.9,
        confirmedBy: "user_ceo2",
        sourceId: mixedSourceId,
        tenantId: TENANT,
        text: "Firma plant Q3-Programm.",
        ...now(),
      },
    ]);
    await proposals.insertOne({
      _id: new ObjectId(),
      entityDrafts: [],
      factDrafts: [
        {
          anchors: { personId },
          category: "relationship",
          confidence: 0.7,
          resolution: { status: "pending" },
          text: "Anna wechselt die Rolle.",
        },
      ],
      kind: "ingestion",
      status: "open",
      tenantId: TENANT,
      ...now(),
    });
  });

  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
  });

  test("cascades: facts deleted, sources redacted, person gone, drafts discarded", async () => {
    const report = await erasePerson(db, TENANT, personId);
    expect(report.personDeleted).toBe(true);
    expect(report.factsDeleted).toBe(2);
    expect(report.sourcesRedacted).toBe(2);
    expect(report.redactionSkipped).toBe(false);
    expect(report.orphanedBlobUrls).toEqual([
      "https://blob.example/voice1.m4a",
    ]);

    const { people, facts, sources, proposals } = getCollections(db);
    expect(await people.findOne({ _id: personId })).toBeNull();

    // org-only fact survives
    expect(await facts.countDocuments({ tenantId: TENANT })).toBe(1);

    // no identifier remains in any source text field
    const voice = await sources.findOne({ _id: voiceSourceId });
    expect(voice?.content).not.toMatch(annaIdentifiersPattern);
    expect(voice?.content).toContain("[REDACTED]");
    const mixed = await sources.findOne({ _id: mixedSourceId });
    expect(mixed?.email?.subject).not.toMatch(annaNamePattern);
    expect(mixed?.email?.originalSender).toBe("[REDACTED]");

    // pending draft about the person is discarded
    const proposal = await proposals.findOne({ tenantId: TENANT });
    expect(proposal?.factDrafts[0]?.resolution.status).toBe("discarded");
  });

  test("is a no-op for an unknown person", async () => {
    const report = await erasePerson(db, TENANT, new ObjectId());
    expect(report.personDeleted).toBe(false);
    expect(report.factsDeleted).toBe(0);
    expect(report.redactionSkipped).toBe(false);
  });

  test("leaves already-reviewed drafts untouched when discarding pending ones", async () => {
    const { people, proposals } = getCollections(db);
    const reviewedPersonId = new ObjectId();
    const confirmedFactId = new ObjectId();
    await people.insertOne({
      _id: reviewedPersonId,
      emails: ["max@berger-consulting.de"],
      name: "Max Berger",
      tenantId: TENANT,
      ...now(),
    });
    const proposalId = new ObjectId();
    await proposals.insertOne({
      _id: proposalId,
      entityDrafts: [],
      factDrafts: [
        {
          anchors: { personId: reviewedPersonId },
          category: "preference",
          confidence: 0.9,
          resolution: { factId: confirmedFactId, status: "confirmed" },
          text: "Bevorzugt Vormittagstermine.",
        },
        {
          anchors: { personId: reviewedPersonId },
          category: "logistics",
          confidence: 0.6,
          resolution: { status: "pending" },
          text: "Wechselt das Büro.",
        },
      ],
      kind: "ingestion",
      status: "open",
      tenantId: TENANT,
      ...now(),
    });

    await erasePerson(db, TENANT, reviewedPersonId);

    const after = await proposals.findOne({ _id: proposalId });
    // The reviewer's past decision is history, not something erasure rewrites.
    expect(after?.factDrafts[0]?.resolution.status).toBe("confirmed");
    expect(after?.factDrafts[1]?.resolution.status).toBe("discarded");
  });

  test("never touches another tenant's data", async () => {
    const { people, sources, proposals } = getCollections(db);
    const otherSourceId = new ObjectId();
    const otherProposalId = new ObjectId();
    const doppelgaengerId = new ObjectId();
    // Same name in a different tenant — nothing of theirs may change.
    await people.insertOne({
      _id: doppelgaengerId,
      emails: ["kim@anderswo.de"],
      name: "Kim Larsen",
      tenantId: "other-tenant",
      ...now(),
    });
    await sources.insertOne({
      _id: otherSourceId,
      capturedBy: "user_other",
      content: "Kim Larsen bleibt Ansprechpartnerin.",
      status: "reviewed",
      tenantId: "other-tenant",
      type: "manual",
      ...now(),
    });
    await proposals.insertOne({
      _id: otherProposalId,
      entityDrafts: [],
      factDrafts: [
        {
          anchors: { personId: doppelgaengerId },
          category: "background",
          confidence: 0.5,
          resolution: { status: "pending" },
          text: "Kim Larsen kennt das Projekt.",
        },
      ],
      kind: "ingestion",
      status: "open",
      tenantId: "other-tenant",
      ...now(),
    });
    const erasedId = new ObjectId();
    await people.insertOne({
      _id: erasedId,
      emails: ["kim@kunde.de"],
      name: "Kim Larsen",
      tenantId: TENANT,
      ...now(),
    });

    const report = await erasePerson(db, TENANT, erasedId);
    expect(report.personDeleted).toBe(true);

    const otherSource = await sources.findOne({ _id: otherSourceId });
    expect(otherSource?.content).toBe("Kim Larsen bleibt Ansprechpartnerin.");
    const otherProposal = await proposals.findOne({ _id: otherProposalId });
    expect(otherProposal?.factDrafts[0]?.text).toBe(
      "Kim Larsen kennt das Projekt."
    );
    expect(otherProposal?.factDrafts[0]?.resolution.status).toBe("pending");
    expect(await people.findOne({ _id: doppelgaengerId })).not.toBeNull();
  });

  test("redacts standalone name tokens, not just the full name", async () => {
    const { people, sources } = getCollections(db);
    const petraId = new ObjectId();
    const petraSourceId = new ObjectId();
    await people.insertOne({
      _id: petraId,
      emails: [],
      name: "Petra Lindemann",
      tenantId: TENANT,
      ...now(),
    });
    await sources.insertOne({
      _id: petraSourceId,
      capturedBy: "user_ceo1",
      content:
        "Petra will das Angebot prüfen. Petras Assistenz meldet sich. Die Petrafix GmbH bleibt außen vor.",
      status: "reviewed",
      tenantId: TENANT,
      type: "manual",
      ...now(),
    });

    const report = await erasePerson(db, TENANT, petraId);
    expect(report.sourcesRedacted).toBe(1);

    const after = await sources.findOne({ _id: petraSourceId });
    // Voice notes speak in first names: bare tokens and the genitive form
    // must go; substrings inside other words must survive.
    expect(after?.content).toContain("[REDACTED] will das Angebot");
    expect(after?.content).toContain("[REDACTED] Assistenz");
    expect(after?.content).toContain("Petrafix GmbH");
  });

  test("marks orphaned-blob sources as blobsPendingDeletion", async () => {
    const { people, sources, facts } = getCollections(db);
    const tomId = new ObjectId();
    const tomSourceId = new ObjectId();
    await people.insertOne({
      _id: tomId,
      emails: ["tom@example.de"],
      name: "Tom Weber",
      tenantId: TENANT,
      ...now(),
    });
    await sources.insertOne({
      _id: tomSourceId,
      audio: {
        blobUrl: "https://blob.example/tom.m4a",
        contentType: "audio/mp4",
      },
      capturedBy: "user_ceo1",
      content: "Tom Weber über Logistik.",
      status: "reviewed",
      tenantId: TENANT,
      type: "voice",
      ...now(),
    });
    await facts.insertOne({
      _id: new ObjectId(),
      anchors: { personId: tomId },
      category: "logistics",
      confidence: 0.8,
      confirmedBy: "user_ceo1",
      sourceId: tomSourceId,
      tenantId: TENANT,
      text: "Logistik läuft über ihn.",
      ...now(),
    });

    const report = await erasePerson(db, TENANT, tomId);
    expect(report.orphanedBlobUrls).toEqual(["https://blob.example/tom.m4a"]);

    // The report alone is ephemeral — a caller crash between report and Blob
    // deletion must leave a persistent marker to sweep by.
    const after = await sources.findOne({ _id: tomSourceId });
    expect(after?.blobsPendingDeletion).toBe(true);
  });

  test("reports attachment blobs of orphaned email sources", async () => {
    const { people, sources, facts } = getCollections(db);
    const idaId = new ObjectId();
    const idaSourceId = new ObjectId();
    await people.insertOne({
      _id: idaId,
      emails: ["ida@nordwind.de"],
      name: "Ida Brandt",
      tenantId: TENANT,
      ...now(),
    });
    await sources.insertOne({
      _id: idaSourceId,
      attachments: [
        {
          blobUrl: "https://blob.example/vertrag.pdf",
          contentType: "application/pdf",
          filename: "Vertrag.pdf",
        },
        {
          blobUrl: "https://blob.example/anhang2.pdf",
          contentType: "application/pdf",
          filename: "Anhang2.pdf",
        },
      ],
      capturedBy: "user_ceo1",
      content: "Vertragsentwurf von Ida Brandt.",
      email: {
        forwardedBy: "ceo@seminarco.de",
        gmailMessageId: "msg-ida-1",
        originalSender: "ida@nordwind.de",
        sentAt: new Date(),
        subject: "Vertrag",
      },
      status: "reviewed",
      tenantId: TENANT,
      type: "email",
      ...now(),
    });
    await facts.insertOne({
      _id: new ObjectId(),
      anchors: { personId: idaId },
      category: "logistics",
      confidence: 0.7,
      confirmedBy: "user_ceo1",
      sourceId: idaSourceId,
      tenantId: TENANT,
      text: "Vertrag kommt per Anhang.",
      ...now(),
    });

    const report = await erasePerson(db, TENANT, idaId);
    expect(report.orphanedBlobUrls).toEqual([
      "https://blob.example/vertrag.pdf",
      "https://blob.example/anhang2.pdf",
    ]);
    const after = await sources.findOne({ _id: idaSourceId });
    expect(after?.blobsPendingDeletion).toBe(true);
  });

  test("redacts person identifiers inside proposal drafts, including resolved ones", async () => {
    const { people, proposals } = getCollections(db);
    const leaId = new ObjectId();
    const openId = new ObjectId();
    const resolvedId = new ObjectId();
    await people.insertOne({
      _id: leaId,
      emails: ["lea@kunde.de"],
      name: "Lea Sommer",
      tenantId: TENANT,
      ...now(),
    });
    await proposals.insertOne({
      _id: openId,
      entityDrafts: [
        {
          data: { emails: ["lea@kunde.de"], name: "Lea Sommer" },
          draftId: "p-1",
          entityType: "person",
          resolution: { status: "pending" },
        },
      ],
      factDrafts: [
        {
          anchors: { personDraftId: "p-1" },
          category: "background",
          confidence: 0.5,
          resolution: { status: "pending" },
          text: "Lea kommt von der Messe.",
        },
      ],
      kind: "ingestion",
      status: "open",
      tenantId: TENANT,
      ...now(),
    });
    await proposals.insertOne({
      _id: resolvedId,
      entityDrafts: [],
      factDrafts: [
        {
          anchors: { organizationId: new ObjectId() },
          category: "relationship",
          confidence: 0.9,
          resolution: {
            finalText: "Ansprechpartnerin ist Lea Sommer.",
            status: "edited",
          },
          text: "Kontakt läuft über Lea Sommer.",
        },
      ],
      kind: "ingestion",
      resolvedAt: new Date(),
      resolvedBy: "user_ceo1",
      status: "resolved",
      tenantId: TENANT,
      ...now(),
    });

    const report = await erasePerson(db, TENANT, leaId);
    // Proposals are the retained audit trail — Art. 17 reaches into them too.
    expect(report.proposalsRedacted).toBe(2);

    const open = await proposals.findOne({ _id: openId });
    expect(open?.factDrafts[0]?.text).toContain("[REDACTED]");
    expect(JSON.stringify(open?.entityDrafts[0]?.data)).not.toMatch(
      leaIdentifiersPattern
    );
    const resolved = await proposals.findOne({ _id: resolvedId });
    expect(resolved?.factDrafts[0]?.text).not.toMatch(leaNamePattern);
    expect(resolved?.factDrafts[0]?.resolution.finalText).not.toMatch(
      leaNamePattern
    );
  });

  test("skips redaction when the person has no usable identifiers", async () => {
    const { people, sources } = getCollections(db);
    const shortPersonId = new ObjectId();
    await people.insertOne({
      _id: shortPersonId,
      emails: [],
      name: "Al",
      tenantId: TENANT,
      ...now(),
    });

    const before = await sources.findOne({ _id: mixedSourceId });
    const report = await erasePerson(db, TENANT, shortPersonId);
    expect(report.personDeleted).toBe(true);
    expect(report.sourcesRedacted).toBe(0);
    expect(report.redactionSkipped).toBe(true);

    const after = await sources.findOne({ _id: mixedSourceId });
    expect(after?.content).toBe(before?.content);
    expect(after?.email?.originalSender).toBe(before?.email?.originalSender);
  });
});

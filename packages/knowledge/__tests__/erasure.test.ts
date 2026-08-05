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
  erasePerson,
  listBlobCleanupCandidates,
  markSourceBlobsDeleted,
} from "../erasure";

const uri = process.env.MONGODB_TEST_URI;
const TENANT = "test-tenant";
const now = () => ({ createdAt: new Date(), updatedAt: new Date() });
const annaIdentifiersPattern = /Anna Schmidt|anna@mueller\.de/i;
const annaNamePattern = /Anna Schmidt/i;
const leaIdentifiersPattern = /Lea|kunde\.de/;
const leaNamePattern = /Lea Sommer/;
const petraNamePattern = /Petra/i;

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
        messageId: "msg-1",
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
        messageId: "msg-ida-1",
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

  test("redacts skipReason, hint, and rejectedDrafts on a skip proposal", async () => {
    const { people, proposals } = getCollections(db);
    const petraId = new ObjectId();
    const skipProposalId = new ObjectId();
    await people.insertOne({
      _id: petraId,
      emails: ["petra@acme.de"],
      name: "Petra Meier",
      tenantId: TENANT,
      ...now(),
    });
    // A skip proposal has empty factDrafts/entityDrafts by construction — the
    // only PII on it lives in these three free-text fields.
    await proposals.insertOne({
      _id: skipProposalId,
      entityDrafts: [],
      factDrafts: [],
      hint: "Das betrifft Petra Meier und den Acme-Deal",
      kind: "ingestion",
      rejectedDrafts: [
        {
          raw: { anchors: { personId: "Petra Meier" }, text: "Notiz" },
          reason: "anchors.personId: Petra Meier is not a valid id",
        },
      ],
      skipReason:
        "Nur Terminchatter von Petra Meier (petra@acme.de), kein Geschaeftswissen",
      status: "open",
      tenantId: TENANT,
      ...now(),
    });

    await erasePerson(db, TENANT, petraId);

    const after = await proposals.findOne({ _id: skipProposalId });
    expect(after?.skipReason).not.toMatch(petraNamePattern);
    expect(after?.skipReason).toContain("[REDACTED]");
    expect(after?.hint).not.toMatch(petraNamePattern);
    expect(after?.hint).toContain("[REDACTED]");
    expect(JSON.stringify(after?.rejectedDrafts)).not.toMatch(petraNamePattern);
  });

  test("redacts rejectedDrafts[].raw when it is the only field naming the person", async () => {
    // F10's own canonical case: a two-person fact is rejected for an array
    // personId, and the proposal's surviving accepted draft happens to name
    // someone else entirely. No skipReason, no hint, no person entityDrafts
    // — rejectedDrafts[].raw is the only place Petra's name appears, so the
    // proposal must become a redaction candidate on that field alone.
    const { people, proposals } = getCollections(db);
    const petraId = new ObjectId();
    const proposalId = new ObjectId();
    await people.insertOne({
      _id: petraId,
      emails: ["petra.meier@acme.de"],
      name: "Petra Meier",
      tenantId: TENANT,
      ...now(),
    });
    await proposals.insertOne({
      _id: proposalId,
      entityDrafts: [],
      factDrafts: [
        {
          anchors: { organizationId: new ObjectId() },
          category: "preference",
          confidence: 0.9,
          resolution: { status: "pending" },
          text: "Jonas Weber trinkt Kaffee schwarz.",
        },
      ],
      kind: "ingestion",
      rejectedDrafts: [
        {
          raw: { text: "Petra Meier bevorzugt Nachmittagstermine." },
          reason:
            "anchors.personId: Invalid input: expected string, received array",
        },
      ],
      status: "open",
      tenantId: TENANT,
      ...now(),
    });

    const report = await erasePerson(db, TENANT, petraId);
    expect(report.proposalsRedacted).toBe(1);

    const after = await proposals.findOne({ _id: proposalId });
    // The accepted draft naming someone else is untouched.
    expect(after?.factDrafts[0]?.text).toBe(
      "Jonas Weber trinkt Kaffee schwarz."
    );
    expect(JSON.stringify(after?.rejectedDrafts)).not.toMatch(petraNamePattern);
    expect(JSON.stringify(after?.rejectedDrafts)).toContain("[REDACTED]");
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

describe.skipIf(!uri)("blob cleanup helpers", () => {
  const client = new MongoClient(uri ?? "mongodb://localhost:27017");
  const db = client.db("knowledge_test_blob_cleanup");
  const { sources } = getCollections(db);

  beforeAll(async () => {
    await client.connect();
    await db.dropDatabase();
    await ensureIndexes(db);
  });

  beforeEach(async () => {
    await sources.deleteMany({});
  });

  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
  });

  const insertFlaggedSource = async (tenantId: string) => {
    const _id = new ObjectId();
    await sources.insertOne({
      _id,
      attachments: [
        {
          blobUrl: `https://store.private.blob.vercel-storage.com/att/${_id}.pdf`,
          contentType: "application/pdf",
          filename: "angebot.pdf",
        },
      ],
      audio: {
        blobUrl: `https://store.private.blob.vercel-storage.com/voice/${_id}.wav`,
        contentType: "audio/wav",
      },
      blobsPendingDeletion: true,
      capturedBy: "user_ceo1",
      content: "[REDACTED] Notiz.",
      createdAt: new Date(),
      status: "reviewed",
      tenantId,
      type: "voice",
      updatedAt: new Date(),
    });
    return _id;
  };

  test("lists flagged sources across tenants with all their blob urls", async () => {
    const a = await insertFlaggedSource("tenant-a");
    await insertFlaggedSource("tenant-b");
    await sources.insertOne({
      _id: new ObjectId(),
      capturedBy: "user_ceo1",
      content: "Ohne Flag.",
      createdAt: new Date(),
      status: "reviewed",
      tenantId: "tenant-a",
      type: "manual",
      updatedAt: new Date(),
    });

    const candidates = await listBlobCleanupCandidates(db);
    expect(candidates).toHaveLength(2);
    const forA = candidates.find((c) => c.sourceId.equals(a));
    expect(forA?.tenantId).toBe("tenant-a");
    expect(forA?.blobUrls).toHaveLength(2);
    expect(forA?.blobUrls[0]).toContain("voice/");
  });

  test("marking removes the blob references and the flag", async () => {
    const id = await insertFlaggedSource("tenant-a");
    await markSourceBlobsDeleted(db, "tenant-a", id);

    const source = await sources.findOne({ _id: id });
    expect(source?.audio).toBeUndefined();
    expect(source?.attachments).toBeUndefined();
    expect(source?.blobsPendingDeletion).toBeUndefined();
    // The redacted audit record itself stays.
    expect(source?.content).toBe("[REDACTED] Notiz.");

    expect(await listBlobCleanupCandidates(db)).toHaveLength(0);
  });
});

// Consolidation merges facts under a single anchor, so a merged fact about a
// person can end up anchored only to their organization. Step 1's
// anchors.personId filter cannot see it, and nothing redacts fact text — so
// the person's name survives erasure inside derived and sibling facts.
describe.skipIf(!uri)("erasePerson — derived facts and fact text", () => {
  const client = new MongoClient(uri ?? "mongodb://localhost:27017");
  const db = client.db("knowledge_test_erasure_derived");
  const personId = new ObjectId();
  const orgId = new ObjectId();
  const sourceId = new ObjectId();
  const personFactId = new ObjectId();
  const orgFactNamingPersonId = new ObjectId();
  const mergedFactId = new ObjectId();
  const deepMergeId = new ObjectId();
  const unrelatedFactId = new ObjectId();
  let report: Awaited<ReturnType<typeof erasePerson>>;

  beforeAll(async () => {
    await client.connect();
    await db.dropDatabase();
    await ensureIndexes(db);
    const { organizations, people, sources, facts } = getCollections(db);

    await organizations.insertOne({
      _id: orgId,
      domains: ["nordwind.de"],
      name: "Nordwind GmbH",
      status: "active",
      tenantId: TENANT,
      ...now(),
    });
    await people.insertOne({
      _id: personId,
      emails: ["petra@kunde.de"],
      name: "Petra Vogel",
      organizationId: orgId,
      tenantId: TENANT,
      ...now(),
    });
    await sources.insertOne({
      _id: sourceId,
      capturedBy: "user_1",
      content: "Petra Vogel kritisierte den Q3-Zeitplan.",
      status: "reviewed",
      tenantId: TENANT,
      type: "manual",
      ...now(),
    });
    await facts.insertMany([
      {
        _id: personFactId,
        anchors: { personId },
        category: "preference",
        confidence: 0.9,
        confirmedBy: "user_1",
        sourceId,
        tenantId: TENANT,
        text: "Petra Vogel bevorzugt Vormittagstermine.",
        ...now(),
      },
      // Anchored to the org only, but names the person in its text.
      {
        _id: orgFactNamingPersonId,
        anchors: { organizationId: orgId },
        category: "objection",
        confidence: 0.8,
        confirmedBy: "user_1",
        sourceId,
        tenantId: TENANT,
        text: "Petra Vogel hat den Q3-Zeitplan kritisiert.",
        ...now(),
      },
      // A consolidation merge: org-anchored, derived from a person fact.
      {
        _id: mergedFactId,
        anchors: { organizationId: orgId },
        category: "objection",
        confidence: 0.85,
        confirmedBy: "user_2",
        derivedFrom: [personFactId, orgFactNamingPersonId],
        tenantId: TENANT,
        text: "Petra Vogel und Lars Ohlsen kritisierten den Q3-Zeitplan.",
        ...now(),
      },
      // A second-generation merge, to prove the walk is transitive.
      {
        _id: deepMergeId,
        anchors: { organizationId: orgId },
        category: "background",
        confidence: 0.7,
        confirmedBy: "user_2",
        derivedFrom: [mergedFactId],
        tenantId: TENANT,
        text: "Zusammenfassung der Q3-Kritik.",
        ...now(),
      },
      {
        _id: unrelatedFactId,
        anchors: { organizationId: orgId },
        category: "background",
        confidence: 0.9,
        confirmedBy: "user_1",
        sourceId,
        tenantId: TENANT,
        text: "Firma plant Q4-Budget.",
        ...now(),
      },
    ]);

    // Erase once for the whole block: every test below asserts on the
    // resulting state, so none of them depend on another having run first.
    report = await erasePerson(db, TENANT, personId);
  });

  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
  });

  test("reports what it deleted and redacted", () => {
    expect(report.factsDeleted).toBe(1);
    expect(report.derivedFactsDeleted).toBe(2);
    expect(report.factsRedacted).toBe(1);
  });

  test("redacts the person's name from surviving facts", async () => {
    const { facts } = getCollections(db);
    const survivor = await facts.findOne({ _id: orgFactNamingPersonId });

    expect(survivor).not.toBeNull();
    expect(survivor?.text).not.toMatch(petraNamePattern);
    expect(survivor?.text).toBe("[REDACTED] hat den Q3-Zeitplan kritisiert.");
  });

  test("deletes facts derived from the erased person's facts", async () => {
    const { facts } = getCollections(db);

    expect(await facts.findOne({ _id: mergedFactId })).toBeNull();
  });

  test("follows derivedFrom transitively", async () => {
    const { facts } = getCollections(db);

    expect(await facts.findOne({ _id: deepMergeId })).toBeNull();
  });

  test("leaves unrelated facts untouched", async () => {
    const { facts } = getCollections(db);
    const untouched = await facts.findOne({ _id: unrelatedFactId });

    expect(untouched?.text).toBe("Firma plant Q4-Budget.");
  });

  test("leaves no dangling derivedFrom references", async () => {
    const { facts } = getCollections(db);
    const surviving = await facts.find({ tenantId: TENANT }).toArray();
    const liveIds = new Set(surviving.map((fact) => fact._id.toHexString()));
    const dangling = surviving.flatMap((fact) =>
      (fact.derivedFrom ?? [])
        .filter((parent) => !liveIds.has(parent.toHexString()))
        .map((parent) => `${fact._id.toHexString()} -> ${parent.toHexString()}`)
    );

    expect(dangling).toEqual([]);
  });
});

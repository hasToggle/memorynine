import type { Collection, Db, ObjectId } from "mongodb";
import { getCollections } from "./collections";
import type { Person } from "./schemas/entities";
import type { Fact } from "./schemas/facts";
import type { Proposal } from "./schemas/proposals";
import type { Source } from "./schemas/sources";

const REDACTED = "[REDACTED]";

// Depth cap for the derivedFrom walk. Consolidation merges of merges are rare
// and shallow; the cap plus the visited set makes a cycle (derivedFrom is
// written through an LLM-proposed review path) terminate instead of hanging.
const MAX_DERIVATION_DEPTH = 8;

export interface ErasureReport {
  /** Consolidated facts deleted because a parent fact was erased. */
  derivedFactsDeleted: number;
  /** Derived caches dropped wholesale; they rebuild lazily on next refresh. */
  dossiersDeleted: number;
  factsDeleted: number;
  /** Surviving facts whose text still mentioned the person. */
  factsRedacted: number;
  /** Audio and attachment blobs whose source no longer backs any fact. */
  orphanedBlobUrls: string[];
  personDeleted: boolean;
  proposalsRedacted: number;
  redactionSkipped: boolean;
  sourcesRedacted: number;
}

const WHITESPACE_REGEX = /\s+/;

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Word-ish boundaries that understand umlauts: JS \b is ASCII-only, so
// \bÖzdemir would never match after a space. Lookarounds on Unicode letters/
// digits give real token edges; the optional s covers the German genitive
// ("Petras Termin").
const tokenAlternative = (token: string) =>
  String.raw`(?<![\p{L}\p{N}_])${escapeRegex(token)}s?(?![\p{L}\p{N}_])`;

interface Redactor {
  // Case-insensitive candidate probe — plain substrings only, because MongoDB
  // $regex accepts neither the g nor the u flag. Over-matching is fine: the
  // precise pattern decides what actually changes.
  probe: RegExp;
  redact: (value: string) => string;
}

// Identifiers: the full name and emails as exact substrings, plus each name
// token (≥3 chars, word-bounded) so first-name-only mentions in transcripts
// are erased too. Over-redaction is the GDPR-safe direction.
const buildRedactor = (person: Person): Redactor | null => {
  const exact = [person.name, ...person.emails].filter(
    (identifier) => identifier.length > 2
  );
  const tokens = person.name
    .split(WHITESPACE_REGEX)
    .filter((token) => token.length > 2);
  if (exact.length === 0 && tokens.length === 0) {
    return null;
  }
  const pattern = new RegExp(
    [...exact.map(escapeRegex), ...tokens.map(tokenAlternative)].join("|"),
    "giu"
  );
  return {
    probe: new RegExp([...exact, ...tokens].map(escapeRegex).join("|"), "i"),
    redact: (value) => value.replace(pattern, REDACTED),
  };
};

const redactSources = async (
  sources: Collection<Source>,
  tenantId: string,
  { probe, redact }: Redactor
): Promise<number> => {
  const candidates = await sources
    .find({
      $or: [
        { content: { $regex: probe } },
        { "email.subject": { $regex: probe } },
        { "email.originalSender": { $regex: probe } },
      ],
      tenantId,
    })
    .toArray();

  let redacted = 0;
  for (const source of candidates) {
    const update: Record<string, unknown> = {};
    if (source.content) {
      const content = redact(source.content);
      if (content !== source.content) {
        update.content = content;
      }
    }
    if (source.email) {
      // An email address is atomic PII: any hit redacts the whole field.
      if (redact(source.email.originalSender) !== source.email.originalSender) {
        update["email.originalSender"] = REDACTED;
      }
      const subject = redact(source.email.subject);
      if (subject !== source.email.subject) {
        update["email.subject"] = subject;
      }
    }
    if (Object.keys(update).length === 0) {
      continue;
    }
    redacted += 1;
    // biome-ignore lint/performance/noAwaitInLoops: sequential redaction is deliberate — erasure is a rare admin operation over a small set of documents
    await sources.updateOne(
      { _id: source._id, tenantId },
      { $set: { ...update, updatedAt: new Date() } }
    );
  }
  return redacted;
};

// Facts anchored elsewhere (an organization, an engagement) can still name the
// person in their text — consolidation in particular merges under a single
// anchor, so a person's statement ends up on an org-anchored fact. Deleting by
// anchor alone leaves those identifiers behind.
const redactFacts = async (
  facts: Collection<Fact>,
  tenantId: string,
  { probe, redact }: Redactor
): Promise<number> => {
  const candidates = await facts
    .find({ tenantId, text: { $regex: probe } })
    .toArray();

  let redacted = 0;
  for (const fact of candidates) {
    const text = redact(fact.text);
    if (text === fact.text) {
      continue;
    }
    redacted += 1;
    // biome-ignore lint/performance/noAwaitInLoops: sequential redaction is deliberate — erasure is a rare admin operation over a small set of documents
    await facts.updateOne(
      { _id: fact._id, tenantId },
      { $set: { text, updatedAt: new Date() } }
    );
  }
  return redacted;
};

// A consolidation merge is lossless by construction ("ZERO information loss"),
// so a fact derived from an erased person's fact still carries that person's
// information — and its provenance now points at a deleted parent. Walk the
// derivation graph forward from the deleted seeds and delete every descendant.
const deleteDerivedFacts = async (
  facts: Collection<Fact>,
  tenantId: string,
  seedIds: ObjectId[]
): Promise<number> => {
  const visited = new Set(seedIds.map((id) => id.toHexString()));
  let frontier = seedIds;
  let deleted = 0;

  for (let depth = 0; depth < MAX_DERIVATION_DEPTH; depth += 1) {
    if (frontier.length === 0) {
      break;
    }
    // biome-ignore lint/performance/noAwaitInLoops: the walk is inherently sequential — each generation's ids come from the previous one
    const children = await facts
      .find({ derivedFrom: { $in: frontier }, tenantId })
      .toArray();
    const fresh = children.filter(
      (child) => !visited.has(child._id.toHexString())
    );
    if (fresh.length === 0) {
      break;
    }
    for (const child of fresh) {
      visited.add(child._id.toHexString());
    }
    const ids = fresh.map((child) => child._id);
    const { deletedCount } = await facts.deleteMany({
      _id: { $in: ids },
      tenantId,
    });
    deleted += deletedCount;
    frontier = ids;
  }
  return deleted;
};

// Redact string values anywhere inside a loose value: entity draft data,
// or a rejected draft's unvalidated raw model output, both `z.unknown()`
// shapes that can nest (a malformed draft's "anchors" is itself an object).
// Recurses into objects and arrays; leaves every other type untouched.
// Returns the original reference when nothing changed, at every level.
const redactUnknown = (
  value: unknown,
  redact: (value: string) => string
): unknown => {
  if (typeof value === "string") {
    return redact(value);
  }
  if (Array.isArray(value)) {
    const redactedItems = value.map((item) => redactUnknown(item, redact));
    return redactedItems.some((item, index) => item !== value[index])
      ? redactedItems
      : value;
  }
  if (value !== null && typeof value === "object") {
    return redactRecord(value as Record<string, unknown>, redact);
  }
  return value;
};

const redactRecord = (
  data: Record<string, unknown>,
  redact: (value: string) => string
): Record<string, unknown> => {
  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const redactedValue = redactUnknown(value, redact);
    changed ||= redactedValue !== value;
    next[key] = redactedValue;
  }
  return changed ? next : data;
};

const redactFactDrafts = (
  factDrafts: Proposal["factDrafts"],
  redact: (value: string) => string
): { changed: boolean; factDrafts: Proposal["factDrafts"] } => {
  let changed = false;
  const next = factDrafts.map((draft) => {
    const text = redact(draft.text);
    const finalText =
      draft.resolution.finalText === undefined
        ? undefined
        : redact(draft.resolution.finalText);
    if (text === draft.text && finalText === draft.resolution.finalText) {
      return draft;
    }
    changed = true;
    return {
      ...draft,
      resolution: {
        ...draft.resolution,
        ...(finalText === undefined ? {} : { finalText }),
      },
      text,
    };
  });
  return { changed, factDrafts: next };
};

const redactEntityDrafts = (
  entityDrafts: Proposal["entityDrafts"],
  redact: (value: string) => string
): { changed: boolean; entityDrafts: Proposal["entityDrafts"] } => {
  let changed = false;
  const next = entityDrafts.map((draft) => {
    if (draft.entityType !== "person") {
      return draft;
    }
    const data = redactRecord(draft.data, redact);
    if (data === draft.data) {
      return draft;
    }
    changed = true;
    return { ...draft, data };
  });
  return { changed, entityDrafts: next };
};

// Undefined means "nothing to change" — either there were no rejected drafts
// or none of them matched, so the caller can skip the $set entry entirely.
const redactRejectedDrafts = (
  rejectedDrafts: Proposal["rejectedDrafts"],
  redact: (value: string) => string
): Proposal["rejectedDrafts"] | undefined => {
  if (!rejectedDrafts || rejectedDrafts.length === 0) {
    return;
  }
  let changed = false;
  const next = rejectedDrafts.map((draft) => {
    const reason = redact(draft.reason);
    const raw = redactUnknown(draft.raw, redact);
    if (reason === draft.reason && raw === draft.raw) {
      return draft;
    }
    changed = true;
    return { ...draft, raw, reason };
  });
  return changed ? next : undefined;
};

// Proposals are the retained audit trail (open AND resolved), so Art. 17 has
// to reach into draft texts and person-type entity drafts — and, just as
// much, into the three free-text fields a skip/rejection can carry: skipReason
// (model-authored prose that routinely quotes the source), hint (reviewer-
// authored, and the one place someone is explicitly invited to type a
// colleague's name), and rejectedDrafts (the model's raw, unvalidated output
// plus why it was rejected). A skip proposal has empty factDrafts and
// entityDrafts by construction, so without these three it is never even a
// redaction candidate. The structure — statuses, anchors, timestamps — stays:
// audit without identifiers.
const redactProposals = async (
  proposals: Collection<Proposal>,
  tenantId: string,
  { probe, redact }: Redactor
): Promise<number> => {
  const candidates = await proposals
    .find({
      $or: [
        { "factDrafts.text": { $regex: probe } },
        { "factDrafts.resolution.finalText": { $regex: probe } },
        { entityDrafts: { $elemMatch: { entityType: "person" } } },
        { hint: { $regex: probe } },
        { "rejectedDrafts.reason": { $regex: probe } },
        { skipReason: { $regex: probe } },
      ],
      tenantId,
    })
    .toArray();

  let redacted = 0;
  for (const proposal of candidates) {
    const factResult = redactFactDrafts(proposal.factDrafts, redact);
    const entityResult = redactEntityDrafts(proposal.entityDrafts, redact);
    const rejectedDrafts = redactRejectedDrafts(
      proposal.rejectedDrafts,
      redact
    );

    const update: Record<string, unknown> = {};
    if (factResult.changed || entityResult.changed) {
      update.entityDrafts = entityResult.entityDrafts;
      update.factDrafts = factResult.factDrafts;
    }
    if (proposal.skipReason !== undefined) {
      const skipReason = redact(proposal.skipReason);
      if (skipReason !== proposal.skipReason) {
        update.skipReason = skipReason;
      }
    }
    if (proposal.hint !== undefined) {
      const hint = redact(proposal.hint);
      if (hint !== proposal.hint) {
        update.hint = hint;
      }
    }
    if (rejectedDrafts !== undefined) {
      update.rejectedDrafts = rejectedDrafts;
    }

    if (Object.keys(update).length === 0) {
      continue;
    }
    redacted += 1;
    // biome-ignore lint/performance/noAwaitInLoops: sequential redaction is deliberate — erasure is a rare admin operation over a small set of documents
    await proposals.updateOne(
      { _id: proposal._id, tenantId },
      { $set: { ...update, updatedAt: new Date() } }
    );
  }
  return redacted;
};

export interface BlobCleanupCandidate {
  blobUrls: string[];
  sourceId: ObjectId;
  tenantId: string;
}

// The second half of the erasure contract: erasePerson flags sources whose
// facts are all gone (blobsPendingDeletion) and reports their blob URLs;
// the app layer deletes the blobs from storage and then calls
// markSourceBlobsDeleted. These helpers make that completion crash-safe:
// a caller that died between report and delete leaves the flag standing,
// and any later sweep finds it here.

export const listBlobCleanupCandidates = async (
  db: Db,
  limit = 50
): Promise<BlobCleanupCandidate[]> => {
  const { sources } = getCollections(db);
  const flagged = await sources
    .find({ blobsPendingDeletion: true })
    .sort({ updatedAt: 1 })
    .limit(limit)
    .toArray();
  return flagged.map((source) => ({
    blobUrls: [
      ...(source.audio ? [source.audio.blobUrl] : []),
      ...(source.attachments ?? []).map((attachment) => attachment.blobUrl),
    ],
    sourceId: source._id,
    tenantId: source.tenantId,
  }));
};

/** Call only after the listed blob URLs were actually deleted from storage. */
export const markSourceBlobsDeleted = async (
  db: Db,
  tenantId: string,
  sourceId: ObjectId
): Promise<void> => {
  const { sources } = getCollections(db);
  await sources.updateOne(
    { _id: sourceId, tenantId },
    {
      $set: { updatedAt: new Date() },
      $unset: { attachments: "", audio: "", blobsPendingDeletion: "" },
    }
  );
};

export const erasePerson = async (
  db: Db,
  tenantId: string,
  personId: ObjectId
): Promise<ErasureReport> => {
  const { people, facts, sources, proposals, dossiers } = getCollections(db);

  const person = await people.findOne({ _id: personId, tenantId });
  if (!person) {
    return {
      derivedFactsDeleted: 0,
      dossiersDeleted: 0,
      factsDeleted: 0,
      factsRedacted: 0,
      orphanedBlobUrls: [],
      personDeleted: false,
      proposalsRedacted: 0,
      redactionSkipped: false,
      sourcesRedacted: 0,
    };
  }

  // 1. Delete every fact anchored to the person; remember affected sources.
  const personFactFilter = { "anchors.personId": personId, tenantId };
  const affectedSourceIds = await facts.distinct("sourceId", personFactFilter);
  const personFactIds = await facts.distinct("_id", personFactFilter);
  const { deletedCount: factsDeleted } =
    await facts.deleteMany(personFactFilter);

  // 1b. Delete facts consolidated from those facts. An anchor-scoped delete
  //     cannot see them: consolidation writes merged facts under a single
  //     anchor, so a merge of a person fact and an org fact is anchored to the
  //     org alone — while still carrying the person's information and a now
  //     dangling derivedFrom pointer.
  const derivedFactsDeleted = await deleteDerivedFacts(
    facts,
    tenantId,
    personFactIds
  );

  // 2. Discard pending fact drafts about the person in open proposals.
  //    Already-reviewed drafts keep their status: the audit trail records
  //    what the reviewer decided, not what erasure wishes they had.
  await proposals.updateMany(
    { status: "open", tenantId },
    { $set: { "factDrafts.$[draft].resolution.status": "discarded" } },
    {
      arrayFilters: [
        {
          "draft.anchors.personId": personId,
          "draft.resolution.status": "pending",
        },
      ],
    }
  );

  // 3. Redact the person's identifiers wherever they appear: source texts and
  //    the proposal audit trail. Redaction, not deletion — a source or
  //    proposal may cover other entities too.
  const redactor = buildRedactor(person);
  let sourcesRedacted = 0;
  let proposalsRedacted = 0;
  let factsRedacted = 0;
  if (redactor) {
    sourcesRedacted = await redactSources(sources, tenantId, redactor);
    proposalsRedacted = await redactProposals(proposals, tenantId, redactor);
    // Facts anchored to other entities may still name the person in their text.
    factsRedacted = await redactFacts(facts, tenantId, redactor);
  }

  // 4. Report audio and attachment blobs whose source no longer backs any
  //    fact — the caller (app layer) deletes them from Vercel Blob. Also
  //    persist the pending deletion on the source: a caller crash between
  //    report and blob delete must not orphan the blobs forever (re-running
  //    erasePerson after the person doc is gone returns early and cannot
  //    re-derive this list).
  const orphanedBlobUrls: string[] = [];
  for (const sourceId of affectedSourceIds) {
    // biome-ignore lint/performance/noAwaitInLoops: per-source count must run after fact deletion; the affected-source set is small
    const remaining = await facts.countDocuments({ sourceId, tenantId });
    if (remaining > 0) {
      continue;
    }
    const source = await sources.findOne({ _id: sourceId, tenantId });
    if (!source) {
      continue;
    }
    const blobUrls = [
      ...(source.audio ? [source.audio.blobUrl] : []),
      ...(source.attachments ?? []).map((attachment) => attachment.blobUrl),
    ];
    if (blobUrls.length === 0) {
      continue;
    }
    orphanedBlobUrls.push(...blobUrls);
    await sources.updateOne(
      { _id: source._id, tenantId },
      { $set: { blobsPendingDeletion: true, updatedAt: new Date() } }
    );
  }

  // 5. Drop the tenant's dossier cache: any dossier may embed the person's
  //    name inside composed fact texts, and dossiers are derived data that
  //    rebuild lazily from the (now cleaned) facts.
  const { deletedCount: dossiersDeleted } = await dossiers.deleteMany({
    tenantId,
  });

  // 6. Delete the person document itself.
  await people.deleteOne({ _id: personId, tenantId });

  return {
    derivedFactsDeleted,
    dossiersDeleted,
    factsDeleted,
    factsRedacted,
    orphanedBlobUrls,
    personDeleted: true,
    proposalsRedacted,
    redactionSkipped: redactor === null,
    sourcesRedacted,
  };
};

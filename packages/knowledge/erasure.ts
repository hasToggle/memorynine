import type { Collection, Db, ObjectId } from "mongodb";
import { getCollections } from "./collections";
import type { Person } from "./schemas/entities";
import type { Proposal } from "./schemas/proposals";
import type { Source } from "./schemas/sources";

const REDACTED = "[REDACTED]";

export interface ErasureReport {
  factsDeleted: number;
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

// Redact string values (and string-array items) in an entity draft's loose
// data record. Returns the original reference when nothing changed.
const redactRecord = (
  data: Record<string, unknown>,
  redact: (value: string) => string
): Record<string, unknown> => {
  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string") {
      const redactedValue = redact(value);
      changed ||= redactedValue !== value;
      next[key] = redactedValue;
    } else if (Array.isArray(value)) {
      const redactedItems = value.map((item) =>
        typeof item === "string" ? redact(item) : item
      );
      changed ||= redactedItems.some((item, index) => item !== value[index]);
      next[key] = redactedItems;
    } else {
      next[key] = value;
    }
  }
  return changed ? next : data;
};

// Proposals are the retained audit trail (open AND resolved), so Art. 17 has
// to reach into draft texts and person-type entity drafts. The structure —
// statuses, anchors, timestamps — stays: audit without identifiers.
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
      ],
      tenantId,
    })
    .toArray();

  let redacted = 0;
  for (const proposal of candidates) {
    let changed = false;
    const factDrafts = proposal.factDrafts.map((draft) => {
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
    const entityDrafts = proposal.entityDrafts.map((draft) => {
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
    if (!changed) {
      continue;
    }
    redacted += 1;
    // biome-ignore lint/performance/noAwaitInLoops: sequential redaction is deliberate — erasure is a rare admin operation over a small set of documents
    await proposals.updateOne(
      { _id: proposal._id, tenantId },
      { $set: { entityDrafts, factDrafts, updatedAt: new Date() } }
    );
  }
  return redacted;
};

export const erasePerson = async (
  db: Db,
  tenantId: string,
  personId: ObjectId
): Promise<ErasureReport> => {
  const { people, facts, sources, proposals } = getCollections(db);

  const person = await people.findOne({ _id: personId, tenantId });
  if (!person) {
    return {
      factsDeleted: 0,
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
  const { deletedCount: factsDeleted } =
    await facts.deleteMany(personFactFilter);

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
  if (redactor) {
    sourcesRedacted = await redactSources(sources, tenantId, redactor);
    proposalsRedacted = await redactProposals(proposals, tenantId, redactor);
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

  // 5. Delete the person document itself.
  await people.deleteOne({ _id: personId, tenantId });

  return {
    factsDeleted,
    orphanedBlobUrls,
    personDeleted: true,
    proposalsRedacted,
    redactionSkipped: redactor === null,
    sourcesRedacted,
  };
};

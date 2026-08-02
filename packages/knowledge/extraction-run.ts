import type { Db, ObjectId } from "mongodb";
import { ObjectId as ObjectIdCtor } from "mongodb";
import { getCollections } from "./collections";
import {
  buildExtractionPrompt,
  type KnownEntity,
  type KnownFact,
  type LlmFactDraft,
  type ParsedExtraction,
  parseExtractionResponse,
} from "./extraction";
import { deterministicId, insertIgnoringDuplicate } from "./idempotency";
import { currentlyValidFilter } from "./schemas/facts";
import { proposalSchema } from "./schemas/proposals";
import type { Source } from "./schemas/sources";

// The extraction worker: source content → LLM → ingestion proposal, feeding
// the review queue. Everything the model may reference (anchor ids,
// supersedes targets) is validated against the exact context it was shown —
// a hallucinated id is a retryable failure, never a proposal.

export interface RunExtractionOptions {
  /** The LLM call. Injectable so tests and providers stay decoupled. */
  generate: (prompt: string) => Promise<string>;
  /** Failed attempts before the source flips to "failed". Default 3. */
  maxAttempts?: number;
  sourceId: ObjectId;
}

export interface ExtractionRunResult {
  proposalId?: ObjectId;
  reason?: string;
  status: "failed" | "proposed" | "retry" | "skipped";
}

const CONTEXT_ENTITY_LIMIT = 200;
const CONTEXT_FACT_LIMIT = 50;

const EXTRACTABLE_STATUSES = new Set(["extracting", "received", "transcribed"]);

// Referential validation: the model may only use ids it was shown.
const validateReferences = (
  facts: LlmFactDraft[],
  knownEntityIds: Set<string>,
  knownFactIds: Set<string>,
  entityDraftIds: Set<string>
): string | null => {
  for (const [index, fact] of facts.entries()) {
    const anchorIds = [
      fact.anchors.engagementId,
      fact.anchors.organizationId,
      fact.anchors.personId,
    ];
    for (const id of anchorIds) {
      if (id !== undefined && !knownEntityIds.has(id)) {
        return `facts[${index}] anchors unknown entity id ${id}`;
      }
    }
    const draftRefs = [
      fact.anchors.engagementDraftId,
      fact.anchors.organizationDraftId,
      fact.anchors.personDraftId,
    ];
    for (const draftId of draftRefs) {
      if (draftId !== undefined && !entityDraftIds.has(draftId)) {
        return `facts[${index}] anchors entity draft "${draftId}", which is not in the reply`;
      }
    }
    for (const id of fact.supersedes ?? []) {
      if (!knownFactIds.has(id)) {
        return `facts[${index}] supersedes unknown fact id ${id}`;
      }
    }
  }
  return null;
};

const toFactDraft = (fact: LlmFactDraft) => {
  const anchors: Record<string, unknown> = {};
  if (fact.anchors.engagementDraftId) {
    anchors.engagementDraftId = fact.anchors.engagementDraftId;
  }
  if (fact.anchors.engagementId) {
    anchors.engagementId = new ObjectIdCtor(fact.anchors.engagementId);
  }
  if (fact.anchors.organizationDraftId) {
    anchors.organizationDraftId = fact.anchors.organizationDraftId;
  }
  if (fact.anchors.organizationId) {
    anchors.organizationId = new ObjectIdCtor(fact.anchors.organizationId);
  }
  if (fact.anchors.personDraftId) {
    anchors.personDraftId = fact.anchors.personDraftId;
  }
  if (fact.anchors.personId) {
    anchors.personId = new ObjectIdCtor(fact.anchors.personId);
  }
  return {
    anchors,
    category: fact.category,
    confidence: fact.confidence,
    ...(fact.supersedes?.length
      ? { supersedes: fact.supersedes.map((hex) => new ObjectIdCtor(hex)) }
      : {}),
    text: fact.text,
  };
};

const gatherContext = async (db: Db, tenantId: string) => {
  const { engagements, facts, organizations, people } = getCollections(db);
  const [orgDocs, personDocs, engagementDocs, factDocs] = await Promise.all([
    organizations.find({ tenantId }).limit(CONTEXT_ENTITY_LIMIT).toArray(),
    people.find({ tenantId }).limit(CONTEXT_ENTITY_LIMIT).toArray(),
    engagements.find({ tenantId }).limit(CONTEXT_ENTITY_LIMIT).toArray(),
    facts
      .find({ tenantId, ...currentlyValidFilter })
      .sort({ updatedAt: -1 })
      .limit(CONTEXT_FACT_LIMIT)
      .toArray(),
  ]);

  const knownEntities: KnownEntity[] = [
    ...orgDocs.map((doc) => ({
      id: doc._id.toHexString(),
      kind: "organization" as const,
      name: doc.name,
    })),
    ...personDocs.map((doc) => ({
      id: doc._id.toHexString(),
      kind: "person" as const,
      name: doc.name,
    })),
    ...engagementDocs.map((doc) => ({
      id: doc._id.toHexString(),
      kind: "engagement" as const,
      name: doc.title,
    })),
  ];

  const nameById = new Map(knownEntities.map((e) => [e.id, e.name]));
  const anchorName = (fact: (typeof factDocs)[number]): string => {
    const id =
      fact.anchors.personId ??
      fact.anchors.organizationId ??
      fact.anchors.engagementId;
    return (id && nameById.get(id.toHexString())) || "unknown";
  };

  const knownFacts: KnownFact[] = factDocs.map((doc) => ({
    anchor: anchorName(doc),
    category: doc.category,
    id: doc._id.toHexString(),
    text: doc.text,
  }));

  return { knownEntities, knownFacts };
};

// Where a retryable failure returns the source to. An interrupted
// "extracting" has lost its original status; re-derive it from the type.
const restingStatusFor = (source: Source): Source["status"] => {
  if (source.status !== "extracting") {
    return source.status;
  }
  return source.type === "voice" ? "transcribed" : "received";
};

const produceParsed = async (
  generate: RunExtractionOptions["generate"],
  prompt: string
): Promise<ParsedExtraction> => {
  try {
    return parseExtractionResponse(await generate(prompt));
  } catch (error) {
    return {
      kind: "failure",
      reason: `generate failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const guardExtractable = (source: Source): void => {
  if (!EXTRACTABLE_STATUSES.has(source.status)) {
    throw new Error(
      `Source status "${source.status}" is not extractable — expected received, transcribed, or extracting`
    );
  }
  if (!source.content) {
    throw new Error("Source has no content to extract from");
  }
};

export const runExtraction = async (
  db: Db,
  tenantId: string,
  { generate, maxAttempts = 3, sourceId }: RunExtractionOptions
): Promise<ExtractionRunResult> => {
  const { proposals, sources } = getCollections(db);
  const source = await sources.findOne({ _id: sourceId, tenantId });
  if (!source) {
    throw new Error(`Source ${sourceId.toHexString()} not found`);
  }

  const proposalId = deterministicId(
    `${tenantId}:${sourceId.toHexString()}:extraction`
  );

  // Resume after a crash between proposal insert and status update: the
  // proposal is the durable record, the status just needs healing.
  const existing = await proposals.findOne({ _id: proposalId, tenantId });
  if (existing) {
    if (source.status !== "proposed" && source.status !== "reviewed") {
      await sources.updateOne(
        { _id: sourceId, tenantId },
        { $set: { status: "proposed", updatedAt: new Date() } }
      );
    }
    return { proposalId, status: "proposed" };
  }

  guardExtractable(source);
  const restingStatus = restingStatusFor(source);

  await sources.updateOne(
    { _id: sourceId, tenantId },
    { $set: { status: "extracting", updatedAt: new Date() } }
  );

  const { knownEntities, knownFacts } = await gatherContext(db, tenantId);
  const prompt = buildExtractionPrompt({
    capturedAt: source.createdAt,
    capturedBy: source.capturedBy,
    content: source.content ?? "",
    knownEntities,
    knownFacts,
    sourceType: source.type,
  });

  let parsed = await produceParsed(generate, prompt);

  if (parsed.kind === "proposal") {
    const problem = validateReferences(
      parsed.facts,
      new Set(knownEntities.map((entity) => entity.id)),
      new Set(knownFacts.map((fact) => fact.id)),
      new Set(parsed.entities.map((draft) => draft.draftId))
    );
    if (problem) {
      parsed = { kind: "failure", reason: problem };
    }
  }

  const writtenAt = new Date();

  if (parsed.kind === "proposal") {
    const doc = proposalSchema.parse({
      _id: proposalId,
      createdAt: writtenAt,
      entityDrafts: parsed.entities,
      factDrafts: parsed.facts.map(toFactDraft),
      kind: "ingestion",
      sourceId,
      status: "open",
      tenantId,
      updatedAt: writtenAt,
    });
    await insertIgnoringDuplicate(proposals, doc);
    await sources.updateOne(
      { _id: sourceId, tenantId },
      {
        $set: {
          extractionAttempts: 0,
          status: "proposed",
          updatedAt: writtenAt,
        },
        $unset: { error: "" },
      }
    );
    return { proposalId, status: "proposed" };
  }

  if (parsed.kind === "skip") {
    // Nothing worth reviewing — close the pipeline without review work.
    await sources.updateOne(
      { _id: sourceId, tenantId },
      {
        $set: {
          extractionAttempts: 0,
          status: "reviewed",
          updatedAt: writtenAt,
        },
        $unset: { error: "" },
      }
    );
    return { reason: parsed.reason, status: "skipped" };
  }

  const attempts = (source.extractionAttempts ?? 0) + 1;
  const exhausted = attempts >= maxAttempts;
  await sources.updateOne(
    { _id: sourceId, tenantId },
    {
      $set: {
        error: parsed.reason,
        extractionAttempts: attempts,
        status: exhausted ? "failed" : restingStatus,
        updatedAt: writtenAt,
      },
    }
  );
  return { reason: parsed.reason, status: exhausted ? "failed" : "retry" };
};

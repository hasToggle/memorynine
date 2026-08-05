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
import type { UsageContext } from "./gateway";
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
  generate: (prompt: string, context?: UsageContext) => Promise<string>;
  /**
   * Reviewer-supplied steer for a re-extraction pass. Threaded straight into
   * the prompt — see buildExtractionPrompt's `hint` field comment for why it
   * is trusted rather than treated as ingested source content.
   */
  hint?: string;
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
  prompt: string,
  context: UsageContext
): Promise<ParsedExtraction> => {
  try {
    return parseExtractionResponse(await generate(prompt, context));
  } catch (error) {
    return {
      kind: "failure",
      reason: `generate failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

/**
 * Proposal identity is per (source, generation). Generation 1 deliberately
 * keeps the original seed so every proposal written before re-extraction
 * existed keeps its id; only later generations get a suffix.
 */
export const proposalIdFor = (
  tenantId: string,
  sourceId: ObjectId,
  generation: number
): ObjectId =>
  deterministicId(
    generation <= 1
      ? `${tenantId}:${sourceId.toHexString()}:extraction`
      : `${tenantId}:${sourceId.toHexString()}:extraction:${generation}`
  );

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

interface ProposalDocInput {
  generation: number;
  hint: string | undefined;
  proposalId: ObjectId;
  sourceId: ObjectId;
  tenantId: string;
  writtenAt: Date;
}

const buildProposalDoc = (
  parsed: Extract<ParsedExtraction, { kind: "proposal" }>,
  {
    generation,
    hint,
    proposalId,
    sourceId,
    tenantId,
    writtenAt,
  }: ProposalDocInput
) =>
  proposalSchema.parse({
    _id: proposalId,
    createdAt: writtenAt,
    entityDrafts: parsed.entities,
    extractionGeneration: generation,
    factDrafts: parsed.facts.map(toFactDraft),
    kind: "ingestion",
    sourceId,
    status: "open",
    tenantId,
    updatedAt: writtenAt,
    ...(parsed.rejected.length > 0 ? { rejectedDrafts: parsed.rejected } : {}),
    ...(hint === undefined ? {} : { hint }),
  });

const buildSkipProposalDoc = (
  reason: string,
  {
    generation,
    hint,
    proposalId,
    sourceId,
    tenantId,
    writtenAt,
  }: ProposalDocInput
) =>
  proposalSchema.parse({
    _id: proposalId,
    createdAt: writtenAt,
    entityDrafts: [],
    extractionGeneration: generation,
    factDrafts: [],
    kind: "ingestion",
    skipReason: reason,
    sourceId,
    status: "open",
    tenantId,
    updatedAt: writtenAt,
    ...(hint === undefined ? {} : { hint }),
  });

// Both the proposal and the skip branches close out identically: the
// pipeline moves the source on to "proposed" and clears the failure budget.
const markSourceProposed = (
  sources: ReturnType<typeof getCollections>["sources"],
  sourceId: ObjectId,
  tenantId: string,
  writtenAt: Date
) =>
  sources.updateOne(
    { _id: sourceId, tenantId },
    {
      $set: { extractionAttempts: 0, status: "proposed", updatedAt: writtenAt },
      $unset: { error: "" },
    }
  );

export const runExtraction = async (
  db: Db,
  tenantId: string,
  { generate, hint, maxAttempts = 3, sourceId }: RunExtractionOptions
): Promise<ExtractionRunResult> => {
  const { proposals, sources } = getCollections(db);
  const source = await sources.findOne({ _id: sourceId, tenantId });
  if (!source) {
    throw new Error(`Source ${sourceId.toHexString()} not found`);
  }

  const generation = source.extractionGeneration ?? 1;
  const proposalId = proposalIdFor(tenantId, sourceId, generation);

  // Resume after a crash between proposal insert and status update: the
  // proposal is the durable record, the status just needs healing. The
  // proposal may itself be a skip (skipReason set) — a crash between that
  // insert and markSourceProposed must still resume as "skipped", or the
  // sweep report misattributes it as a proposal.
  const existing = await proposals.findOne({ _id: proposalId, tenantId });
  if (existing) {
    if (source.status !== "proposed" && source.status !== "reviewed") {
      await sources.updateOne(
        { _id: sourceId, tenantId },
        { $set: { status: "proposed", updatedAt: new Date() } }
      );
    }
    return existing.skipReason
      ? { proposalId, reason: existing.skipReason, status: "skipped" }
      : { proposalId, status: "proposed" };
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
    hint,
    knownEntities,
    knownFacts,
    sourceType: source.type,
  });

  let parsed = await produceParsed(generate, prompt, {
    correlationId: sourceId.toHexString(),
    operation: "extraction",
    tenantId,
  });

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

  const docInput: ProposalDocInput = {
    generation,
    hint,
    proposalId,
    sourceId,
    tenantId,
    writtenAt,
  };

  if (parsed.kind === "proposal") {
    await insertIgnoringDuplicate(
      proposals,
      buildProposalDoc(parsed, docInput)
    );
    await markSourceProposed(sources, sourceId, tenantId, writtenAt);
    return { proposalId, status: "proposed" };
  }

  if (parsed.kind === "skip") {
    // Nothing worth reviewing — but the source and the reason survive, and
    // the proposal is what makes both visible and re-extractable. Closing
    // the source here (the previous behaviour) discarded the reason and put
    // the source permanently out of reach of the sweep.
    await insertIgnoringDuplicate(
      proposals,
      buildSkipProposalDoc(parsed.reason, docInput)
    );
    await markSourceProposed(sources, sourceId, tenantId, writtenAt);
    return { proposalId, reason: parsed.reason, status: "skipped" };
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

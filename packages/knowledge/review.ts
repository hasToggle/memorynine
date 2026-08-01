import { createHash } from "node:crypto";
import {
  type Collection,
  type Db,
  type Document,
  MongoServerError,
  ObjectId,
} from "mongodb";
import { getCollections } from "./collections";
import {
  engagementSchema,
  organizationSchema,
  personSchema,
} from "./schemas/entities";
import { type Fact, factAnchorsSchema, factSchema } from "./schemas/facts";
import type { EntityDraft, FactDraft, Proposal } from "./schemas/proposals";

// The review queue's single write path: capture → proposal → HUMAN CONFIRMS →
// fact. Everything that turns drafts into knowledge goes through here, so the
// invariant "only the review queue writes knowledge" has one tested choke
// point instead of being re-implemented per server action.
//
// Crash safety without transactions: entity/fact _ids are derived
// deterministically from (proposalId, draft), so a re-run after a mid-write
// crash re-attempts the same inserts, duplicate keys are treated as already
// done, and per-draft resolutions record progress. Validation is all-or-
// nothing and runs before the first write.

export interface EntityDecision {
  action: "confirm" | "discard";
  /** Overrides merged over the draft's data before validation (UI edits). */
  data?: Record<string, unknown>;
  draftId: string;
}

export interface FactDecision {
  action: "confirm" | "discard" | "edit";
  /** Required for "edit": the corrected statement. */
  finalText?: string;
  /** Index into proposal.factDrafts — fact drafts carry no ids. */
  index: number;
}

export interface ResolveProposalItemsInput {
  entities?: EntityDecision[];
  facts?: FactDecision[];
  proposalId: ObjectId;
  resolvedBy: string;
}

export interface ResolveProposalItemsResult {
  createdEntityIds: Record<string, ObjectId>;
  createdFactIds: ObjectId[];
  /** True when no pending drafts remain on the proposal. */
  proposalResolved: boolean;
}

const BASE_KEYS = {
  _id: true,
  createdAt: true,
  tenantId: true,
  updatedAt: true,
} as const;

const entityInputSchemas = {
  engagement: engagementSchema.omit(BASE_KEYS),
  organization: organizationSchema.omit(BASE_KEYS),
  person: personSchema.omit(BASE_KEYS),
} as const;

const deterministicId = (seed: string): ObjectId =>
  new ObjectId(createHash("md5").update(seed).digest("hex").slice(0, 24));

const insertIgnoringDuplicate = async <T extends Document>(
  collection: Collection<T>,
  doc: T
): Promise<void> => {
  try {
    await collection.insertOne(doc as never);
  } catch (error) {
    const alreadyDone =
      error instanceof MongoServerError && error.code === 11_000;
    if (!alreadyDone) {
      throw error;
    }
  }
};

interface PlannedEntity {
  decision: EntityDecision;
  doc: Document;
  draft: EntityDraft;
  entityId: ObjectId;
}

interface PlannedFact {
  decision: FactDecision;
  draft: FactDraft;
  factDoc: Fact;
  factId: ObjectId;
}

const resolveDraftAnchors = (
  draft: FactDraft,
  index: number,
  entityIdByDraftId: Map<string, ObjectId>
) => {
  const resolveRef = (kind: string, draftId: string | undefined) => {
    if (draftId === undefined) {
      return;
    }
    const entityId = entityIdByDraftId.get(draftId);
    if (!entityId) {
      throw new Error(
        `factDrafts[${index}] anchors ${kind} draft "${draftId}", which is not confirmed in this or any earlier resolution`
      );
    }
    return entityId;
  };

  return factAnchorsSchema.parse({
    engagementId:
      draft.anchors.engagementId ??
      resolveRef("engagement", draft.anchors.engagementDraftId),
    organizationId:
      draft.anchors.organizationId ??
      resolveRef("organization", draft.anchors.organizationDraftId),
    personId:
      draft.anchors.personId ??
      resolveRef("person", draft.anchors.personDraftId),
  });
};

export const resolveProposalItems = async (
  db: Db,
  tenantId: string,
  {
    entities = [],
    facts: factDecisions = [],
    proposalId,
    resolvedBy,
  }: ResolveProposalItemsInput
): Promise<ResolveProposalItemsResult> => {
  const collections = getCollections(db);
  const proposal = await collections.proposals.findOne({
    _id: proposalId,
    tenantId,
  });
  if (!proposal) {
    throw new Error(`Proposal ${proposalId.toHexString()} not found`);
  }

  const planned = planResolution(proposal, entities, factDecisions, resolvedBy);
  const writtenAt = new Date();

  // Entities first: facts may anchor them.
  const createdEntityIds: Record<string, ObjectId> = {};
  for (const { decision, doc, draft, entityId } of planned.entityConfirms) {
    const target = entityCollectionFor(collections, draft);
    // biome-ignore lint/performance/noAwaitInLoops: sequential writes keep the resume order deterministic; review batches are tiny
    await insertIgnoringDuplicate(target, doc);
    await collections.proposals.updateOne(
      { _id: proposalId, tenantId },
      {
        $set: {
          "entityDrafts.$[draft].resolution": {
            createdEntityId: entityId,
            status: "confirmed",
          },
          updatedAt: writtenAt,
        },
      },
      { arrayFilters: [{ "draft.draftId": decision.draftId }] }
    );
    createdEntityIds[decision.draftId] = entityId;
  }

  for (const draftId of planned.entityDiscards) {
    // biome-ignore lint/performance/noAwaitInLoops: sequential writes keep the resume order deterministic; review batches are tiny
    await collections.proposals.updateOne(
      { _id: proposalId, tenantId },
      {
        $set: {
          "entityDrafts.$[draft].resolution.status": "discarded",
          updatedAt: writtenAt,
        },
      },
      { arrayFilters: [{ "draft.draftId": draftId }] }
    );
  }

  const createdFactIds: ObjectId[] = [];
  for (const { decision, factDoc, factId } of planned.factWrites) {
    // biome-ignore lint/performance/noAwaitInLoops: sequential writes keep the resume order deterministic; review batches are tiny
    await insertIgnoringDuplicate(collections.facts, factDoc);
    await collections.proposals.updateOne(
      { _id: proposalId, tenantId },
      {
        $set: {
          [`factDrafts.${decision.index}.resolution`]: {
            factId,
            status: decision.action === "edit" ? "edited" : "confirmed",
            ...(decision.finalText === undefined
              ? {}
              : { finalText: decision.finalText }),
          },
          updatedAt: writtenAt,
        },
      }
    );
    createdFactIds.push(factId);
  }

  for (const index of planned.factDiscards) {
    // biome-ignore lint/performance/noAwaitInLoops: sequential writes keep the resume order deterministic; review batches are tiny
    await collections.proposals.updateOne(
      { _id: proposalId, tenantId },
      {
        $set: {
          [`factDrafts.${index}.resolution.status`]: "discarded",
          updatedAt: writtenAt,
        },
      }
    );
  }

  // Close the proposal (and the source's pipeline) once nothing is pending.
  const after = await collections.proposals.findOne({
    _id: proposalId,
    tenantId,
  });
  const pendingRemain =
    after !== null &&
    (after.entityDrafts.some(
      (draft) => draft.resolution.status === "pending"
    ) ||
      after.factDrafts.some((draft) => draft.resolution.status === "pending"));

  if (!pendingRemain && after?.status === "open") {
    await collections.proposals.updateOne(
      { _id: proposalId, tenantId },
      {
        $set: {
          resolvedAt: writtenAt,
          resolvedBy,
          status: "resolved",
          updatedAt: writtenAt,
        },
      }
    );
    if (proposal.kind === "ingestion" && proposal.sourceId) {
      await collections.sources.updateOne(
        { _id: proposal.sourceId, tenantId },
        { $set: { status: "reviewed", updatedAt: writtenAt } }
      );
    }
  }

  return { createdEntityIds, createdFactIds, proposalResolved: !pendingRemain };
};

const entityCollectionFor = (
  collections: ReturnType<typeof getCollections>,
  draft: EntityDraft
): Collection<Document> => {
  switch (draft.entityType) {
    case "engagement":
      return collections.engagements as unknown as Collection<Document>;
    case "organization":
      return collections.organizations as unknown as Collection<Document>;
    default:
      return collections.people as unknown as Collection<Document>;
  }
};

const planEntityDecisions = (
  proposal: Proposal,
  entities: EntityDecision[]
) => {
  const draftById = new Map(
    proposal.entityDrafts.map((draft) => [draft.draftId, draft])
  );

  // Anchor targets: entities confirmed in earlier runs plus the ones being
  // confirmed now (their ids are deterministic, so they are known pre-write).
  const entityIdByDraftId = new Map<string, ObjectId>();
  for (const draft of proposal.entityDrafts) {
    if (draft.resolution.createdEntityId) {
      entityIdByDraftId.set(draft.draftId, draft.resolution.createdEntityId);
    }
  }

  const confirms: PlannedEntity[] = [];
  const discards: string[] = [];
  for (const decision of entities) {
    const draft = draftById.get(decision.draftId);
    if (!draft) {
      throw new Error(`Unknown entity draft "${decision.draftId}"`);
    }
    if (draft.resolution.status !== "pending") {
      continue;
    }
    if (decision.action === "discard") {
      discards.push(decision.draftId);
      continue;
    }
    const entityId = deterministicId(
      `${proposal._id.toHexString()}:entity:${decision.draftId}`
    );
    const inputSchema = entityInputSchemas[draft.entityType];
    const parsed = inputSchema.safeParse({ ...draft.data, ...decision.data });
    if (!parsed.success) {
      throw new Error(
        `Entity draft "${decision.draftId}" does not satisfy the ${draft.entityType} schema: ${parsed.error.message}`
      );
    }
    confirms.push({
      decision,
      doc: {
        ...parsed.data,
        _id: entityId,
        createdAt: new Date(),
        tenantId: proposal.tenantId,
        updatedAt: new Date(),
      },
      draft,
      entityId,
    });
    entityIdByDraftId.set(decision.draftId, entityId);
  }

  return { confirms, discards, entityIdByDraftId };
};

const planFactWrite = (
  proposal: Proposal,
  decision: FactDecision,
  draft: FactDraft,
  resolvedBy: string,
  entityIdByDraftId: Map<string, ObjectId>,
  discardedNow: Set<string>
): PlannedFact => {
  if (decision.action === "edit" && decision.finalText === undefined) {
    throw new Error(
      `factDrafts[${decision.index}]: an edit decision requires finalText`
    );
  }
  if (!proposal.sourceId) {
    throw new Error(
      "Fact drafts can only be confirmed on proposals that carry a sourceId"
    );
  }
  for (const [kind, draftId] of [
    ["engagement", draft.anchors.engagementDraftId],
    ["organization", draft.anchors.organizationDraftId],
    ["person", draft.anchors.personDraftId],
  ] as const) {
    if (draftId !== undefined && discardedNow.has(draftId)) {
      throw new Error(
        `factDrafts[${decision.index}] anchors ${kind} draft "${draftId}", which is being discarded`
      );
    }
  }
  const factId = deterministicId(
    `${proposal._id.toHexString()}:fact:${decision.index}`
  );
  const factDoc = factSchema.parse({
    _id: factId,
    anchors: resolveDraftAnchors(draft, decision.index, entityIdByDraftId),
    category: draft.category,
    confidence: draft.confidence,
    confirmedBy: resolvedBy,
    createdAt: new Date(),
    sourceId: proposal.sourceId,
    tenantId: proposal.tenantId,
    text: decision.finalText ?? draft.text,
    updatedAt: new Date(),
  });
  return { decision, draft, factDoc, factId };
};

// Validation is all-or-nothing: every decision is checked and every document
// materialized before the first write. Decisions targeting drafts that are no
// longer pending are skipped — that is what makes a crashed run re-runnable
// with the same input.
const planResolution = (
  proposal: Proposal,
  entities: EntityDecision[],
  factDecisions: FactDecision[],
  resolvedBy: string
) => {
  const entityPlan = planEntityDecisions(proposal, entities);
  const discardedNow = new Set(entityPlan.discards);

  const factWrites: PlannedFact[] = [];
  const factDiscards: number[] = [];
  for (const decision of factDecisions) {
    const draft = proposal.factDrafts[decision.index];
    if (!draft) {
      throw new Error(`factDrafts[${decision.index}] does not exist`);
    }
    if (draft.resolution.status !== "pending") {
      continue;
    }
    if (decision.action === "discard") {
      factDiscards.push(decision.index);
      continue;
    }
    factWrites.push(
      planFactWrite(
        proposal,
        decision,
        draft,
        resolvedBy,
        entityPlan.entityIdByDraftId,
        discardedNow
      )
    );
  }

  return {
    entityConfirms: entityPlan.confirms,
    entityDiscards: entityPlan.discards,
    factDiscards,
    factWrites,
  };
};

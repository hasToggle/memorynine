import { z } from "zod";
import { rejectedDraftSchema } from "../extraction";
import { factCategoryValues } from "./facts";
import { baseDocFields, zodObjectId } from "./shared";

export const entityDraftSchema = z.object({
  // Loose by design: extractor output. Validated against the strict entity
  // schemas at confirmation time, when the review queue materializes entities.
  data: z.record(z.string(), z.unknown()),
  draftId: z.string().min(1),
  entityType: z.enum(["organization", "person", "engagement"]),
  resolution: z
    .object({
      createdEntityId: zodObjectId.optional(),
      status: z.enum(["pending", "confirmed", "discarded"]),
    })
    .default({ status: "pending" }),
});
export type EntityDraft = z.infer<typeof entityDraftSchema>;

export const factDraftAnchorsSchema = z
  .object({
    engagementDraftId: z.string().optional(),
    engagementId: zodObjectId.optional(),
    organizationDraftId: z.string().optional(),
    organizationId: zodObjectId.optional(),
    personDraftId: z.string().optional(),
    personId: zodObjectId.optional(),
  })
  .refine((a) => Object.values(a).some(Boolean), {
    message:
      "A fact draft must anchor to an existing entity or a sibling draft",
  });

export const factDraftSchema = z.object({
  anchors: factDraftAnchorsSchema,
  category: z.enum(factCategoryValues),
  confidence: z.number().min(0).max(1),
  resolution: z
    .object({
      factId: zodObjectId.optional(),
      finalText: z.string().optional(),
      status: z.enum(["pending", "confirmed", "edited", "discarded"]),
    })
    .default({ status: "pending" }),
  // Facts this draft replaces on confirmation (they get supersededBy stamped).
  // Required for consolidation drafts — it doubles as their provenance.
  supersedes: z.array(zodObjectId).min(1).optional(),
  text: z.string().min(1),
});
export type FactDraft = z.infer<typeof factDraftSchema>;

export const proposalSchema = z.object({
  ...baseDocFields,
  entityDrafts: z.array(entityDraftSchema),
  // Which extraction pass produced this. 1 for the original. Absent on
  // consolidation and contradiction proposals, which have no generation.
  extractionGeneration: z.number().int().min(1).optional(),
  factDrafts: z.array(factDraftSchema),
  // Reviewer-supplied context for this pass, when a re-extraction asked for it.
  hint: z.string().min(1).optional(),
  // ingestion: drafts extracted from a source, provenance is that sourceId.
  // consolidation / contradiction: drafts derived from existing facts, which
  // they supersede — their provenance is derivedFrom, not a source.
  kind: z.enum(["ingestion", "consolidation", "contradiction"]),
  // Drafts the model produced that failed validation. Recorded rather than
  // dropped, so a reviewer can see what extraction could not use.
  rejectedDrafts: z.array(rejectedDraftSchema).optional(),
  resolvedAt: z.date().optional(),
  resolvedBy: z.string().optional(),
  // Present ⇒ extraction judged there was nothing worth recording; drafts are
  // empty. Absent on every ordinary proposal — listOpenProposals filters on
  // { $exists: false }.
  skipReason: z.string().min(1).optional(),
  sourceId: zodObjectId.optional(),
  status: z.enum(["open", "resolved", "superseded"]),
});
export type Proposal = z.infer<typeof proposalSchema>;

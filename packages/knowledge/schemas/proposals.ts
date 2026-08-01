import { z } from "zod";
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
  text: z.string().min(1),
});
export type FactDraft = z.infer<typeof factDraftSchema>;

export const proposalSchema = z.object({
  ...baseDocFields,
  entityDrafts: z.array(entityDraftSchema),
  factDrafts: z.array(factDraftSchema),
  kind: z.enum(["ingestion", "consolidation"]),
  resolvedAt: z.date().optional(),
  resolvedBy: z.string().optional(),
  sourceId: zodObjectId.optional(),
  status: z.enum(["open", "resolved"]),
});
export type Proposal = z.infer<typeof proposalSchema>;

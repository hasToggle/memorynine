import { z } from "zod";
import { baseDocFields, zodObjectId } from "./shared";

export const factCategoryValues = [
  "preference",
  "objection",
  "decision-process",
  "relationship",
  "logistics",
  "background",
  "other",
] as const;
export type FactCategory = (typeof factCategoryValues)[number];

export const factAnchorsSchema = z
  .object({
    engagementId: zodObjectId.optional(),
    organizationId: zodObjectId.optional(),
    personId: zodObjectId.optional(),
  })
  .refine(
    (anchors) =>
      Boolean(
        anchors.organizationId || anchors.personId || anchors.engagementId
      ),
    { message: "A fact must be anchored to at least one entity" }
  );
export type FactAnchors = z.infer<typeof factAnchorsSchema>;

// The lifecycle convention in queryable form: a fact is currently valid iff
// both fields are absent, and { field: null } matches null-or-missing. Share
// this everywhere (search, dossier reads, ask tools) instead of re-typing it.
export const currentlyValidFilter = {
  supersededBy: null,
  validUntil: null,
} as const;

export const factSchema = z.object({
  ...baseDocFields,
  anchors: factAnchorsSchema,
  category: z.enum(factCategoryValues),
  confidence: z.number().min(0).max(1),
  confirmedBy: z.string().min(1),
  // Stubbed for later semantic search (EU embedding provider).
  embedding: z.array(z.number()).optional(),
  sourceId: zodObjectId,
  supersededBy: zodObjectId.optional(),
  text: z.string().min(1),
  // Lifecycle (dream cycle): a fact is currently valid iff BOTH are absent.
  validUntil: z.date().optional(),
});
export type Fact = z.infer<typeof factSchema>;

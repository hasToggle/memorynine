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

export const factSchema = z
  .object({
    ...baseDocFields,
    anchors: factAnchorsSchema,
    category: z.enum(factCategoryValues),
    confidence: z.number().min(0).max(1),
    confirmedBy: z.string().min(1),
    // Provenance for consolidated facts: the facts this one was merged from.
    derivedFrom: z.array(zodObjectId).min(1).optional(),
    // Stubbed for later semantic search (EU embedding provider).
    embedding: z.array(z.number()).optional(),
    sourceId: zodObjectId.optional(),
    // System time end, written alongside supersededBy: when we stopped
    // believing this fact. validUntil says when it stopped being *true* —
    // the two differ whenever we learn about a change after it happened.
    supersededAt: z.date().nullish(),
    // Lifecycle fields are nullish, not just optional: the convention treats
    // null and missing alike, so the stored form the filter tolerates (and
    // the driver's Filter type derives from) must admit null too.
    supersededBy: zodObjectId.nullish(),
    text: z.string().min(1),
    // Event time start: when the fact became true in the world, as distinct
    // from createdAt (when we recorded it). An ingestion fact inherits it
    // from its source's occurredAt; a merge inherits its earliest parent's.
    validFrom: z.date().optional(),
    // Lifecycle (dream cycle): a fact is currently valid iff BOTH are absent.
    validUntil: z.date().nullish(),
  })
  .refine((fact) => Boolean(fact.sourceId || fact.derivedFrom?.length), {
    message:
      "A fact needs provenance: a sourceId (ingestion) or derivedFrom (consolidation)",
  });
export type Fact = z.infer<typeof factSchema>;

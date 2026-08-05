import { z } from "zod";
import {
  extractLastValidObject,
  REFUSAL_REGEX,
  stripFences,
} from "./llm-reply";
import { type FactCategory, factCategoryValues } from "./schemas/facts";

// The extraction contract, shaped by what makes memory pipelines survive
// unattended operation: the model sees the tenant's current knowledge so it
// proposes supersessions instead of duplicates, an explicit skip token keeps
// empty sources from producing empty review work, and a refusal gate keeps
// model apologies from ever being mistaken for knowledge.

export interface KnownEntity {
  id: string;
  kind: "engagement" | "organization" | "person";
  name: string;
}

export interface KnownFact {
  /** Display name of the anchoring entity, for the model's context only. */
  anchor: string;
  category: FactCategory;
  id: string;
  text: string;
}

export interface ExtractionPromptInput {
  capturedAt: Date;
  capturedBy: string;
  content: string;
  knownEntities: KnownEntity[];
  knownFacts: KnownFact[];
  sourceType: "email" | "manual" | "voice";
}

const hexObjectId = z.string().regex(/^[0-9a-f]{24}$/);

export const llmEntityDraftSchema = z.object({
  data: z.record(z.string(), z.unknown()),
  draftId: z.string().min(1),
  entityType: z.enum(["organization", "person", "engagement"]),
});
export type LlmEntityDraft = z.infer<typeof llmEntityDraftSchema>;

export const llmFactDraftSchema = z.object({
  anchors: z
    .object({
      engagementDraftId: z.string().optional(),
      engagementId: hexObjectId.optional(),
      organizationDraftId: z.string().optional(),
      organizationId: hexObjectId.optional(),
      personDraftId: z.string().optional(),
      personId: hexObjectId.optional(),
    })
    .refine((anchors) => Object.values(anchors).some(Boolean), {
      message: "A fact must anchor to an entity or entity draft",
    }),
  category: z.enum(factCategoryValues),
  confidence: z.number().min(0).max(1),
  supersedes: z.array(hexObjectId).optional(),
  text: z.string().min(1),
});
export type LlmFactDraft = z.infer<typeof llmFactDraftSchema>;

// Strict on purpose: candidate objects are fished out of possibly-narrated
// model output, and with loose objects + defaults ANY {} would validate as
// an empty proposal (a live DeepSeek run turned a narration fragment into a
// false skip that way). At least one recognized key must be present.
export const llmExtractionSchema = z.union([
  z.strictObject({
    reason: z.string().default(""),
    skip: z.literal(true),
  }),
  z
    .strictObject({
      entities: z.array(llmEntityDraftSchema).optional(),
      facts: z.array(llmFactDraftSchema).optional(),
    })
    .refine((data) => data.entities !== undefined || data.facts !== undefined, {
      message: "A proposal needs an entities or facts key",
    }),
]);

// Loose ONLY in the element types (each element is validated individually in
// parseExtractionResponse, so one malformed draft can no longer sink the
// whole reply). Still a strictObject union that requires a recognized key,
// because that is what stops a bare `{}` in the narration from validating
// as an empty proposal — see llmExtractionSchema's comment above.
const looseExtractionSchema = z.union([
  z.strictObject({
    reason: z.string().default(""),
    skip: z.literal(true),
  }),
  z
    .strictObject({
      entities: z.array(z.unknown()).optional(),
      facts: z.array(z.unknown()).optional(),
    })
    .refine((data) => data.entities !== undefined || data.facts !== undefined, {
      message: "A proposal needs an entities or facts key",
    }),
]);

export const rejectedDraftSchema = z.object({
  /** What the model emitted, verbatim, so a reviewer can read it. */
  raw: z.unknown(),
  /** Why it failed validation, from the Zod error. Must name the field. */
  reason: z.string().min(1),
});
export type RejectedDraft = z.infer<typeof rejectedDraftSchema>;

export type ParsedExtraction =
  | { kind: "failure"; reason: string }
  | {
      kind: "proposal";
      entities: LlmEntityDraft[];
      facts: LlmFactDraft[];
      rejected: RejectedDraft[];
    }
  | { kind: "skip"; reason: string };

// The path is what makes a reject reason actionable ("anchors.personId:
// expected string, received array" vs. a bare "Invalid input") — a reviewer
// needs to know which field was wrong, not just that something was.
const describeZodError = (error: z.ZodError): string =>
  error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join(", ");

export const buildExtractionPrompt = ({
  capturedAt,
  capturedBy,
  content,
  knownEntities,
  knownFacts,
  sourceType,
}: ExtractionPromptInput): string => {
  const entityLines =
    knownEntities.length === 0
      ? "(none yet)"
      : knownEntities
          .map((entity) => `${entity.id} | ${entity.kind} | ${entity.name}`)
          .join("\n");
  const factLines =
    knownFacts.length === 0
      ? "(none yet)"
      : knownFacts
          .map(
            (fact) =>
              `${fact.id} | ${fact.anchor} | ${fact.category} | ${fact.text}`
          )
          .join("\n");

  return `You extract structured knowledge from business communications (German or English) for a company knowledge base. Reviewers confirm every item, so propose only what the source actually supports.

Known entities (id | type | name):
${entityLines}

Currently valid facts (id | anchor | category | text):
${factLines}

Source (type: ${sourceType}, captured by ${capturedBy} at ${capturedAt.toISOString()}):
---
${content}
---

Return ONLY JSON, no markdown fences, in exactly one of these two shapes:

1. Knowledge found:
{"entities": [{"draftId": "person-1", "entityType": "organization"|"person"|"engagement", "data": {"name": "...", ...}}], "facts": [{"text": "...", "category": "...", "confidence": 0.0-1.0, "anchors": {...}, "supersedes": ["<fact id>"]}]}

2. Nothing worth recording (greetings, scheduling chatter, no business knowledge):
{"skip": true, "reason": "..."}

Rules:
- Anchor each fact via "anchors": use a known entity id ({"organizationId": "<id>"}, {"personId": "<id>"}, {"engagementId": "<id>"}) when the name clearly matches a known entity; otherwise add an entity draft and reference it ({"personDraftId": "person-1"}).
- If a fact updates or contradicts a currently valid fact, list that fact's id in "supersedes". Do not re-state known facts unless they changed.
- Categories: ${factCategoryValues.join(" | ")}.
- Keep each fact one self-contained sentence in the source's language.
- Only ids from the lists above may appear as anchor ids or in "supersedes".`;
};

export const parseExtractionResponse = (raw: string): ParsedExtraction => {
  const text = stripFences(raw);
  if (REFUSAL_REGEX.test(text)) {
    return { kind: "failure", reason: `model refused: ${text.slice(0, 200)}` };
  }
  const data = extractLastValidObject(text, looseExtractionSchema);
  if (data === undefined) {
    return {
      kind: "failure",
      reason: `no schema-valid JSON object in reply: ${text.slice(0, 200)}`,
    };
  }
  if ("skip" in data) {
    return { kind: "skip", reason: data.reason };
  }

  const entities: LlmEntityDraft[] = [];
  const facts: LlmFactDraft[] = [];
  const rejected: RejectedDraft[] = [];

  for (const draft of data.entities ?? []) {
    const result = llmEntityDraftSchema.safeParse(draft);
    if (result.success) {
      entities.push(result.data);
    } else {
      rejected.push({ raw: draft, reason: describeZodError(result.error) });
    }
  }
  for (const draft of data.facts ?? []) {
    const result = llmFactDraftSchema.safeParse(draft);
    if (result.success) {
      facts.push(result.data);
    } else {
      rejected.push({ raw: draft, reason: describeZodError(result.error) });
    }
  }

  // Nothing usable at all: an empty reply is a skip, but a reply whose every
  // draft was malformed is a FAILURE — it deserves a retry, unlike a
  // judgment that there was nothing to record.
  if (entities.length === 0 && facts.length === 0) {
    return rejected.length > 0
      ? {
          kind: "failure",
          reason: `every draft failed validation: ${rejected
            .map((r) => r.reason)
            .join("; ")}`,
        }
      : { kind: "skip", reason: "empty proposal" };
  }
  return { entities, facts, kind: "proposal", rejected };
};

import { z } from "zod";
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

export const llmExtractionSchema = z.union([
  z.object({
    reason: z.string().default(""),
    skip: z.literal(true),
  }),
  z.object({
    entities: z.array(llmEntityDraftSchema).default([]),
    facts: z.array(llmFactDraftSchema).default([]),
  }),
]);

export type ParsedExtraction =
  | { kind: "failure"; reason: string }
  | { kind: "proposal"; entities: LlmEntityDraft[]; facts: LlmFactDraft[] }
  | { kind: "skip"; reason: string };

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

// Anchored refusal/clarification stems only — a narrow gate, so real content
// that merely mentions "sorry" is never misclassified.
const REFUSAL_REGEX =
  /^(i'?m sorry|i am sorry|i can(?:no|')t|i cannot|i will not|i won'?t|as an ai|als ki)/i;

const FENCE_REGEX = /^```(?:json)?\s*([\s\S]*?)\s*```$/;

const stripFences = (raw: string): string => {
  const trimmed = raw.trim();
  const fenced = trimmed.match(FENCE_REGEX);
  return fenced?.[1] ?? trimmed;
};

export const parseExtractionResponse = (raw: string): ParsedExtraction => {
  const text = stripFences(raw);
  if (REFUSAL_REGEX.test(text)) {
    return { kind: "failure", reason: `model refused: ${text.slice(0, 200)}` };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return {
      kind: "failure",
      reason: `not valid JSON: ${text.slice(0, 200)}`,
    };
  }
  const parsed = llmExtractionSchema.safeParse(json);
  if (!parsed.success) {
    return {
      kind: "failure",
      reason: `schema mismatch: ${parsed.error.message.slice(0, 500)}`,
    };
  }
  if ("skip" in parsed.data) {
    return { kind: "skip", reason: parsed.data.reason };
  }
  if (parsed.data.entities.length === 0 && parsed.data.facts.length === 0) {
    return { kind: "skip", reason: "empty proposal" };
  }
  return {
    entities: parsed.data.entities,
    facts: parsed.data.facts,
    kind: "proposal",
  };
};

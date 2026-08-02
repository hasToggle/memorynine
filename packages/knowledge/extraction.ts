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

// The slice of `text` from `start` to the brace that closes it, tracking
// string literals so braces inside fact texts don't unbalance the scan.
const balancedSlice = (text: string, start: number): string | undefined => {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (escaped) {
      escaped = false;
    } else if (char === "\\") {
      escaped = inString;
    } else if (char === '"') {
      inString = !inString;
    } else if (!inString && char === "{") {
      depth += 1;
    } else if (!inString && char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
};

// Reasoning models narrate before answering even when told not to — a live
// DeepSeek run leaked its thinking into the content channel ahead of the
// JSON, and narration can contain object-shaped fragments (even echoes of
// the prompt's examples). So: collect every balanced object that parses,
// and keep the LAST one that satisfies the schema — the answer comes after
// the thinking. A schema-valid fragment earlier in the narration loses to
// the real reply; a reply with no valid object at all is a failure.
const extractLastValidObject = (
  text: string
): z.infer<typeof llmExtractionSchema> | undefined => {
  let lastValid: z.infer<typeof llmExtractionSchema> | undefined;
  for (
    let start = text.indexOf("{");
    start !== -1;
    start = text.indexOf("{", start + 1)
  ) {
    const candidate = balancedSlice(text, start);
    if (candidate === undefined) {
      // Unclosed from THIS start (a stray "{" in the narration swallows all
      // later braces into a never-closing scan) — a complete object may
      // still begin further on, so keep going rather than give up.
      continue;
    }
    let json: unknown;
    try {
      json = JSON.parse(candidate);
    } catch {
      // Not JSON (e.g. a "{weird}" aside in the narration) — keep scanning.
      continue;
    }
    const parsed = llmExtractionSchema.safeParse(json);
    if (parsed.success) {
      lastValid = parsed.data;
      // Skip past this object so its nested objects are not re-scanned.
      start += candidate.length - 1;
    }
  }
  return lastValid;
};

export const parseExtractionResponse = (raw: string): ParsedExtraction => {
  const text = stripFences(raw);
  if (REFUSAL_REGEX.test(text)) {
    return { kind: "failure", reason: `model refused: ${text.slice(0, 200)}` };
  }
  const data = extractLastValidObject(text);
  if (data === undefined) {
    return {
      kind: "failure",
      reason: `no schema-valid JSON object in reply: ${text.slice(0, 200)}`,
    };
  }
  if ("skip" in data) {
    return { kind: "skip", reason: data.reason };
  }
  const entities = data.entities ?? [];
  const facts = data.facts ?? [];
  if (entities.length === 0 && facts.length === 0) {
    return { kind: "skip", reason: "empty proposal" };
  }
  return { entities, facts, kind: "proposal" };
};

import type { z } from "zod";

// Shared hardening for parsing LLM replies, extracted from the extraction
// worker after live DeepSeek runs showed every failure mode in production:
// reasoning narrated into the content channel ahead of the JSON, markdown
// fences, object-shaped fragments (even echoes of the prompt's examples),
// and stray unclosed braces in the narration.

// Anchored refusal/clarification stems only — a narrow gate, so real content
// that merely mentions "sorry" is never misclassified.
export const REFUSAL_REGEX =
  /^(i'?m sorry|i am sorry|i can(?:no|')t|i cannot|i will not|i won'?t|as an ai|als ki)/i;

const FENCE_REGEX = /^```(?:json)?\s*([\s\S]*?)\s*```$/;

export const stripFences = (raw: string): string => {
  const trimmed = raw.trim();
  const fenced = trimmed.match(FENCE_REGEX);
  return fenced?.[1] ?? trimmed;
};

// The slice of `text` from `start` to the brace that closes it, tracking
// string literals so braces inside content don't unbalance the scan.
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

// Collect every balanced object that parses and keep the LAST one that
// satisfies the schema — the answer comes after the thinking. A schema-valid
// fragment earlier in the narration loses to the real reply; a reply with no
// valid object at all yields undefined.
export const extractLastValidObject = <Schema extends z.ZodType>(
  text: string,
  schema: Schema
): z.infer<Schema> | undefined => {
  let lastValid: z.infer<Schema> | undefined;
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
    const parsed = schema.safeParse(json);
    if (parsed.success) {
      lastValid = parsed.data;
      // Skip past this object so its nested objects are not re-scanned.
      start += candidate.length - 1;
    }
  }
  return lastValid;
};

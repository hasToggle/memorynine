import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getCollections } from "./collections";
import type { DossierAnchor } from "./dossier";
import { deterministicId, insertIgnoringDuplicate } from "./idempotency";
import {
  extractLastValidObject,
  REFUSAL_REGEX,
  stripFences,
} from "./llm-reply";
import { currentlyValidFilter, factCategoryValues } from "./schemas/facts";
import { proposalSchema } from "./schemas/proposals";

// The dream cycle: when an anchor accumulates redundant facts, propose
// merges through the same review gate as everything else. A merge draft
// supersedes ≥2 currently valid facts; on confirmation the review write
// path stamps supersededBy and records derivedFrom — nothing here writes
// knowledge directly.

export interface ConsolidationFact {
  category: string;
  id: string;
  text: string;
}

const hexObjectId = z.string().regex(/^[0-9a-f]{24}$/);

export const llmMergeSchema = z.object({
  category: z.enum(factCategoryValues),
  confidence: z.number().min(0).max(1),
  supersedes: z.array(hexObjectId).min(2),
  text: z.string().min(1),
});
export type LlmMerge = z.infer<typeof llmMergeSchema>;

export const llmConsolidationSchema = z.union([
  z.strictObject({
    reason: z.string().default(""),
    skip: z.literal(true),
  }),
  z.strictObject({
    merges: z.array(llmMergeSchema),
  }),
]);

export type ParsedConsolidation =
  | { kind: "failure"; reason: string }
  | { kind: "merges"; merges: LlmMerge[] }
  | { kind: "skip"; reason: string };

export const buildConsolidationPrompt = ({
  anchorName,
  facts,
}: {
  anchorName: string;
  facts: ConsolidationFact[];
}): string => {
  const factLines = facts
    .map((fact) => `${fact.id} | ${fact.category} | ${fact.text}`)
    .join("\n");

  return `You consolidate a company knowledge base. Below are the currently valid facts about "${anchorName}". Reviewers confirm every merge, so propose only merges that reduce redundancy with ZERO information loss — every detail, name, number, and causal link must survive into the merged text.

Facts (id | category | text):
${factLines}

Return ONLY JSON, no markdown fences, in exactly one of these two shapes:

1. Redundancy found:
{"merges": [{"text": "<merged fact, one self-contained sentence in the facts' language>", "category": "...", "confidence": 0.0-1.0, "supersedes": ["<fact id>", "<fact id>"]}]}

2. Nothing worth merging:
{"skip": true, "reason": "..."}

Rules:
- A merge must supersede at least TWO of the facts above, and only ids from the list may appear.
- No fact id may appear in more than one merge.
- Merge only facts that describe the same subject; never merge unrelated facts into a grab-bag sentence.
- Do not invent, embellish, or drop information — compress wording, not meaning.
- Categories: ${factCategoryValues.join(" | ")}.`;
};

export const parseConsolidationResponse = (
  raw: string
): ParsedConsolidation => {
  const text = stripFences(raw);
  if (REFUSAL_REGEX.test(text)) {
    return { kind: "failure", reason: `model refused: ${text.slice(0, 200)}` };
  }
  const data = extractLastValidObject(text, llmConsolidationSchema);
  if (data === undefined) {
    return {
      kind: "failure",
      reason: `no schema-valid JSON object in reply: ${text.slice(0, 200)}`,
    };
  }
  if ("skip" in data) {
    return { kind: "skip", reason: data.reason };
  }
  if (data.merges.length === 0) {
    return { kind: "skip", reason: "no merges proposed" };
  }
  return { kind: "merges", merges: data.merges };
};

export interface RunConsolidationOptions {
  anchor: DossierAnchor;
  generate: (prompt: string) => Promise<string>;
  /** Facts an anchor needs before consolidation is worth an LLM call. */
  minFacts?: number;
}

export interface ConsolidationRunResult {
  proposalId?: ObjectId;
  reason?: string;
  status: "failure" | "proposed" | "skipped";
}

const DEFAULT_MIN_FACTS = 8;

const anchorFilter = (anchor: DossierAnchor) => {
  switch (anchor.kind) {
    case "engagement":
      return { "anchors.engagementId": anchor.id };
    case "organization":
      return { "anchors.organizationId": anchor.id };
    default:
      return { "anchors.personId": anchor.id };
  }
};

const anchorDraftField = (anchor: DossierAnchor) => {
  switch (anchor.kind) {
    case "engagement":
      return { engagementId: anchor.id };
    case "organization":
      return { organizationId: anchor.id };
    default:
      return { personId: anchor.id };
  }
};

// The model may only merge ids it was shown, each at most once.
const validateMerges = (
  merges: LlmMerge[],
  shownIds: Set<string>
): string | null => {
  const claimed = new Set<string>();
  for (const [index, merge] of merges.entries()) {
    for (const id of merge.supersedes) {
      if (!shownIds.has(id)) {
        return `merges[${index}] supersedes unknown fact id ${id}`;
      }
      if (claimed.has(id)) {
        return `merges[${index}] supersedes fact ${id}, which another merge already claims`;
      }
      claimed.add(id);
    }
  }
  return null;
};

export const runConsolidation = async (
  db: Db,
  tenantId: string,
  { anchor, generate, minFacts = DEFAULT_MIN_FACTS }: RunConsolidationOptions
): Promise<ConsolidationRunResult> => {
  const { engagements, facts, organizations, people, proposals } =
    getCollections(db);

  const validFacts = await facts
    .find({ tenantId, ...anchorFilter(anchor), ...currentlyValidFilter })
    .sort({ updatedAt: -1 })
    .toArray();
  if (validFacts.length < minFacts) {
    return {
      reason: `${validFacts.length} facts < minFacts ${minFacts}`,
      status: "skipped",
    };
  }

  // One proposal per (anchor, exact fact set): the deterministic id makes
  // re-runs idempotent AND remembers a reviewer's "no" — a resolved proposal
  // for the same fact set blocks re-proposing until the facts change.
  const factSetHash = createHash("md5")
    .update(
      validFacts
        .map((fact) => fact._id.toHexString())
        .sort((a, b) => a.localeCompare(b))
        .join(",")
    )
    .digest("hex");
  const proposalId = deterministicId(
    `${tenantId}:consolidation:${anchor.kind}:${anchor.id.toHexString()}:${factSetHash}`
  );
  const existing = await proposals.findOne({ _id: proposalId, tenantId });
  if (existing) {
    return existing.status === "open"
      ? { proposalId, status: "proposed" }
      : {
          reason: "this fact set was already reviewed",
          status: "skipped",
        };
  }
  // Also hold off while ANY open consolidation proposal touches this anchor
  // (an older fact set still awaiting review) — parallel proposals would
  // race to supersede the same facts at confirmation time.
  const openForAnchor = await proposals.findOne({
    factDrafts: {
      $elemMatch: {
        [`anchors.${Object.keys(anchorDraftField(anchor))[0]}`]: anchor.id,
      },
    },
    kind: "consolidation",
    status: "open",
    tenantId,
  });
  if (openForAnchor) {
    return {
      reason: `open consolidation proposal ${openForAnchor._id.toHexString()} already covers this anchor`,
      status: "skipped",
    };
  }

  const anchorName = await (async () => {
    if (anchor.kind === "organization") {
      const doc = await organizations.findOne({ _id: anchor.id, tenantId });
      return doc?.name ?? "unknown";
    }
    if (anchor.kind === "person") {
      const doc = await people.findOne({ _id: anchor.id, tenantId });
      return doc?.name ?? "unknown";
    }
    const doc = await engagements.findOne({ _id: anchor.id, tenantId });
    return doc?.title ?? "unknown";
  })();

  const prompt = buildConsolidationPrompt({
    anchorName,
    facts: validFacts.map((fact) => ({
      category: fact.category,
      id: fact._id.toHexString(),
      text: fact.text,
    })),
  });

  let parsed: ParsedConsolidation;
  try {
    parsed = parseConsolidationResponse(await generate(prompt));
  } catch (error) {
    parsed = {
      kind: "failure",
      reason: `generate failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (parsed.kind === "merges") {
    const problem = validateMerges(
      parsed.merges,
      new Set(validFacts.map((fact) => fact._id.toHexString()))
    );
    if (problem) {
      parsed = { kind: "failure", reason: problem };
    }
  }
  if (parsed.kind === "skip") {
    return { reason: parsed.reason, status: "skipped" };
  }
  if (parsed.kind === "failure") {
    return { reason: parsed.reason, status: "failure" };
  }

  const writtenAt = new Date();
  const doc = proposalSchema.parse({
    _id: proposalId,
    createdAt: writtenAt,
    entityDrafts: [],
    factDrafts: parsed.merges.map((merge) => ({
      anchors: anchorDraftField(anchor),
      category: merge.category,
      confidence: merge.confidence,
      supersedes: merge.supersedes.map((hex) => new ObjectId(hex)),
      text: merge.text,
    })),
    kind: "consolidation",
    status: "open",
    tenantId,
    updatedAt: writtenAt,
  });
  await insertIgnoringDuplicate(proposals, doc);
  return { proposalId, status: "proposed" };
};

export interface ConsolidationSweepOptions {
  generate: (prompt: string) => Promise<string>;
  /** Max candidate anchors per sweep. Default 10. */
  limit?: number;
  minFacts?: number;
}

export interface ConsolidationSweepReport {
  failures: string[];
  proposed: number;
  skipped: number;
}

interface CandidateAnchor {
  anchor: DossierAnchor;
  tenantId: string;
}

const ANCHOR_FIELDS = [
  { field: "anchors.engagementId", kind: "engagement" },
  { field: "anchors.organizationId", kind: "organization" },
  { field: "anchors.personId", kind: "person" },
] as const;

export const sweepConsolidation = async (
  db: Db,
  {
    generate,
    limit = 10,
    minFacts = DEFAULT_MIN_FACTS,
  }: ConsolidationSweepOptions
): Promise<ConsolidationSweepReport> => {
  const { facts } = getCollections(db);
  const report: ConsolidationSweepReport = {
    failures: [],
    proposed: 0,
    skipped: 0,
  };

  // Candidate anchors: any entity with enough currently valid facts,
  // across all tenants and anchor kinds.
  const candidates: CandidateAnchor[] = [];
  for (const { field, kind } of ANCHOR_FIELDS) {
    // biome-ignore lint/performance/noAwaitInLoops: three sequential aggregations over an indexed field; parallelism buys nothing here
    const groups = await facts
      .aggregate<{ _id: { anchorId: ObjectId; tenantId: string } }>([
        { $match: { [field]: { $exists: true }, ...currentlyValidFilter } },
        {
          $group: {
            _id: { anchorId: `$${field}`, tenantId: "$tenantId" },
            count: { $sum: 1 },
          },
        },
        { $match: { count: { $gte: minFacts } } },
        { $limit: limit },
      ])
      .toArray();
    for (const group of groups) {
      candidates.push({
        anchor: { id: group._id.anchorId, kind },
        tenantId: group._id.tenantId,
      });
    }
  }

  for (const candidate of candidates.slice(0, limit)) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: sequential keeps LLM concurrency predictable
      const result = await runConsolidation(db, candidate.tenantId, {
        anchor: candidate.anchor,
        generate,
        minFacts,
      });
      if (result.status === "proposed") {
        report.proposed += 1;
      } else if (result.status === "skipped") {
        report.skipped += 1;
      } else {
        report.failures.push(
          `${candidate.anchor.kind} ${candidate.anchor.id.toHexString()}: ${result.reason ?? "failure"}`
        );
      }
    } catch (error) {
      report.failures.push(
        `${candidate.anchor.kind} ${candidate.anchor.id.toHexString()}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return report;
};

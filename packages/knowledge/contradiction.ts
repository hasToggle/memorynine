import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { z } from "zod";
import {
  anchorFilter,
  anchorNameFor,
  findCandidateAnchors,
  unionAnchors,
} from "./anchors";
import { getCollections } from "./collections";
import type { DossierAnchor } from "./dossier";
import type { UsageContext } from "./gateway";
import { deterministicId, insertIgnoringDuplicate } from "./idempotency";
import {
  extractLastValidObject,
  REFUSAL_REGEX,
  stripFences,
} from "./llm-reply";
import type { Fact, FactAnchors } from "./schemas/facts";
import { currentlyValidFilter, factCategoryValues } from "./schemas/facts";
import { proposalSchema } from "./schemas/proposals";

// Consolidation only proposes merges that reduce redundancy with zero
// information loss, so contradictory facts — neither redundant nor mergeable
// under those rules — are invisible to it. Extraction only sees a recency
// window of the tenant's facts, so a contradiction between two sources
// captured months apart is never detected by anything.
//
// This sweep closes that gap. Candidates are scoped to one anchor and one
// category, which is the pairing constraint that keeps the comparison
// tractable, and every resolution goes through the same review gate as
// everything else: nothing here writes knowledge directly.

export interface ContradictionFact {
  category: string;
  id: string;
  text: string;
  validFrom?: Date;
}

const hexObjectId = z.string().regex(/^[0-9a-f]{24}$/);

export const llmResolutionSchema = z.object({
  category: z.enum(factCategoryValues),
  confidence: z.number().min(0).max(1),
  // A resolution always replaces both sides of the contradiction it settles.
  supersedes: z.array(hexObjectId).min(2),
  text: z.string().min(1),
});
export type LlmResolution = z.infer<typeof llmResolutionSchema>;

export const llmContradictionSchema = z.union([
  z.strictObject({
    reason: z.string().default(""),
    skip: z.literal(true),
  }),
  z.strictObject({
    resolutions: z.array(llmResolutionSchema),
  }),
]);

export type ParsedContradiction =
  | { kind: "failure"; reason: string }
  | { kind: "resolutions"; resolutions: LlmResolution[] }
  | { kind: "skip"; reason: string };

const isoDay = (date: Date | undefined) =>
  date ? date.toISOString().slice(0, 10) : "unknown";

export const buildContradictionPrompt = ({
  anchorName,
  facts,
}: {
  anchorName: string;
  facts: ContradictionFact[];
}): string => {
  const factLines = facts
    .map(
      (fact) =>
        `${fact.id} | ${fact.category} | since ${isoDay(fact.validFrom)} | ${fact.text}`
    )
    .join("\n");

  return `You audit a company knowledge base for contradictions. Below are the currently valid facts about "${anchorName}". Every fact here is believed to be true right now, so any pair that cannot both be true is a problem a reviewer must settle.

Facts (id | category | since | text):
${factLines}

Return ONLY JSON, no markdown fences, in exactly one of these two shapes:

1. Contradictions found:
{"resolutions": [{"text": "<the statement that is true now, one self-contained sentence in the facts' language>", "category": "...", "confidence": 0.0-1.0, "supersedes": ["<fact id>", "<fact id>"]}]}

2. No contradictions:
{"skip": true, "reason": "..."}

Rules:
- Two facts contradict only if they cannot both be true of the same subject at the same time. Different subjects, different time periods, or different aspects are NOT contradictions.
- A change over time is a contradiction worth resolving: prefer the statement supported by the most recent "since" date, and say so in the resolved text.
- Facts that merely differ in detail, or that add information, are NOT contradictions — leave them alone.
- A resolution must supersede at least TWO of the facts above, and only ids from the list may appear.
- No fact id may appear in more than one resolution.
- Do not invent information. The resolved text must be supported by the facts it supersedes.
- Categories: ${factCategoryValues.join(" | ")}.`;
};

export const parseContradictionResponse = (
  raw: string
): ParsedContradiction => {
  const text = stripFences(raw);
  if (REFUSAL_REGEX.test(text)) {
    return { kind: "failure", reason: `model refused: ${text.slice(0, 200)}` };
  }
  const data = extractLastValidObject(text, llmContradictionSchema);
  if (data === undefined) {
    return {
      kind: "failure",
      reason: `no schema-valid JSON object in reply: ${text.slice(0, 200)}`,
    };
  }
  if ("skip" in data) {
    return { kind: "skip", reason: data.reason };
  }
  if (data.resolutions.length === 0) {
    return { kind: "skip", reason: "no contradictions found" };
  }
  return { kind: "resolutions", resolutions: data.resolutions };
};

// Same contract as consolidation's validateMerges: the model may only claim
// ids it was shown, each at most once.
const validateResolutions = (
  resolutions: LlmResolution[],
  shownIds: Set<string>
): string | null => {
  const claimed = new Set<string>();
  for (const [index, resolution] of resolutions.entries()) {
    for (const id of resolution.supersedes) {
      if (!shownIds.has(id)) {
        return `resolutions[${index}] supersedes unknown fact id ${id}`;
      }
      if (claimed.has(id)) {
        return `resolutions[${index}] supersedes fact ${id}, which another resolution already claims`;
      }
      claimed.add(id);
    }
  }
  return null;
};

export interface RunContradictionCheckOptions {
  anchor: DossierAnchor;
  generate: (prompt: string, context?: UsageContext) => Promise<string>;
  /** Facts an anchor needs before a check is worth an LLM call. Default 2. */
  minFacts?: number;
}

export interface ContradictionRunResult {
  proposalId?: ObjectId;
  reason?: string;
  status: "failure" | "proposed" | "skipped";
}

const DEFAULT_MIN_FACTS = 2;

export const runContradictionCheck = async (
  db: Db,
  tenantId: string,
  {
    anchor,
    generate,
    minFacts = DEFAULT_MIN_FACTS,
  }: RunContradictionCheckOptions
): Promise<ContradictionRunResult> => {
  const collections = getCollections(db);
  const { facts, proposals } = collections;

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

  // One proposal per (anchor, exact fact set), like consolidation: re-runs are
  // idempotent, and a reviewer's "no" is remembered until the facts change.
  const factSetHash = createHash("md5")
    .update(
      validFacts
        .map((fact) => fact._id.toHexString())
        .sort((a, b) => a.localeCompare(b))
        .join(",")
    )
    .digest("hex");
  const proposalId = deterministicId(
    `${tenantId}:contradiction:${anchor.kind}:${anchor.id.toHexString()}:${factSetHash}`
  );
  const existing = await proposals.findOne({ _id: proposalId, tenantId });
  if (existing) {
    return existing.status === "open"
      ? { proposalId, status: "proposed" }
      : { reason: "this fact set was already reviewed", status: "skipped" };
  }
  const openForAnchor = await proposals.findOne({
    factDrafts: {
      $elemMatch: { [`anchors.${anchor.kind}Id`]: anchor.id },
    },
    kind: "contradiction",
    status: "open",
    tenantId,
  });
  if (openForAnchor) {
    return {
      reason: `open contradiction proposal ${openForAnchor._id.toHexString()} already covers this anchor`,
      status: "skipped",
    };
  }

  const anchorName = await anchorNameFor(collections, tenantId, anchor);
  const prompt = buildContradictionPrompt({
    anchorName,
    facts: validFacts.map((fact) => ({
      category: fact.category,
      id: fact._id.toHexString(),
      text: fact.text,
      validFrom: fact.validFrom,
    })),
  });

  let parsed: ParsedContradiction;
  try {
    parsed = parseContradictionResponse(
      await generate(prompt, {
        correlationId: anchor.id.toHexString(),
        operation: "contradiction",
        tenantId,
      })
    );
  } catch (error) {
    parsed = {
      kind: "failure",
      reason: `generate failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (parsed.kind === "resolutions") {
    const problem = validateResolutions(
      parsed.resolutions,
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

  const factsById = new Map(
    validFacts.map((fact) => [fact._id.toHexString(), fact])
  );
  const factDrafts: {
    anchors: FactAnchors;
    category: string;
    confidence: number;
    supersedes: ObjectId[];
    text: string;
  }[] = [];
  for (const [index, resolution] of parsed.resolutions.entries()) {
    const parents = resolution.supersedes
      .map((hex) => factsById.get(hex))
      .filter((fact): fact is Fact => Boolean(fact));
    const resolved = unionAnchors(anchor, parents);
    if ("conflict" in resolved) {
      return {
        reason: `resolutions[${index}] ${resolved.conflict}`,
        status: "failure",
      };
    }
    factDrafts.push({
      anchors: resolved.anchors,
      category: resolution.category,
      confidence: resolution.confidence,
      supersedes: resolution.supersedes.map((hex) => new ObjectId(hex)),
      text: resolution.text,
    });
  }

  const writtenAt = new Date();
  const doc = proposalSchema.parse({
    _id: proposalId,
    createdAt: writtenAt,
    entityDrafts: [],
    factDrafts,
    kind: "contradiction",
    status: "open",
    tenantId,
    updatedAt: writtenAt,
  });
  await insertIgnoringDuplicate(proposals, doc);
  return { proposalId, status: "proposed" };
};

export interface ContradictionSweepOptions {
  generate: (prompt: string, context?: UsageContext) => Promise<string>;
  /** Max candidate anchors per sweep. Default 10. */
  limit?: number;
  minFacts?: number;
}

export interface ContradictionSweepReport {
  failures: string[];
  proposed: number;
  skipped: number;
}

export const sweepContradictions = async (
  db: Db,
  {
    generate,
    limit = 10,
    minFacts = DEFAULT_MIN_FACTS,
  }: ContradictionSweepOptions
): Promise<ContradictionSweepReport> => {
  const report: ContradictionSweepReport = {
    failures: [],
    proposed: 0,
    skipped: 0,
  };
  const candidates = await findCandidateAnchors(db, { limit, minFacts });

  for (const candidate of candidates) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: sequential keeps LLM concurrency predictable
      const result = await runContradictionCheck(db, candidate.tenantId, {
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

/**
 * Which of these facts an open contradiction proposal is currently disputing.
 *
 * The sweep above has always written these proposals; until the Ask surface
 * needed to warn a reader before they quoted a fact, nothing read them back.
 * Scoped to `status: "open"` on purpose — a resolved proposal is a dispute that
 * has been settled, and re-flagging it would train people to ignore the flag.
 */
export const findContestedFactIds = async (
  db: Db,
  tenantId: string,
  factIds: ObjectId[]
): Promise<Set<string>> => {
  if (factIds.length === 0) {
    return new Set();
  }
  const { proposals } = getCollections(db);
  const open = await proposals
    .find(
      {
        "factDrafts.supersedes": { $in: factIds },
        kind: "contradiction",
        status: "open",
        tenantId,
      },
      { projection: { "factDrafts.supersedes": 1 } }
    )
    .toArray();

  const wanted = new Set(factIds.map((id) => id.toHexString()));
  const contested = new Set<string>();
  for (const proposal of open) {
    for (const draft of proposal.factDrafts) {
      for (const id of draft.supersedes ?? []) {
        const hex = id.toHexString();
        // A proposal can supersede facts beyond the ones asked about; only
        // report on what the caller handed us.
        if (wanted.has(hex)) {
          contested.add(hex);
        }
      }
    }
  }
  return contested;
};

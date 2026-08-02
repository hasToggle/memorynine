import type { Db, ObjectId } from "mongodb";
import { z } from "zod";
import { getCollections } from "./collections";
import { deterministicId } from "./idempotency";
import {
  currentlyValidFilter,
  type Fact,
  factCategoryValues,
} from "./schemas/facts";
import { baseDocFields, zodObjectId } from "./schemas/shared";

// The always-loadable tier: a budgeted per-anchor summary materialized from
// currently valid facts, cheap enough to inject into any agent context or
// UI header, while the full fact set stays behind search. Deterministic
// composition — no LLM call — so a refresh is safe to run on every change.

export const dossierAnchorKinds = [
  "engagement",
  "organization",
  "person",
] as const;

export const dossierSchema = z.object({
  ...baseDocFields,
  anchor: z.object({
    id: zodObjectId,
    kind: z.enum(dossierAnchorKinds),
  }),
  content: z.string(),
  factCount: z.number().int().min(0),
});
export type Dossier = z.infer<typeof dossierSchema>;

export interface DossierAnchor {
  id: ObjectId;
  kind: (typeof dossierAnchorKinds)[number];
}

const DEFAULT_BUDGET_TOKENS = 600;
/** chars-per-token heuristic; content is prose, so 4 is conservative. */
const CHARS_PER_TOKEN = 4;

export const composeDossier = (
  anchorName: string,
  facts: Fact[],
  { budgetTokens = DEFAULT_BUDGET_TOKENS }: { budgetTokens?: number } = {}
): string => {
  const budgetChars = budgetTokens * CHARS_PER_TOKEN;
  const header = `# ${anchorName}\n`;

  // Newest first: when the budget runs out, it is the oldest facts that drop.
  const byRecency = [...facts].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
  );

  let used = header.length;
  const kept: Fact[] = [];
  for (const fact of byRecency) {
    const line = `- ${fact.text}\n`;
    if (used + line.length > budgetChars) {
      break;
    }
    used += line.length;
    kept.push(fact);
  }

  const sections: string[] = [header];
  for (const category of factCategoryValues) {
    const inCategory = kept.filter((fact) => fact.category === category);
    if (inCategory.length === 0) {
      continue;
    }
    sections.push(
      `\n## ${category}\n${inCategory.map((fact) => `- ${fact.text}`).join("\n")}\n`
    );
  }
  const dropped = facts.length - kept.length;
  if (dropped > 0) {
    sections.push(`\n(+${dropped} older facts beyond the budget)\n`);
  }
  return sections.join("");
};

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

const resolveAnchorName = async (
  db: Db,
  tenantId: string,
  anchor: DossierAnchor
): Promise<string> => {
  const { engagements, organizations, people } = getCollections(db);
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
};

export const refreshDossier = async (
  db: Db,
  tenantId: string,
  anchor: DossierAnchor,
  options: { budgetTokens?: number } = {}
): Promise<Dossier | null> => {
  const { dossiers, facts } = getCollections(db);

  const validFacts = await facts
    .find({ tenantId, ...anchorFilter(anchor), ...currentlyValidFilter })
    .sort({ updatedAt: -1 })
    .toArray();

  if (validFacts.length === 0) {
    await dossiers.deleteMany({
      "anchor.id": anchor.id,
      "anchor.kind": anchor.kind,
      tenantId,
    });
    return null;
  }

  const name = await resolveAnchorName(db, tenantId, anchor);
  const writtenAt = new Date();
  const doc: Dossier = {
    _id: deterministicId(
      `${tenantId}:dossier:${anchor.kind}:${anchor.id.toHexString()}`
    ),
    anchor,
    content: composeDossier(name, validFacts, options),
    createdAt: writtenAt,
    factCount: validFacts.length,
    tenantId,
    updatedAt: writtenAt,
  };
  await dossiers.updateOne(
    { _id: doc._id, tenantId },
    {
      $set: {
        anchor: doc.anchor,
        content: doc.content,
        factCount: doc.factCount,
        updatedAt: writtenAt,
      },
      $setOnInsert: { createdAt: writtenAt, tenantId },
    },
    { upsert: true }
  );
  return doc;
};

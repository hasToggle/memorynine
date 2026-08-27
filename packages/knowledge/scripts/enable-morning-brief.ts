import { ObjectId } from "mongodb";
import { getKnowledgeDb } from "../client";
import { ensureIndexes, getCollections } from "../collections";
import { initiativeSettingsSchema } from "../schemas/initiative";

// Beta onboarding for the morning brief (spec §5): settings live in the DB so
// enabling a tenant is an operation, not a deploy. Usage:
//   bun enable-morning-brief <tenantId> <email> [email...]
// Re-running replaces the recipient list. Disable by hand for now:
//   db.initiativeSettings.updateOne({ tenantId }, { $set: { enabled: false } })

const run = async () => {
  const [tenantId, ...recipients] = process.argv.slice(2);
  if (!tenantId || recipients.length === 0) {
    console.error(
      "usage: bun enable-morning-brief <tenantId> <email> [email...]"
    );
    process.exit(1);
  }

  const now = new Date();
  // Parse a full candidate document so bad emails fail here, loudly, instead of
  // at 05:00 UTC in the sweep.
  const candidate = initiativeSettingsSchema.parse({
    _id: new ObjectId(),
    createdAt: now,
    enabled: true,
    recipients,
    tenantId,
    updatedAt: now,
  });

  const db = getKnowledgeDb();
  await ensureIndexes(db);
  const { initiativeSettings } = getCollections(db);
  const result = await initiativeSettings.updateOne(
    { tenantId },
    {
      $set: {
        enabled: candidate.enabled,
        recipients: candidate.recipients,
        updatedAt: now,
      },
      $setOnInsert: {
        _id: candidate._id,
        createdAt: now,
        tenantId,
      },
    },
    { upsert: true }
  );
  console.log(
    `${result.upsertedCount === 1 ? "enabled" : "updated"} morning brief for ${tenantId} → ${recipients.join(", ")}`
  );
  process.exit(0);
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

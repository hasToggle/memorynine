// One-time / idempotent seed of the synthetic eval corpus into Atlas. This
// module holds only `seedEvals` itself — eval files (post-erasure's restore
// step) import it directly, so it must stay free of CJS-only globals like
// `require`/`module`. The CLI entrypoint lives in seed-evals.cli.ts:
//   KNOWLEDGE_MONGODB_URI=... bun scripts/seed-evals.cli.ts
//
// Wipes and reseeds the two eval tenants only. Every delete below is scoped
// by `tenantId: { $in: EVAL_TENANTS }`, so running this against a cluster
// holding real data removes only fixture rows — that scoping is the entire
// safety mechanism, and there is deliberately no confirmation prompt.
import type { Db } from "mongodb";
import { ensureIndexes, getCollections } from "../collections";
import {
  engagements,
  facts,
  organizations,
  people,
  sources,
  TENANT_ALPHA,
  TENANT_BETA,
} from "../fixtures";

export const EVAL_TENANTS = [TENANT_ALPHA, TENANT_BETA];

/**
 * Deletes any existing rows for the two eval tenants, then reinserts the
 * fixture corpus. Takes a `Db` (not a `MongoClient`/URI) so it can be
 * exercised in tests against a fake `Db` with no real MongoDB connection —
 * the tenant-scoped delete filter is the single most important thing to
 * verify about this file.
 */
export const seedEvals = async (db: Db): Promise<void> => {
  const collections = getCollections(db);
  const scope = { tenantId: { $in: EVAL_TENANTS } };

  for (const [name, collection] of Object.entries(collections)) {
    // biome-ignore lint/performance/noAwaitInLoops: sequential one-time setup script
    const { deletedCount } = await collection.deleteMany(scope);
    console.log(`cleared ${deletedCount} from ${name}`);
  }

  // Recreate indexes — including the unique partial index on
  // `sources.email.messageId` — after the deletes and before the inserts,
  // so a re-run can never trip a stale unique index against rows it is
  // about to replace.
  await ensureIndexes(db);

  await collections.organizations.insertMany(organizations);
  await collections.people.insertMany(people);
  await collections.engagements.insertMany(engagements);
  await collections.sources.insertMany(sources);
  await collections.facts.insertMany(facts);

  console.log(
    `seeded ${organizations.length} orgs, ${people.length} people, ` +
      `${engagements.length} engagements, ${sources.length} sources, ` +
      `${facts.length} facts across ${EVAL_TENANTS.length} tenants`
  );
};

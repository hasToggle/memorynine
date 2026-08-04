// One-time / idempotent seed of the synthetic eval corpus into Atlas:
//   KNOWLEDGE_MONGODB_URI=... bun scripts/seed-evals.ts
//
// Wipes and reseeds the two eval tenants only. Every delete below is scoped
// by `tenantId: { $in: EVAL_TENANTS }`, so running this against a cluster
// holding real data removes only fixture rows — that scoping is the entire
// safety mechanism, and there is deliberately no confirmation prompt.
import type { Db } from "mongodb";
import { MongoClient } from "mongodb";
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

const run = async () => {
  const uri = process.env.KNOWLEDGE_MONGODB_URI;
  if (!uri) {
    console.error("KNOWLEDGE_MONGODB_URI is required");
    process.exit(1);
  }

  const client = new MongoClient(uri, {
    // Mirrors client.ts and is load-bearing, not cosmetic: the fact
    // lifecycle convention is "currently valid iff `supersededBy` and
    // `validUntil` are BOTH ABSENT" (see currentlyValidFilter in
    // schemas/facts.ts), and `{ field: null }` matches null-or-missing in
    // MongoDB. Without this option the driver would serialize the
    // fixtures' `undefined` optional fields as explicit BSON null, so
    // seeded facts would behave differently under that filter than facts
    // the application writes at runtime. This keeps present-but-undefined
    // keys omitted instead, matching both the lifecycle convention and the
    // Zod schemas (`.optional()`, not `.nullable()`).
    ignoreUndefined: true,
  });
  const db = client.db(process.env.KNOWLEDGE_MONGODB_DB ?? "knowledge");

  try {
    await seedEvals(db);
  } finally {
    await client.close();
  }
};

// Guarded so importing `seedEvals` for tests (or any other module) never
// triggers a live run — only executing this file directly does. `require`
// is available even though this file is written as ESM: the package has no
// "type": "module" in its package.json, so both tsc (module: NodeNext) and
// Bun treat it as CommonJS, and `import.meta` is unusable in that mode.
if (require.main === module) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

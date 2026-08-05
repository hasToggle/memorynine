// CLI entrypoint for the seed script:
//   KNOWLEDGE_MONGODB_URI=... bun scripts/seed-evals.cli.ts
//
// Split from seed-evals.ts so the importable module (seed-evals.ts, which
// eval files import for post-erasure's restore step) never pulls in a
// CJS-only global. eve loads eval files by bundling them into an ESM chunk;
// its compat banner injects __filename, __dirname and require, but not
// `module` — so any `require.main === module` guard left in an imported
// module throws "module is not defined in ES module scope" at eval-discovery
// time, before any credentials are even needed. Keeping run() and its guard
// here, in a file nothing imports, means there is no run path to guard at
// all in the module eval files actually load.
import { MongoClient } from "mongodb";
import { seedEvals } from "./seed-evals";

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

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

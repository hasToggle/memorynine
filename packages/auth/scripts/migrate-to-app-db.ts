// Copies better-auth's collections off the MongoDB driver's implicit "test"
// database default and onto the explicit database the rest of the app
// already uses. See packages/auth/instance.ts and docs/knowledge-eval-
// findings.md's F3 for the history and the decision this executes.
//
//   MONGODB_URI=... bun scripts/migrate-to-app-db.ts             # dry run
//   MONGODB_URI=... bun scripts/migrate-to-app-db.ts --apply     # write
//
// Source/target database names default to "test" and (MONGODB_DB ?? "app"),
// matching packages/auth/instance.ts and packages/database/index.ts. Both
// live on the one cluster MONGODB_URI points at — this never opens a second
// connection. Override for testing with --source=<name>/--target=<name> or
// MONGODB_MIGRATE_SOURCE_DB/MONGODB_MIGRATE_TARGET_DB.
//
// DESIGN, all load-bearing:
//
// - COPY, NEVER MOVE. Nothing is ever deleted from the source database.
//   Dropping "test" is a separate, later, manual decision the maintainer
//   makes after confirming login works against the target.
// - DRY RUN BY DEFAULT. Only --apply writes anything; an accidental
//   invocation reports a plan and changes nothing.
// - IDEMPOTENT BY TOLERATING DUPLICATES, NOT BY PRE-READING. Documents are
//   inserted with insertMany({ ordered: false }), and duplicate-key (11000)
//   errors are swallowed rather than treated as failures: a document that
//   already exists at the same _id in the target is, by construction, a
//   copy of that same source document from an earlier run of this script —
//   nothing else writes to the target's better-auth collections before this
//   migration is applied and the config flip ships. Pre-reading every _id
//   first would cost an extra round trip per document for no benefit here.
// - COLLECTIONS ARE DISCOVERED, NOT HARDCODED. better-auth creates
//   collections lazily depending on which plugins are enabled (this repo
//   currently enables only `organization`, but `verification`, `jwks`,
//   `twoFactor`, `passkey`, etc. are plausible future additions) — a fixed
//   list would silently stop covering new ones.
// - INDEXES ARE COPIED TOO. better-auth relies on unique indexes (e.g.
//   user.email, session.token) to enforce constraints the app depends on;
//   copying documents without them leaves the target functionally broken
//   even once every document is in place. The implicit `_id_` index is
//   skipped — every collection already has it.
// - VERIFIED. After --apply, every collection is recounted on both sides
//   and the script exits non-zero on any mismatch.
//
// ORDERING (see packages/auth/instance.ts): this script must run, and its
// verify pass must come back clean, BEFORE any deploy that changes
// instance.ts's `client.db()` call to read `MONGODB_DB ?? "app"`. Deploying
// the config change first points the running app at an empty database and
// signs every user out.
//
// Never prints the connection string or any credential — only database
// names and counts.

import {
  type Collection,
  type Db,
  type Document,
  type IndexDescription,
  type IndexDescriptionInfo,
  MongoBulkWriteError,
  MongoClient,
} from "mongodb";

const DUPLICATE_KEY_ERROR_CODE = 11_000;
const INSERT_BATCH_SIZE = 500;
const DEFAULT_SOURCE_DB = "test";
const ID_INDEX_NAME = "_id_";
const SOURCE_FLAG_PREFIX = "--source=";
const TARGET_FLAG_PREFIX = "--target=";

interface Args {
  readonly apply: boolean;
  readonly source: string;
  readonly target: string;
}

export const parseArgs = (argv: readonly string[]): Args => {
  let apply = false;
  let source = process.env.MONGODB_MIGRATE_SOURCE_DB ?? DEFAULT_SOURCE_DB;
  let target =
    process.env.MONGODB_MIGRATE_TARGET_DB ?? process.env.MONGODB_DB ?? "app";

  for (const arg of argv) {
    if (arg === "--apply") {
      apply = true;
    } else if (arg.startsWith(SOURCE_FLAG_PREFIX)) {
      source = arg.slice(SOURCE_FLAG_PREFIX.length);
    } else if (arg.startsWith(TARGET_FLAG_PREFIX)) {
      target = arg.slice(TARGET_FLAG_PREFIX.length);
    } else {
      console.error(`Unrecognized argument: ${arg}`);
      process.exit(1);
    }
  }

  return { apply, source, target };
};

/** Strips server-reported metadata (`v`, `ns`) that `createIndexes` rejects. */
const toIndexSpec = (info: IndexDescriptionInfo): IndexDescription => {
  const {
    key,
    name,
    v: _v,
    ns: _ns,
    ...options
  } = info as IndexDescriptionInfo & {
    ns?: string;
  };
  return { key, name, ...options } as IndexDescription;
};

interface CollectionPlan {
  readonly indexSpecs: IndexDescription[];
  readonly name: string;
  readonly sourceCount: number;
  readonly targetCountBefore: number;
}

const listCollectionNames = async (db: Db): Promise<string[]> => {
  const collections = await db
    .listCollections({}, { nameOnly: false })
    .toArray();
  return collections
    .filter((info) => info.type !== "view" && !info.name.startsWith("system."))
    .map((info) => info.name)
    .sort();
};

const buildPlan = async (
  sourceDb: Db,
  targetDb: Db
): Promise<CollectionPlan[]> => {
  const names = await listCollectionNames(sourceDb);
  const plan: CollectionPlan[] = [];

  for (const name of names) {
    const sourceCollection = sourceDb.collection(name);
    const targetCollection = targetDb.collection(name);
    // biome-ignore lint/performance/noAwaitInLoops: one-time migration script; a handful of collections, sequential keeps the plan output ordered and any error attributable
    const sourceCount = await sourceCollection.countDocuments();
    const targetCountBefore = await targetCollection.countDocuments();
    const rawIndexes = await sourceCollection.indexes();
    const indexSpecs = rawIndexes
      .filter((index) => index.name !== ID_INDEX_NAME)
      .map(toIndexSpec);
    plan.push({ indexSpecs, name, sourceCount, targetCountBefore });
  }

  return plan;
};

const printPlan = (plan: CollectionPlan[], source: string, target: string) => {
  console.log(`Source database: "${source}"`);
  console.log(`Target database: "${target}"`);
  console.table(
    plan.map((entry) => ({
      collection: entry.name,
      "indexes to create": entry.indexSpecs.length,
      "source docs": entry.sourceCount,
      "target docs (before)": entry.targetCountBefore,
    }))
  );
};

const asWriteErrorArray = (writeErrors: MongoBulkWriteError["writeErrors"]) =>
  Array.isArray(writeErrors) ? writeErrors : [writeErrors];

const insertBatch = async (
  target: Collection<Document>,
  docs: Document[]
): Promise<{ inserted: number; skipped: number }> => {
  if (docs.length === 0) {
    return { inserted: 0, skipped: 0 };
  }

  try {
    const result = await target.insertMany(docs, { ordered: false });
    return { inserted: result.insertedCount, skipped: 0 };
  } catch (error) {
    if (error instanceof MongoBulkWriteError) {
      const writeErrors = asWriteErrorArray(error.writeErrors);
      const unexpected = writeErrors.filter(
        (writeError) => writeError.code !== DUPLICATE_KEY_ERROR_CODE
      );
      if (unexpected.length > 0) {
        throw error;
      }
      return {
        inserted: error.insertedCount,
        skipped: writeErrors.length,
      };
    }
    throw error;
  }
};

const copyCollectionDocuments = async (
  sourceCollection: Collection<Document>,
  targetCollection: Collection<Document>
): Promise<{ inserted: number; skipped: number }> => {
  let inserted = 0;
  let skipped = 0;
  let batch: Document[] = [];

  const flush = async () => {
    const result = await insertBatch(targetCollection, batch);
    inserted += result.inserted;
    skipped += result.skipped;
    batch = [];
  };

  const cursor = sourceCollection.find({}, { batchSize: INSERT_BATCH_SIZE });
  for await (const doc of cursor) {
    batch.push(doc);
    if (batch.length >= INSERT_BATCH_SIZE) {
      // Sequential by design: batches must land in order so a mid-copy
      // failure leaves a resumable prefix, not gaps.
      await flush();
    }
  }
  await flush();

  return { inserted, skipped };
};

const createMissingIndexes = async (
  target: Collection<Document>,
  specs: IndexDescription[]
): Promise<number> => {
  if (specs.length === 0) {
    return 0;
  }
  // createIndexes is itself idempotent: recreating an index identical to one
  // that already exists is a no-op, not an error.
  const created = await target.createIndexes(specs);
  return created.length;
};

const applyPlan = async (
  sourceDb: Db,
  targetDb: Db,
  plan: CollectionPlan[]
): Promise<void> => {
  for (const entry of plan) {
    const sourceCollection = sourceDb.collection(entry.name);
    const targetCollection = targetDb.collection(entry.name);

    // biome-ignore lint/performance/noAwaitInLoops: sequential one-time migration; collections are copied one at a time so progress output stays ordered and any error is attributable to a single collection
    const indexesCreated = await createMissingIndexes(
      targetCollection,
      entry.indexSpecs
    );
    const { inserted, skipped } = await copyCollectionDocuments(
      sourceCollection,
      targetCollection
    );
    console.log(
      `"${entry.name}": ${inserted} inserted, ${skipped} already present, ${indexesCreated} index(es) ensured.`
    );
  }
};

interface VerifyRow {
  readonly match: boolean;
  readonly name: string;
  readonly sourceCount: number;
  readonly targetCount: number;
}

const verify = async (
  sourceDb: Db,
  targetDb: Db,
  names: readonly string[]
): Promise<VerifyRow[]> => {
  const rows: VerifyRow[] = [];
  for (const name of names) {
    // biome-ignore lint/performance/noAwaitInLoops: sequential verification pass over a handful of collections
    const sourceCount = await sourceDb.collection(name).countDocuments();
    const targetCount = await targetDb.collection(name).countDocuments();
    rows.push({
      match: sourceCount === targetCount,
      name,
      sourceCount,
      targetCount,
    });
  }
  return rows;
};

const run = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is required");
    process.exit(1);
  }

  const { apply, source, target } = parseArgs(process.argv.slice(2));

  if (source === target) {
    console.error(
      `Source and target database names are both "${source}" — refusing to run. This migration copies FROM the source INTO the target; running it against a single database would be a self-referential no-op at best and a corruption risk at worst.`
    );
    process.exit(1);
  }

  const client = new MongoClient(uri);

  try {
    await client.connect();
    const sourceDb = client.db(source);
    const targetDb = client.db(target);

    const plan = await buildPlan(sourceDb, targetDb);

    if (plan.length === 0) {
      console.log(
        `Source database "${source}" has no collections. Nothing to migrate.`
      );
      return;
    }

    printPlan(plan, source, target);

    if (!apply) {
      console.log("\nDRY RUN — no changes made. Re-run with --apply to write.");
      return;
    }

    console.log("\nApplying...");
    await applyPlan(sourceDb, targetDb, plan);

    console.log("\nVerifying...");
    const names = plan.map((entry) => entry.name);
    const verifyRows = await verify(sourceDb, targetDb, names);
    console.table(
      verifyRows.map((row) => ({
        collection: row.name,
        match: row.match ? "OK" : "MISMATCH",
        "source docs": row.sourceCount,
        "target docs": row.targetCount,
      }))
    );

    const mismatches = verifyRows.filter((row) => !row.match);
    if (mismatches.length > 0) {
      console.error(
        `${mismatches.length} collection(s) failed verification. Do not deploy the packages/auth/instance.ts config change until this is clean.`
      );
      process.exit(1);
    }

    console.log(
      `\nAll ${verifyRows.length} collection(s) verified. "${source}" was left untouched — nothing was deleted from it. It is now safe to deploy the instance.ts config change; drop "${source}" only after confirming login works against "${target}".`
    );
  } finally {
    await client.close();
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

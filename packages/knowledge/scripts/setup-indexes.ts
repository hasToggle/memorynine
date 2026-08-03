// One-time / idempotent setup against the real Atlas cluster:
//   KNOWLEDGE_MONGODB_URI=... bun scripts/setup-indexes.ts
// Creates regular indexes everywhere, then the Atlas Search indexes. Three
// search indexes total (facts, organizations, people) — exactly the M0 limit.
import { MongoClient } from "mongodb";
import { ensureIndexes } from "../collections";
import {
  FACTS_VECTOR_INDEX_NAME,
  factsVectorIndexDefinition,
} from "../retrieval";
import {
  FACTS_SEARCH_INDEX_NAME,
  factsSearchIndexDefinition,
  ORGANIZATIONS_SEARCH_INDEX_NAME,
  organizationsSearchIndexDefinition,
  PEOPLE_SEARCH_INDEX_NAME,
  peopleSearchIndexDefinition,
} from "../search";

// Note the fourth entry: three text indexes was the M0 ceiling, and the
// vector index takes this past it. The autoEmbed index also needs a tier
// that supports Automated Embedding — M0/Flex/M10+ — so an M0 cluster will
// reject it and the script will report that rather than pretend it worked.
const SEARCH_INDEXES = [
  {
    collection: "facts",
    definition: factsSearchIndexDefinition,
    name: FACTS_SEARCH_INDEX_NAME,
    type: "search",
  },
  {
    collection: "facts",
    definition: factsVectorIndexDefinition,
    name: FACTS_VECTOR_INDEX_NAME,
    type: "vectorSearch",
  },
  {
    collection: "organizations",
    definition: organizationsSearchIndexDefinition,
    name: ORGANIZATIONS_SEARCH_INDEX_NAME,
    type: "search",
  },
  {
    collection: "people",
    definition: peopleSearchIndexDefinition,
    name: PEOPLE_SEARCH_INDEX_NAME,
    type: "search",
  },
] as const;

// Search indexes need Atlas (or mongod 8.2+ with search enabled); a plain
// mongod rejects the commands. Continue past exactly that case — anything
// else (auth, network, permissions) must surface, not be swallowed.
const SEARCH_UNSUPPORTED_REGEX =
  /listSearchIndexes|createSearchIndex|search index|Unrecognized|no such command|not allowed/i;

const isSearchUnsupported = (error: unknown): boolean =>
  error instanceof Error && SEARCH_UNSUPPORTED_REGEX.test(error.message);

const run = async () => {
  const uri = process.env.KNOWLEDGE_MONGODB_URI;
  if (!uri) {
    console.error("KNOWLEDGE_MONGODB_URI is required");
    process.exit(1);
  }

  const client = new MongoClient(uri);
  const db = client.db(process.env.KNOWLEDGE_MONGODB_DB ?? "knowledge");

  try {
    await ensureIndexes(db);
    console.log("Regular indexes ensured.");

    for (const { collection, definition, name, type } of SEARCH_INDEXES) {
      let existing: { name?: string }[] = [];
      try {
        // biome-ignore lint/performance/noAwaitInLoops: sequential one-time setup script
        existing = await db
          .collection(collection)
          .listSearchIndexes()
          .toArray();
      } catch (error) {
        if (!isSearchUnsupported(error)) {
          throw error;
        }
        console.warn(
          `Search indexes unavailable on this deployment (${(error as Error).message}); skipping "${name}".`
        );
        continue;
      }

      if (existing.some((index) => index.name === name)) {
        console.log(`Search index "${name}" already exists.`);
        continue;
      }
      await db
        .collection(collection)
        .createSearchIndex({ definition, name, type });
      console.log(`Search index "${name}" (${type}) created (builds async).`);
    }
  } finally {
    await client.close();
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

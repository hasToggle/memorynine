import { MongoClient } from "mongodb";
import { keys } from "./keys";

// Consumed by Next.js server code AND the eve agent runtime — a plain Node
// environment where `server-only`'s react-server export condition never
// resolves and its import-time throw would kill the app at startup. This
// guard preserves the fail-fast against browser bundling instead.
if (typeof window !== "undefined") {
  throw new Error(
    "@repo/knowledge/client is server-side only and must not reach a browser bundle"
  );
}

const globalForKnowledge = global as unknown as {
  knowledgeClient?: MongoClient;
};

const getKnowledgeClient = () => {
  if (!globalForKnowledge.knowledgeClient) {
    globalForKnowledge.knowledgeClient = new MongoClient(
      keys().KNOWLEDGE_MONGODB_URI,
      {
        appName: "knowledge",
        connectTimeoutMS: 10_000,
        // Present-but-undefined keys are omitted rather than stored as BSON
        // null — the fact lifecycle convention ("valid iff absent") and the
        // Zod schemas (.optional(), not .nullable()) depend on it.
        ignoreUndefined: true,
        maxIdleTimeMS: 30_000,
        // Serverless right-sizing: every warm function instance holds its own
        // pool, and small Atlas tiers cap at 500 connections cluster-wide.
        maxPoolSize: 5,
        serverSelectionTimeoutMS: 10_000,
        socketTimeoutMS: 60_000,
      }
    );
  }
  return globalForKnowledge.knowledgeClient;
};

export const getKnowledgeDb = () =>
  getKnowledgeClient().db(keys().KNOWLEDGE_MONGODB_DB ?? "knowledge");

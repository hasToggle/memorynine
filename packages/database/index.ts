import "server-only";

import { MongoClient } from "mongodb";
import { keys } from "./keys";
import type { Digest, Subscriber } from "./types";

const globalForMongo = global as unknown as { mongo: MongoClient };

const client =
  globalForMongo.mongo ||
  new MongoClient(keys().MONGODB_URI, {
    appName: "app-database",
    connectTimeoutMS: 10_000,
    maxIdleTimeMS: 30_000,
    // maxPoolSize sizing matches @repo/knowledge/client.ts's rationale (not
    // its full option set — that client also sets ignoreUndefined and a
    // different appName, neither of which this package needs): every warm
    // serverless instance holds its own pool, and small Atlas tiers cap at
    // 500 connections cluster-wide. Both packages point at the same cluster,
    // so sizing only one is pointless.
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 60_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForMongo.mongo = client;
}

// Named explicitly: MONGODB_URI has no database path (it ends in
// ".mongodb.net/"), and the driver's documented fallback in that case is a
// database literally named "test". Confirmed empirically that neither
// `test.subscribers` nor `test.digests` exists and no data has ever been
// written there, so this is a rename, not a migration.
const db = client.db(process.env.MONGODB_DB ?? "app");

export const database = {
  client,
  digest: db.collection<Digest>("digests"),
  subscriber: db.collection<Subscriber>("subscribers"),
};

// biome-ignore lint/performance/noBarrelFile: Package API re-export pattern for clean import surface
export { createId } from "@paralleldrive/cuid2";
export { ObjectId } from "mongodb";
export * from "./types";

import { afterAll, describe, expect, test } from "bun:test";
import type { MongoClient } from "mongodb";
// Consumed by both Next.js server code and the eve agent runtime (not a
// react-server environment), so this module must be importable anywhere that
// isn't a browser — a static import that throws would fail this whole file.
import { getKnowledgeDb } from "../client";

const uri = process.env.MONGODB_TEST_URI;

describe("client module", () => {
  test("is importable outside a react-server environment", () => {
    expect(typeof getKnowledgeDb).toBe("function");
  });

  describe.skipIf(!uri)("getKnowledgeDb", () => {
    afterAll(async () => {
      // The module keeps its singleton on globalThis; close it so the open
      // connection cannot keep the test process alive.
      const globalForKnowledge = globalThis as unknown as {
        knowledgeClient?: MongoClient;
      };
      await globalForKnowledge.knowledgeClient?.close();
    });

    test("omits explicit-undefined fields on write (lifecycle absence convention)", async () => {
      process.env.KNOWLEDGE_MONGODB_URI = uri;
      process.env.KNOWLEDGE_MONGODB_DB = "knowledge_test_client";
      const db = getKnowledgeDb();
      await db.dropDatabase();

      // Spreading a wider typed object naturally produces present-but-
      // undefined keys; the driver default would store them as BSON null,
      // which factSchema rejects and which breaks "valid iff absent".
      const probe = db.collection("probe");
      await probe.insertOne({ supersededBy: undefined, text: "x" });
      const doc = await probe.findOne({ text: "x" });

      expect(doc).not.toBeNull();
      expect(doc && "supersededBy" in doc).toBe(false);
      await db.dropDatabase();
    });
  });
});

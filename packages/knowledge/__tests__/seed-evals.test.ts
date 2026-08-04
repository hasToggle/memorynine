import { describe, expect, test } from "bun:test";
import type { Collection, Db } from "mongodb";
import { TENANT_ALPHA, TENANT_BETA } from "../fixtures";
import { EVAL_TENANTS, seedEvals } from "../scripts/seed-evals";

/**
 * Records every call it receives instead of talking to MongoDB. The only
 * thing under test here is *what filter/documents seedEvals sends*, so the
 * stub just needs to capture arguments and return shapes good enough to
 * satisfy the code paths in `seedEvals` and `ensureIndexes`.
 */
class FakeCollection {
  readonly deleteManyFilters: unknown[] = [];
  readonly insertManyDocs: unknown[][] = [];

  deleteMany(filter: unknown) {
    this.deleteManyFilters.push(filter);
    return Promise.resolve({ deletedCount: 0 });
  }

  insertMany(docs: unknown[]) {
    this.insertManyDocs.push(docs);
    return Promise.resolve({ insertedCount: docs.length });
  }

  createIndexes() {
    return Promise.resolve([]);
  }
}

class FakeDb {
  readonly collections = new Map<string, FakeCollection>();

  collection(name: string): FakeCollection {
    let existing = this.collections.get(name);
    if (!existing) {
      existing = new FakeCollection();
      this.collections.set(name, existing);
    }
    return existing;
  }
}

const asFakeCollection = (collection: Collection): FakeCollection =>
  collection as unknown as FakeCollection;

describe("seedEvals", () => {
  test("every delete is scoped to the eval tenants", async () => {
    const db = new FakeDb();

    await seedEvals(db as unknown as Db);

    expect(EVAL_TENANTS).toEqual([TENANT_ALPHA, TENANT_BETA]);
    expect(db.collections.size).toBeGreaterThan(0);
    for (const [name, collection] of db.collections) {
      expect(collection.deleteManyFilters).toEqual([
        { tenantId: { $in: EVAL_TENANTS } },
      ]);
      expect(name.length).toBeGreaterThan(0);
    }
  });

  test("never issues an unscoped deleteMany", async () => {
    const db = new FakeDb();

    await seedEvals(db as unknown as Db);

    for (const collection of db.collections.values()) {
      for (const filter of collection.deleteManyFilters) {
        expect(filter).not.toEqual({});
        expect(filter).toHaveProperty("tenantId");
      }
    }
  });

  test("inserts the fixture corpus once seeding completes", async () => {
    const db = new FakeDb();

    await seedEvals(db as unknown as Db);

    const organizations = asFakeCollection(
      db.collection("organizations") as unknown as Collection
    );
    const people = asFakeCollection(
      db.collection("people") as unknown as Collection
    );
    const engagements = asFakeCollection(
      db.collection("engagements") as unknown as Collection
    );
    const sources = asFakeCollection(
      db.collection("sources") as unknown as Collection
    );
    const facts = asFakeCollection(
      db.collection("facts") as unknown as Collection
    );

    expect(organizations.insertManyDocs).toHaveLength(1);
    expect(people.insertManyDocs).toHaveLength(1);
    expect(engagements.insertManyDocs).toHaveLength(1);
    expect(sources.insertManyDocs).toHaveLength(1);
    expect(facts.insertManyDocs).toHaveLength(1);
  });
});

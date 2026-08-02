import { describe, expect, test } from "bun:test";
import { currentlyValidFilter } from "../schemas/facts";
import {
  buildEntityNameSearchPipeline,
  buildFactsSearchPipeline,
  FACTS_SEARCH_INDEX_NAME,
  factsSearchIndexDefinition,
  ORGANIZATIONS_SEARCH_INDEX_NAME,
  organizationsSearchIndexDefinition,
  PEOPLE_SEARCH_INDEX_NAME,
  peopleSearchIndexDefinition,
} from "../search";

describe("currentlyValidFilter", () => {
  test("is the queryable form of the lifecycle convention", () => {
    // { field: null } matches null AND missing — together with ignoreUndefined
    // on the client this makes "valid iff both absent" queryable everywhere
    // (search, dossier reads, ask tools) without re-typing the invariant.
    expect(currentlyValidFilter).toEqual({
      supersededBy: null,
      validUntil: null,
    });
  });
});

describe("factsSearchIndexDefinition", () => {
  test("maps exactly the fields the pipeline filters on", () => {
    expect(factsSearchIndexDefinition.mappings.fields).toHaveProperty("text");
    expect(factsSearchIndexDefinition.mappings.fields.tenantId.type).toBe(
      "token"
    );
    expect(factsSearchIndexDefinition.mappings.fields.category.type).toBe(
      "token"
    );
    expect(factsSearchIndexDefinition.mappings.dynamic).toBe(false);
  });
});

describe("factsSearchIndexDefinition German analysis", () => {
  test("text carries a German multi and the pipeline queries both paths", () => {
    // German content wants lucene.german (compound stemming; since the July
    // 2025 stemmer change also ä/ö/ü→ae/oe/ue folding, so Müller matches
    // Mueller) while the default analyzer keeps code-switched English intact.
    expect(
      factsSearchIndexDefinition.mappings.fields.text.multi.german.analyzer
    ).toBe("lucene.german");

    const pipeline = buildFactsSearchPipeline({
      query: "Workshoppräferenz",
      tenantId: "test-tenant",
    });
    expect(pipeline[0]?.$search.compound.must[0]?.text.path).toEqual([
      "text",
      { multi: "german", value: "text" },
    ]);
  });
});

describe("entity name search", () => {
  test("index definitions map name for search and tenant for filtering", () => {
    expect(organizationsSearchIndexDefinition.mappings.dynamic).toBe(false);
    expect(organizationsSearchIndexDefinition.mappings.fields.name.type).toBe(
      "string"
    );
    expect(
      organizationsSearchIndexDefinition.mappings.fields.tenantId.type
    ).toBe("token");
    expect(peopleSearchIndexDefinition.mappings.fields.name.type).toBe(
      "string"
    );
  });

  test("pipeline fuzzy-matches names within the tenant", () => {
    const pipeline = buildEntityNameSearchPipeline({
      entity: "people",
      query: "Ana Schmit",
      tenantId: "test-tenant",
    });
    const search = pipeline[0]?.$search;
    expect(search.index).toBe(PEOPLE_SEARCH_INDEX_NAME);
    expect(search.compound.filter).toContainEqual({
      equals: { path: "tenantId", value: "test-tenant" },
    });
    expect(search.compound.must).toEqual([
      { text: { fuzzy: { maxEdits: 1 }, path: "name", query: "Ana Schmit" } },
    ]);
    expect(pipeline.at(-1)).toEqual({ $limit: 10 });
  });

  test("organizations pipeline uses its own index and respects limit", () => {
    const pipeline = buildEntityNameSearchPipeline({
      entity: "organizations",
      limit: 3,
      query: "Müler",
      tenantId: "test-tenant",
    });
    expect(pipeline[0]?.$search.index).toBe(ORGANIZATIONS_SEARCH_INDEX_NAME);
    expect(pipeline.at(-1)).toEqual({ $limit: 3 });
  });
});

describe("buildFactsSearchPipeline", () => {
  test("always filters by tenant and excludes superseded facts by default", () => {
    const pipeline = buildFactsSearchPipeline({
      query: "Workshop Präferenz",
      tenantId: "test-tenant",
    });
    const search = pipeline[0]?.$search;
    expect(search.index).toBe(FACTS_SEARCH_INDEX_NAME);
    expect(search.compound.filter).toContainEqual({
      equals: { path: "tenantId", value: "test-tenant" },
    });
    expect(pipeline).toContainEqual({
      $match: { supersededBy: null, validUntil: null },
    });
    expect(pipeline.at(-1)).toEqual({ $limit: 20 });
  });

  test("adds category filter and respects includeSuperseded + limit", () => {
    const pipeline = buildFactsSearchPipeline({
      category: "decision-process",
      includeSuperseded: true,
      limit: 5,
      query: "Budget",
      tenantId: "test-tenant",
    });
    expect(pipeline[0]?.$search.compound.filter).toContainEqual({
      equals: { path: "category", value: "decision-process" },
    });
    expect(
      pipeline.some(
        (stage) => "$match" in stage && stage.$match.supersededBy === null
      )
    ).toBe(false);
    expect(pipeline.at(-1)).toEqual({ $limit: 5 });
  });
});

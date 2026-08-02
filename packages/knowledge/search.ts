import type { Document } from "mongodb";
import { currentlyValidFilter, type FactCategory } from "./schemas/facts";

export const FACTS_SEARCH_INDEX_NAME = "facts_search";
export const ORGANIZATIONS_SEARCH_INDEX_NAME = "organizations_search";
export const PEOPLE_SEARCH_INDEX_NAME = "people_search";

// Atlas Search index over facts: full-text on the statement, token filters
// for tenant and category. dynamic:false — nothing else is searchable.
// The German multi buys compound stemming and (since the July 2025 stemmer
// change) ä/ö/ü→ae/oe/ue folding, while the default analyzer keeps
// code-switched English intact; queries hit both paths.
export const factsSearchIndexDefinition = {
  mappings: {
    dynamic: false,
    fields: {
      category: { type: "token" },
      tenantId: { type: "token" },
      text: {
        multi: {
          german: { analyzer: "lucene.german", type: "string" },
        },
        type: "string",
      },
    },
  },
} as const;

// Name lookup for the ingestion pipeline's resolve-context step ("did you
// mean Müller GmbH?") and review-queue dedupe suggestions. One index per
// collection — with facts_search that is three total, exactly the M0 limit.
const entityNameMappings = {
  mappings: {
    dynamic: false,
    fields: {
      name: { type: "string" },
      tenantId: { type: "token" },
    },
  },
} as const;

export const organizationsSearchIndexDefinition = entityNameMappings;
export const peopleSearchIndexDefinition = entityNameMappings;

const ENTITY_SEARCH_INDEX_NAMES = {
  organizations: ORGANIZATIONS_SEARCH_INDEX_NAME,
  people: PEOPLE_SEARCH_INDEX_NAME,
} as const;

export interface FactsSearchOptions {
  category?: FactCategory;
  includeSuperseded?: boolean;
  limit?: number;
  query: string;
  tenantId: string;
}

export const buildFactsSearchPipeline = ({
  tenantId,
  query,
  category,
  includeSuperseded = false,
  limit = 20,
}: FactsSearchOptions): Document[] => {
  const filter: Document[] = [
    { equals: { path: "tenantId", value: tenantId } },
  ];
  if (category) {
    filter.push({ equals: { path: "category", value: category } });
  }

  const pipeline: Document[] = [
    {
      $search: {
        compound: {
          filter,
          must: [
            {
              text: {
                fuzzy: { maxEdits: 1 },
                path: ["text", { multi: "german", value: "text" }],
                query,
              },
            },
          ],
        },
        index: FACTS_SEARCH_INDEX_NAME,
      },
    },
  ];

  if (!includeSuperseded) {
    pipeline.push({ $match: currentlyValidFilter });
  }

  pipeline.push({ $limit: limit });
  return pipeline;
};

export interface EntityNameSearchOptions {
  entity: keyof typeof ENTITY_SEARCH_INDEX_NAMES;
  limit?: number;
  query: string;
  tenantId: string;
}

export const buildEntityNameSearchPipeline = ({
  entity,
  limit = 10,
  query,
  tenantId,
}: EntityNameSearchOptions): Document[] => [
  {
    $search: {
      compound: {
        filter: [{ equals: { path: "tenantId", value: tenantId } }],
        must: [{ text: { fuzzy: { maxEdits: 1 }, path: "name", query } }],
      },
      index: ENTITY_SEARCH_INDEX_NAMES[entity],
    },
  },
  { $limit: limit },
];

// biome-ignore-all lint/performance/noBarrelFile: Package API re-export pattern for clean import surface

// DB bootstrapping (getKnowledgeDb) deliberately lives behind the
// `@repo/knowledge/client` subpath: the barrel must stay importable from
// every server runtime (Next.js, the eve agent app, Bun tests).
export { ObjectId } from "mongodb";
export type { KnowledgeCollections } from "./collections";
export { ensureIndexes, getCollections } from "./collections";
export type { ErasureReport } from "./erasure";
export { erasePerson } from "./erasure";
export { keys } from "./keys";
export type {
  EntityDecision,
  FactDecision,
  ResolveProposalItemsInput,
  ResolveProposalItemsResult,
} from "./review";
export { resolveProposalItems } from "./review";
export type { Engagement, Organization, Person } from "./schemas/entities";
export {
  engagementSchema,
  engagementStatusValues,
  organizationSchema,
  organizationStatusValues,
  personSchema,
} from "./schemas/entities";
export type { Fact, FactAnchors, FactCategory } from "./schemas/facts";
export {
  currentlyValidFilter,
  factAnchorsSchema,
  factCategoryValues,
  factSchema,
} from "./schemas/facts";
export type { EntityDraft, FactDraft, Proposal } from "./schemas/proposals";
export {
  entityDraftSchema,
  factDraftSchema,
  proposalSchema,
} from "./schemas/proposals";
export type { Source } from "./schemas/sources";
export { sourceSchema, sourceStatusValues } from "./schemas/sources";
export type { EntityNameSearchOptions, FactsSearchOptions } from "./search";
export {
  buildEntityNameSearchPipeline,
  buildFactsSearchPipeline,
  FACTS_SEARCH_INDEX_NAME,
  factsSearchIndexDefinition,
  ORGANIZATIONS_SEARCH_INDEX_NAME,
  organizationsSearchIndexDefinition,
  PEOPLE_SEARCH_INDEX_NAME,
  peopleSearchIndexDefinition,
} from "./search";

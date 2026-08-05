import type { Db, Document } from "mongodb";
import { getCollections } from "./collections";
import type { GatewayUsage, UsageContext } from "./gateway";
import type { Fact } from "./schemas/facts";
import { currentlyValidFilter, type FactCategory } from "./schemas/facts";
import { FACTS_SEARCH_INDEX_NAME } from "./search";

// The read path. Facts are written by extraction, consolidation, contradiction
// and review; until now nothing read them back.
//
// Retrieval is hybrid because German makes it necessary: compound nouns,
// internal jargon and product identifiers are exactly what dense embeddings
// lose, and on German legal retrieval BM25 beats every dense model outright.
// A lexical arm and a semantic arm are fused with reciprocal rank fusion, then
// a cross-encoder reranks the survivors.

export const FACTS_VECTOR_INDEX_NAME = "facts_vector";

/**
 * Automated Embedding: Atlas generates the vectors for `text` at index time
 * and for the query at search time, so no embedding column is stored on the
 * document and no embedding call happens in this process.
 *
 * `numDimensions` and `model` are immutable once the index exists — changing
 * either means rebuilding it. 2048 is voyage-4-large's native width and sits
 * above the 1024 floor Atlas recommends for quantized workloads.
 */
export const factsVectorIndexDefinition = {
  fields: [
    {
      modality: "text",
      model: "voyage-4-large",
      numDimensions: 2048,
      path: "text",
      quantization: "scalar",
      type: "autoEmbed",
    },
    // Pre-filters, not post-filters: $vectorSearch returns k nearest
    // neighbours and *then* the pipeline continues, so filtering afterwards
    // would let another tenant's documents consume this tenant's k.
    { path: "tenantId", type: "filter" },
    { path: "category", type: "filter" },
  ],
} as const;

/**
 * Lexical is weighted at least as heavily as semantic on purpose. German
 * compound nouns, ticket ids and product names are where dense retrieval is
 * weakest and where the lucene.german analyzer earns its keep.
 */
export const rankFusionWeights = { lexical: 0.5, semantic: 0.5 } as const;

/** Each arm over-fetches relative to the final cut; fusion can only rank
 * what the arms surfaced, and the reranker wants headroom too. */
const CANDIDATE_MULTIPLIER = 5;
const NUM_CANDIDATES_MULTIPLIER = 20;
const DEFAULT_LIMIT = 20;

export interface HybridFactsSearchOptions {
  category?: FactCategory;
  includeSuperseded?: boolean;
  limit?: number;
  query: string;
  tenantId: string;
}

export const buildHybridFactsPipeline = ({
  category,
  includeSuperseded = false,
  limit = DEFAULT_LIMIT,
  query,
  tenantId,
}: HybridFactsSearchOptions): Document[] => {
  const perArm = limit * CANDIDATE_MULTIPLIER;
  const lifecycle: Document[] = includeSuperseded
    ? []
    : [{ $match: { ...currentlyValidFilter } }];

  const lexicalFilter: Document[] = [
    { equals: { path: "tenantId", value: tenantId } },
  ];
  if (category) {
    lexicalFilter.push({ equals: { path: "category", value: category } });
  }

  const vectorFilter: Document = { tenantId };
  if (category) {
    vectorFilter.category = category;
  }

  return [
    {
      $rankFusion: {
        combination: { weights: { ...rankFusionWeights } },
        input: {
          pipelines: {
            lexical: [
              {
                $search: {
                  compound: {
                    filter: lexicalFilter,
                    must: [
                      {
                        text: {
                          fuzzy: { maxEdits: 1 },
                          // Both analyzer paths: the German multi for
                          // compound stemming and umlaut folding, the
                          // default for code-switched English.
                          path: ["text", { multi: "german", value: "text" }],
                          query,
                        },
                      },
                    ],
                  },
                  index: FACTS_SEARCH_INDEX_NAME,
                },
              },
              ...lifecycle,
              { $limit: perArm },
            ],
            semantic: [
              {
                $vectorSearch: {
                  filter: vectorFilter,
                  index: FACTS_VECTOR_INDEX_NAME,
                  limit: perArm,
                  numCandidates: limit * NUM_CANDIDATES_MULTIPLIER,
                  path: "text",
                  // Automated Embedding takes the query as text and embeds
                  // it server-side with the index's model.
                  query: { text: query },
                },
              },
              ...lifecycle,
            ],
          },
        },
        scoreDetails: true,
      },
    },
    { $limit: limit },
  ];
};

export interface RetrievedFact {
  fact: Fact;
  /** Present only when a reranker ran. */
  relevanceScore?: number;
}

export interface RetrieveFactsOptions extends HybridFactsSearchOptions {
  /**
   * Optional cross-encoder pass over the fused candidates. Omitted, results
   * come back in fusion order — useful for a cheap path, and the only option
   * until a rerank key is configured.
   */
  rerank?: (
    query: string,
    documents: Fact[]
  ) => Promise<RerankedDocument<Fact>[]>;
}

/**
 * The callable read path: fuse the two arms in the database, then optionally
 * rerank. Needs Atlas — `$search` and `$vectorSearch` run on mongot, which a
 * plain mongod does not have, so this composition is verified against a live
 * cluster rather than in the local test suite.
 */
export const retrieveFacts = async (
  db: Db,
  { rerank, ...search }: RetrieveFactsOptions
): Promise<RetrievedFact[]> => {
  const { facts } = getCollections(db);
  const fused = await facts
    .aggregate<Fact>(buildHybridFactsPipeline(search))
    .toArray();

  if (!rerank || fused.length === 0) {
    return fused.map((fact) => ({ fact }));
  }
  const ranked = await rerank(search.query, fused);
  return ranked.map(({ document, relevanceScore }) => ({
    fact: document,
    relevanceScore,
  }));
};

export interface RerankableDocument {
  text: string;
}

export interface RerankedDocument<T extends RerankableDocument> {
  document: T;
  relevanceScore: number;
}

export interface VoyageRerankConfig {
  apiKey?: string;
  baseUrl?: string;
  /** Injectable for tests; only ever called as (url, init). */
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>;
  model?: string;
  /**
   * Telemetry hook, called once per successful response. The endpoint
   * reports tokens, not dollars, so the usage handed here is *computed* from
   * `RERANK_COST_PER_MILLION_TOKENS`, and the context this receives always
   * has `estimated: true` set — never allowed to fail the rerank call it's
   * reporting on, same contract as the gateway's `onUsage`.
   */
  onUsage?: (usage: GatewayUsage, context?: UsageContext) => void;
  /** Documents handed to the cross-encoder. Beyond this the tail is dropped. */
  topK?: number;
}

// MongoDB acquired Voyage AI and now serves the same models from its own
// endpoint, authenticated with an Atlas *model* API key rather than a
// voyageai.com key. The wire format is unchanged — same request fields, same
// `{ data: [{ index, relevance_score }] }` response, same model names — so
// only the host differs. Pointing an Atlas key at api.voyageai.com returns a
// 403 that names the mismatch, which is how this was found.
const DEFAULT_RERANK_BASE_URL = "https://ai.mongodb.com/v1";
// The lite model is the interactive default: the quality gap on short
// candidates is small and this sits on the latency-sensitive path.
const DEFAULT_RERANK_MODEL = "rerank-2.5-lite";
const DEFAULT_TOP_K = 50;
const TOKENS_PER_MILLION = 1_000_000;

/**
 * MongoDB's rerank endpoint returns `{"usage":{"total_tokens":N}}` — tokens
 * only, no cost, unlike the AI Gateway (which returns dollars directly). So
 * this is the one figure in the system computed from a rate constant rather
 * than reported by the vendor, and rows derived from it are flagged
 * `estimated: true` so an estimate can never be mistaken for an exact figure.
 *
 * Rate for rerank-2.5-lite, checked 2026-08-04: $0.02 / 1M tokens. Re-check
 * when MongoDB reprices — nothing here will notice on its own.
 */
export const RERANK_COST_PER_MILLION_TOKENS = 0.02;

/**
 * Cross-encoder reranking over the fused candidate set.
 *
 * Deliberately the API rather than the `$rerank` aggregation stage: a stage is
 * bound to one collection, whereas this takes an arbitrary list and can
 * therefore rank facts and raw source excerpts against each other — which
 * matters, because a facts-only read path measurably loses recall.
 *
 * Errors propagate. A reranker that silently falls back to fusion order turns
 * a broken dependency into a quiet quality regression.
 */
export const createVoyageRerank = <T extends RerankableDocument>(
  config: VoyageRerankConfig = {}
): ((
  query: string,
  documents: T[],
  context?: UsageContext
) => Promise<RerankedDocument<T>[]>) => {
  const apiKey = config.apiKey ?? process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "VOYAGE_API_KEY is required (pass config.apiKey or set the env var)"
    );
  }
  const baseUrl = config.baseUrl ?? DEFAULT_RERANK_BASE_URL;
  const doFetch = config.fetchImpl ?? fetch;
  const model = config.model ?? DEFAULT_RERANK_MODEL;
  const { onUsage } = config;
  const topK = config.topK ?? DEFAULT_TOP_K;

  return async (query, documents, context?: UsageContext) => {
    if (documents.length === 0) {
      return [];
    }
    const candidates = documents.slice(0, topK);
    const res = await doFetch(`${baseUrl}/rerank`, {
      body: JSON.stringify({
        documents: candidates.map((candidate) => candidate.text),
        model,
        query,
      }),
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`rerank ${res.status}: ${body.slice(0, 500)}`);
    }
    const data = (await res.json()) as {
      data?: { index: number; relevance_score: number }[];
      usage?: { total_tokens?: number };
    };

    const ranked: RerankedDocument<T>[] = [];
    for (const entry of data.data ?? []) {
      const document = candidates[entry.index];
      // The service echoes positions from the list it was sent; a position
      // outside it means the response does not describe this request, and
      // emitting undefined downstream would be worse than dropping it.
      if (document) {
        ranked.push({ document, relevanceScore: entry.relevance_score });
      }
    }

    if (onUsage) {
      const totalTokens = data.usage?.total_tokens ?? 0;
      const cost =
        (totalTokens / TOKENS_PER_MILLION) * RERANK_COST_PER_MILLION_TOKENS;
      const usage: GatewayUsage = {
        cachedTokens: 0,
        completionTokens: 0,
        // Rerank has no surcharge — the estimated figure IS the inference
        // cost. gatewayCost === inferenceCost + surchargeCost must hold for
        // every row this system writes, from any source; setting
        // surchargeCost to `cost` here would fabricate a surcharge that was
        // never charged and double the true figure once gatewayCost is
        // summed against it.
        gatewayCost: cost,
        inferenceCost: cost,
        model,
        promptTokens: totalTokens,
        reasoningTokens: 0,
        surchargeCost: 0,
      };
      // Telemetry must never fail the rerank call it's reporting on — same
      // contract as the gateway's onUsage.
      try {
        onUsage(usage, context ? { ...context, estimated: true } : undefined);
      } catch {
        // swallowed deliberately
      }
    }

    return ranked;
  };
};

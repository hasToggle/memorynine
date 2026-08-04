import { describe, expect, test } from "bun:test";
import type { Document } from "mongodb";
import { ObjectId } from "mongodb";
import type { UsageContext } from "../gateway";
import {
  buildHybridFactsPipeline,
  createVoyageRerank,
  FACTS_VECTOR_INDEX_NAME,
  factsVectorIndexDefinition,
  RERANK_COST_PER_MILLION_TOKENS,
  rankFusionWeights,
} from "../retrieval";

const TENANT = "org_1";
const rerankErrorPattern = /rerank 500/;

describe("factsVectorIndexDefinition", () => {
  test("indexes fact text with automated embedding", () => {
    const [embed] = factsVectorIndexDefinition.fields;

    expect(embed.type).toBe("autoEmbed");
    expect(embed.path).toBe("text");
    expect(embed.modality).toBe("text");
  });

  test("exposes tenantId and category as pre-filters", () => {
    const filters = factsVectorIndexDefinition.fields
      .filter((field) => field.type === "filter")
      .map((field) => field.path);

    // Tenant isolation has to happen inside $vectorSearch, not after it —
    // a post-$match would let another tenant's documents consume the k
    // nearest neighbours and silently shrink this tenant's recall.
    expect(filters).toContain("tenantId");
    expect(filters).toContain("category");
  });
});

describe("buildHybridFactsPipeline", () => {
  const pipeline = buildHybridFactsPipeline({
    query: "Vormittagstermine",
    tenantId: TENANT,
  });
  const fusion = pipeline[0]?.$rankFusion;
  const lexical: Document[] = fusion?.input?.pipelines?.lexical ?? [];
  const semantic: Document[] = fusion?.input?.pipelines?.semantic ?? [];

  test("fuses a lexical and a semantic arm", () => {
    expect(Object.keys(fusion?.input?.pipelines ?? {}).sort()).toEqual([
      "lexical",
      "semantic",
    ]);
    expect(fusion?.combination?.weights).toEqual(rankFusionWeights);
  });

  test("the semantic arm passes query text, not a vector", () => {
    const stage = semantic[0]?.$vectorSearch;

    // Automated embedding takes { text }, not a bare string and not a
    // precomputed queryVector.
    expect(stage?.query).toEqual({ text: "Vormittagstermine" });
    expect(stage?.queryVector).toBeUndefined();
    expect(stage?.index).toBe(FACTS_VECTOR_INDEX_NAME);
    expect(stage?.path).toBe("text");
  });

  test("both arms are tenant-scoped", () => {
    expect(semantic[0]?.$vectorSearch?.filter?.tenantId).toBe(TENANT);
    expect(JSON.stringify(lexical)).toContain(TENANT);
  });

  test("both arms exclude superseded facts", () => {
    const lexicalMatch = lexical.find((stage) => stage.$match);
    const semanticMatch = semantic.find((stage) => stage.$match);

    expect(lexicalMatch?.$match?.supersededBy).toBeNull();
    expect(semanticMatch?.$match?.supersededBy).toBeNull();
    expect(lexicalMatch?.$match?.validUntil).toBeNull();
    expect(semanticMatch?.$match?.validUntil).toBeNull();
  });

  test("includeSuperseded lifts the lifecycle filter from both arms", () => {
    const all = buildHybridFactsPipeline({
      includeSuperseded: true,
      query: "x",
      tenantId: TENANT,
    });
    const arms: Record<string, Document[]> =
      all[0]?.$rankFusion?.input?.pipelines ?? {};

    for (const stages of Object.values(arms)) {
      expect(stages.some((stage) => stage.$match)).toBe(false);
    }
  });

  test("narrows both arms by category when one is given", () => {
    const scoped = buildHybridFactsPipeline({
      category: "preference",
      query: "x",
      tenantId: TENANT,
    });
    const arms: Record<string, Document[]> =
      scoped[0]?.$rankFusion?.input?.pipelines ?? {};

    expect(arms.semantic[0]?.$vectorSearch?.filter?.category).toBe(
      "preference"
    );
    expect(JSON.stringify(arms.lexical)).toContain("preference");
  });

  test("asks for more candidates per arm than it finally returns", () => {
    const limited = buildHybridFactsPipeline({
      limit: 10,
      query: "x",
      tenantId: TENANT,
    });
    const arms: Record<string, Document[]> =
      limited[0]?.$rankFusion?.input?.pipelines ?? {};
    const finalLimit = limited.at(-1)?.$limit;

    // Fusion can only rank what each arm surfaced, so each arm must
    // over-fetch relative to the final cut.
    expect(finalLimit).toBe(10);
    expect(arms.semantic[0]?.$vectorSearch?.limit).toBeGreaterThan(10);
    expect(arms.lexical.at(-1)?.$limit).toBeGreaterThan(10);
  });
});

describe("createVoyageRerank", () => {
  const doc = (text: string) => ({ _id: new ObjectId(), text });

  test("returns documents reordered by the service's ranking", async () => {
    const rerank = createVoyageRerank({
      apiKey: "k",
      fetchImpl: () =>
        Promise.resolve(
          Response.json({
            data: [
              { index: 2, relevance_score: 0.9 },
              { index: 0, relevance_score: 0.4 },
            ],
          })
        ),
    });
    const docs = [doc("a"), doc("b"), doc("c")];

    const ranked = await rerank("frage", docs);

    expect(ranked.map((r) => r.document.text)).toEqual(["c", "a"]);
    expect(ranked[0]?.relevanceScore).toBe(0.9);
  });

  test("an empty candidate list never calls the service", async () => {
    const rerank = createVoyageRerank({
      apiKey: "k",
      fetchImpl: () => Promise.reject(new Error("must not be called")),
    });

    expect(await rerank("frage", [])).toEqual([]);
  });

  test("surfaces a service error instead of silently returning input order", async () => {
    const rerank = createVoyageRerank({
      apiKey: "k",
      fetchImpl: () => Promise.resolve(new Response("nope", { status: 500 })),
    });

    await expect(rerank("frage", [doc("a")])).rejects.toThrow(
      rerankErrorPattern
    );
  });

  test("ignores an out-of-range index rather than emitting undefined", async () => {
    const rerank = createVoyageRerank({
      apiKey: "k",
      fetchImpl: () =>
        Promise.resolve(
          Response.json({
            data: [
              { index: 7, relevance_score: 0.9 },
              { index: 0, relevance_score: 0.4 },
            ],
          })
        ),
    });

    const ranked = await rerank("frage", [doc("a")]);

    expect(ranked).toHaveLength(1);
    expect(ranked[0].document.text).toBe("a");
  });

  test("reports estimated usage from the token count it is given", async () => {
    const seen: { estimated?: boolean; gatewayCost: number }[] = [];
    const rerank = createVoyageRerank<{ text: string }>({
      apiKey: "test",
      fetchImpl: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: [{ index: 0, relevance_score: 0.9 }],
              usage: { total_tokens: 1_000_000 },
            }),
            { status: 200 }
          )
        ),
      onUsage: (usage) => {
        seen.push({ estimated: true, gatewayCost: usage.gatewayCost });
      },
    });

    await rerank("q", [{ text: "a" }]);

    expect(seen).toHaveLength(1);
    // One million tokens at the documented rate.
    expect(seen[0]?.gatewayCost).toBeCloseTo(RERANK_COST_PER_MILLION_TOKENS, 6);
  });

  test("flags the context as estimated so recordUsage can mark the row", async () => {
    const contexts: (UsageContext | undefined)[] = [];
    const rerank = createVoyageRerank<{ text: string }>({
      apiKey: "test",
      fetchImpl: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: [{ index: 0, relevance_score: 0.9 }],
              usage: { total_tokens: 100 },
            }),
            { status: 200 }
          )
        ),
      onUsage: (_usage, context) => {
        contexts.push(context);
      },
    });

    await rerank("q", [{ text: "a" }], {
      operation: "rerank",
      tenantId: "org_1",
    });

    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toEqual({
      estimated: true,
      operation: "rerank",
      tenantId: "org_1",
    });
  });

  test("a throwing onUsage does not fail the rerank call", async () => {
    const rerank = createVoyageRerank<{ text: string }>({
      apiKey: "test",
      fetchImpl: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: [{ index: 0, relevance_score: 0.9 }],
              usage: { total_tokens: 100 },
            }),
            { status: 200 }
          )
        ),
      onUsage: (): void => {
        throw new Error("telemetry boom");
      },
    });

    const ranked = await rerank("q", [{ text: "a" }]);

    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.relevanceScore).toBe(0.9);
  });

  test("never calls onUsage when the service is unreachable", async () => {
    let calls = 0;
    const rerank = createVoyageRerank<{ text: string }>({
      apiKey: "test",
      fetchImpl: () => Promise.resolve(new Response("nope", { status: 500 })),
      onUsage: () => {
        calls += 1;
      },
    });

    await expect(rerank("q", [{ text: "a" }])).rejects.toThrow(
      rerankErrorPattern
    );
    expect(calls).toBe(0);
  });
});

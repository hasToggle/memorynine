import { describe, expect, test } from "bun:test";
import { createGatewayGenerate, parseGatewayUsage } from "../gateway";

const missingKeyPattern = /AI_GATEWAY_API_KEY/;

// A real response captured from the live gateway on 2026-08-04. Field names
// (gateway_cost, surcharge_cost, zero_data_retention_cost,
// prompt_tokens_details.cached_tokens, completion_tokens_details.reasoning_tokens)
// are exactly what the API returns — do not "correct" them.
const LIVE_RESPONSE = {
  choices: [
    {
      message: {
        content: "ok",
        provider_metadata: {
          gateway: { generationId: "gen_01KZ7050NYR88KTFWZBSTQY62N" },
        },
      },
    },
  ],
  model: "deepseek/deepseek-v4-flash-0731",
  usage: {
    cache_creation_input_tokens: 0,
    completion_tokens: 16,
    completion_tokens_details: { image_tokens: 0, reasoning_tokens: 4 },
    cost: 1.638e-5,
    gateway_cost: 0.000_116_38,
    prompt_tokens: 85,
    prompt_tokens_details: {
      audio_tokens: 0,
      cached_tokens: 12,
      video_tokens: 0,
    },
    surcharge_cost: 0.0001,
    zero_data_retention_cost: 0.0001,
  },
};

describe("createGatewayGenerate", () => {
  test("throws at construction when no API key is available", () => {
    const previous = process.env.AI_GATEWAY_API_KEY;
    process.env.AI_GATEWAY_API_KEY = undefined;
    delete process.env.AI_GATEWAY_API_KEY;
    try {
      expect(() => createGatewayGenerate()).toThrow(missingKeyPattern);
    } finally {
      if (previous !== undefined) {
        process.env.AI_GATEWAY_API_KEY = previous;
      }
    }
  });

  test("builds a generate function from explicit config", () => {
    const generate = createGatewayGenerate({ apiKey: "test-key" });
    expect(typeof generate).toBe("function");
  });

  test("a throwing onUsage does not fail the generate call", async () => {
    const generate = createGatewayGenerate({
      apiKey: "test",
      fetchImpl: () =>
        Promise.resolve(
          new Response(JSON.stringify(LIVE_RESPONSE), { status: 200 })
        ),
      onUsage: () => {
        throw new Error("telemetry is down");
      },
    });
    expect(await generate("hi")).toBe("ok");
  });
});

describe("parseGatewayUsage", () => {
  test("reads every cost and token field from a live response shape", () => {
    const usage = parseGatewayUsage(LIVE_RESPONSE);
    expect(usage).toEqual({
      cachedTokens: 12,
      completionTokens: 16,
      gatewayCost: 0.000_116_38,
      generationId: "gen_01KZ7050NYR88KTFWZBSTQY62N",
      inferenceCost: 1.638e-5,
      model: "deepseek/deepseek-v4-flash-0731",
      promptTokens: 85,
      reasoningTokens: 4,
      surchargeCost: 0.0001,
    });
  });

  test("keeps inference and gateway cost distinct", () => {
    const usage = parseGatewayUsage(LIVE_RESPONSE);
    if (!usage) {
      throw new Error("expected usage to be defined");
    }
    // The ZDR surcharge was 6x the inference on this call. A report that
    // conflates them understates the bill and points optimisation at tokens
    // when the driver is request count.
    expect(usage.gatewayCost).toBeGreaterThan(usage.inferenceCost * 5);
  });

  test("returns undefined when the response carries no usage", () => {
    expect(
      parseGatewayUsage({ choices: [{ message: { content: "ok" } }] })
    ).toBeUndefined();
  });

  test("tolerates missing optional sub-objects", () => {
    const usage = parseGatewayUsage({
      model: "m",
      usage: {
        completion_tokens: 2,
        cost: 1,
        gateway_cost: 2,
        prompt_tokens: 1,
        surcharge_cost: 1,
      },
    });
    expect(usage?.cachedTokens).toBe(0);
    expect(usage?.reasoningTokens).toBe(0);
    expect(usage?.generationId).toBeUndefined();
  });
});

import { describe, expect, test } from "bun:test";
import { createGatewayGenerate } from "../gateway";

const missingKeyPattern = /AI_GATEWAY_API_KEY/;

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
});

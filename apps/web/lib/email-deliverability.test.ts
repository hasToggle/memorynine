import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { validateEmail } from "./email-validation";

// Override the preload mock to provide an API key so deliverability checks run
mock.module("@/env", () => ({
  env: {
    ABSTRACT_API_KEY: "test-key",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    NEXT_PUBLIC_WEB_URL: "http://localhost:3001",
    RESEND_FROM: "test@example.com",
  },
}));

const fetchSpy = spyOn(globalThis, "fetch");

afterEach(() => {
  fetchSpy.mockReset();
});

describe("email deliverability (Abstract API)", () => {
  test("skips API call for trusted domains", async () => {
    const result = await validateEmail("user@gmail.com");
    expect(result.valid).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("rejects undeliverable emails", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ deliverability: "UNDELIVERABLE" }), {
        status: 200,
      })
    );

    const result = await validateEmail("user@sketchy-domain.xyz");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("undeliverable");
    }
  });

  test("accepts deliverable emails", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ deliverability: "DELIVERABLE" }), {
        status: 200,
      })
    );

    const result = await validateEmail("user@real-company.com");
    expect(result.valid).toBe(true);
  });

  test("accepts RISKY emails (fail open)", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ deliverability: "RISKY" }), {
        status: 200,
      })
    );

    const result = await validateEmail("user@risky-domain.com");
    expect(result.valid).toBe(true);
  });

  test("fails open on HTTP error", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response("Service Unavailable", { status: 503 })
    );

    const result = await validateEmail("user@some-domain.com");
    expect(result.valid).toBe(true);
  });

  test("fails open on unexpected response shape", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ unexpected: "shape" }), { status: 200 })
    );

    const result = await validateEmail("user@weird-api-response.com");
    expect(result.valid).toBe(true);
  });

  test("fails open on network error", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("Network error"));

    const result = await validateEmail("user@network-fail.com");
    expect(result.valid).toBe(true);
  });

  test("fails open on timeout", async () => {
    const timeoutError = new DOMException("Signal timed out", "TimeoutError");
    fetchSpy.mockRejectedValueOnce(timeoutError);

    const result = await validateEmail("user@slow-domain.com");
    expect(result.valid).toBe(true);
  });
});

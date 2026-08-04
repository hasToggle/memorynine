import { describe, expect, test } from "bun:test";
import { classifyZdrResponse } from "../scripts/probe-zdr";

describe("classifyZdrResponse", () => {
  test("2xx is covered", () => {
    expect(classifyZdrResponse(200, '{"id":"chatcmpl-1"}').verdict).toBe(
      "covered"
    );
  });

  test("400 no_providers_available is not-covered", () => {
    const body = JSON.stringify({
      error: "No ZDR (Zero Data Retention) providers available for model: x",
      type: "no_providers_available",
    });
    expect(classifyZdrResponse(400, body).verdict).toBe("not-covered");
  });

  // The one case this whole probe exists to get right: a bad key must never
  // read as "not ZDR-covered".
  test("401 is auth-error, not not-covered", () => {
    const body = JSON.stringify({ error: "Invalid API key", type: "auth" });
    expect(classifyZdrResponse(401, body).verdict).toBe("auth-error");
  });

  test("403 is auth-error", () => {
    expect(classifyZdrResponse(403, '{"error":"Forbidden"}').verdict).toBe(
      "auth-error"
    );
  });

  test("404 is unknown-model", () => {
    expect(
      classifyZdrResponse(404, '{"error":"model not found"}').verdict
    ).toBe("unknown-model");
  });

  test("400 model_not_found type is unknown-model", () => {
    const body = JSON.stringify({
      error: "Unknown model",
      type: "model_not_found",
    });
    expect(classifyZdrResponse(400, body).verdict).toBe("unknown-model");
  });

  test("unrecognized error is other-error, not silently covered", () => {
    const body = JSON.stringify({ error: "Internal error", type: "server" });
    expect(classifyZdrResponse(500, body).verdict).toBe("other-error");
  });

  test("unparsable body never throws", () => {
    expect(() => classifyZdrResponse(500, "not json")).not.toThrow();
    expect(classifyZdrResponse(500, "not json").verdict).toBe("other-error");
  });
});

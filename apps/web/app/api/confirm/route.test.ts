import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { POST } from "./route";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3001/api/confirm", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

describe("/api/confirm", () => {
  test("rejects disposable email addresses", async () => {
    const response = await POST(makeRequest({ email: "test@mailinator.com" }));
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error.message).toContain("doesn't look quite right");
  });

  test("rejects invalid email format", async () => {
    const response = await POST(makeRequest({ email: "not-an-email" }));
    expect(response.status).toBe(400);
  });
});

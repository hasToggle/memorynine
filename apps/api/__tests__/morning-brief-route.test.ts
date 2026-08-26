import { afterEach, describe, expect, test } from "bun:test";

// The route must be importable with no mail or DB env: @repo/email validates
// env at module load, so the route may only lazy-import it inside the send
// closure (pattern: packages/auth/emails.ts).
import { GET } from "../app/cron/morning-brief/route";

const originalSecret = process.env.CRON_SECRET;
const originalFrom = process.env.RESEND_FROM;

afterEach(() => {
  process.env.CRON_SECRET = originalSecret;
  process.env.RESEND_FROM = originalFrom;
});

describe("GET /cron/morning-brief", () => {
  test("503 when CRON_SECRET is unset (fail closed)", async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(new Request("http://api/cron/morning-brief"));
    expect(response.status).toBe(503);
  });

  test("401 on a wrong bearer token", async () => {
    process.env.CRON_SECRET = "right";
    const response = await GET(
      new Request("http://api/cron/morning-brief", {
        headers: { authorization: "Bearer wrong" },
      })
    );
    expect(response.status).toBe(401);
  });

  test("503 when RESEND_FROM is unset (fail closed before any work)", async () => {
    process.env.CRON_SECRET = "right";
    delete process.env.RESEND_FROM;
    const response = await GET(
      new Request("http://api/cron/morning-brief", {
        headers: { authorization: "Bearer right" },
      })
    );
    expect(response.status).toBe(503);
  });
});

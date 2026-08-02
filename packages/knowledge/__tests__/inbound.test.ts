import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { MongoClient } from "mongodb";
import { ensureIndexes, getCollections } from "../collections";
import { createEmailSource, parseInboundSenderMap } from "../inbound";

const uri = process.env.MONGODB_TEST_URI;
const noContentPattern = /content/i;

describe("parseInboundSenderMap", () => {
  test("maps lowercased sender addresses to tenant ids", () => {
    const map = parseInboundSenderMap(
      '{"Eric@Forsuxess.de": "org_1", "assistant@firma.de": "org_2"}'
    );
    expect(map.get("eric@forsuxess.de")).toBe("org_1");
    expect(map.get("assistant@firma.de")).toBe("org_2");
  });

  test("undefined or empty input yields an empty map", () => {
    expect(parseInboundSenderMap(undefined).size).toBe(0);
    expect(parseInboundSenderMap("").size).toBe(0);
  });

  test("invalid JSON throws loudly — a silent empty allowlist would drop every email", () => {
    expect(() => parseInboundSenderMap("not json")).toThrow();
    expect(() => parseInboundSenderMap('["a@b.de"]')).toThrow();
  });
});

describe.skipIf(!uri)("createEmailSource", () => {
  const client = new MongoClient(uri ?? "mongodb://localhost:27017");
  const db = client.db("knowledge_test_inbound");
  const { sources } = getCollections(db);

  beforeAll(async () => {
    await client.connect();
    await db.dropDatabase();
    await ensureIndexes(db);
  });

  beforeEach(async () => {
    await sources.deleteMany({});
  });

  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
  });

  const input = {
    content: "Sehr geehrte Damen und Herren, anbei die Anfrage …",
    forwardedBy: "eric@forsuxess.de",
    messageId: "re_msg_123",
    originalSender: "anna@nordwind.de",
    sentAt: new Date("2026-08-02T18:00:00Z"),
    subject: "Workshop-Anfrage",
  };

  test("creates a received email source ready for the extraction sweep", async () => {
    const result = await createEmailSource(db, "org_1", input);

    expect(result.status).toBe("created");
    const source = await sources.findOne({ _id: result.sourceId });
    expect(source?.type).toBe("email");
    expect(source?.status).toBe("received");
    expect(source?.content).toBe(input.content);
    expect(source?.email?.messageId).toBe("re_msg_123");
    expect(source?.capturedBy).toBe("eric@forsuxess.de");
  });

  test("webhook retries do not create duplicates", async () => {
    const first = await createEmailSource(db, "org_1", input);
    const second = await createEmailSource(db, "org_1", input);

    expect(second.status).toBe("duplicate");
    expect(second.sourceId.equals(first.sourceId)).toBe(true);
    expect(await sources.countDocuments({})).toBe(1);
  });

  test("the same message id in another tenant is a separate source", async () => {
    await createEmailSource(db, "org_1", input);
    const other = await createEmailSource(db, "org_2", input);

    expect(other.status).toBe("created");
    expect(await sources.countDocuments({})).toBe(2);
  });

  test("rejects empty content — nothing to extract from", async () => {
    await expect(
      createEmailSource(db, "org_1", { ...input, content: "   " })
    ).rejects.toThrow(noContentPattern);
  });
});

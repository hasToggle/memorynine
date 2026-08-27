import { describe, expect, test } from "bun:test";
import { ObjectId } from "mongodb";
import { composeReceipt, type ReceiptSource } from "../receipt";
import type { Fact } from "../schemas/facts";

const TENANT = "test-tenant";
const NOW = new Date("2026-08-09T10:00:00Z");

const names: Record<string, string> = {
  "eric@example.com": "Eric Brandt",
  user_marie: "Marie Lang",
};
const nameOf = (key: string) => names[key] ?? "a teammate";

const makeFact = (overrides: Partial<Fact> = {}): Fact =>
  ({
    _id: new ObjectId("6a70f2dac615029be026bab7"),
    anchors: { organizationId: new ObjectId() },
    category: "preference",
    confidence: 0.9,
    confirmedBy: "user_marie",
    createdAt: new Date("2026-03-14T08:00:00Z"),
    sourceId: new ObjectId(),
    tenantId: TENANT,
    text: "Anna Bergmann entscheidet am späten Vormittag.",
    updatedAt: new Date("2026-03-14T08:00:00Z"),
    validFrom: new Date("2026-03-13T00:00:00Z"),
    ...overrides,
  }) as Fact;

const makeSource = (overrides: Partial<ReceiptSource> = {}): ReceiptSource => ({
  _id: new ObjectId(),
  capturedBy: "eric@example.com",
  createdAt: new Date("2026-03-13T17:20:00Z"),
  excerpt:
    "…und bitte nichts vor zehn, die Anna macht ihre Entscheidungen am liebsten morgens.",
  occurredAt: new Date("2026-03-13T00:00:00Z"),
  status: "reviewed",
  type: "voice",
  ...overrides,
});

const detail = (
  receipt: { rows: { detail: string; label: string }[] },
  label: string
) => receipt.rows.find((row) => row.label === label)?.detail;

describe("composeReceipt — a confirmed, uncontested fact", () => {
  const receipt = composeReceipt({
    contested: false,
    fact: makeFact(),
    nameOf,
    now: NOW,
    source: makeSource(),
  });

  test("is the checked tier and says so out loud", () => {
    expect(receipt.tier).toBe("checked");
    expect(receipt.verdict).toBe("Safe to say out loud.");
  });

  test("cites the fact id, not the source id", () => {
    expect(receipt.id).toBe("6a70f2dac615029be026bab7");
    expect(receipt.kind).toBe("fact");
  });

  test("names where it came from and who captured it", () => {
    expect(detail(receipt, "Where it came from")).toBe("Voice memo, 13 March");
    expect(detail(receipt, "Who captured it")).toBe("Eric Brandt");
  });

  test("names who checked it and when", () => {
    expect(detail(receipt, "Who checked it")).toBe("Marie Lang, 14 March");
  });

  test("counts how long it has stood", () => {
    expect(detail(receipt, "Still good?")).toBe(
      "In place 5 months — nothing has contradicted it."
    );
  });

  test("quotes the source verbatim, in its own language", () => {
    expect(receipt.quote).toContain("bitte nichts vor zehn");
  });
});

describe("composeReceipt — a contested fact", () => {
  const receipt = composeReceipt({
    contested: true,
    fact: makeFact(),
    nameOf,
    now: NOW,
    source: makeSource(),
  });

  test("warns instead of clearing it", () => {
    expect(receipt.tier).toBe("checked-contested");
    expect(receipt.verdict).toBe(
      "Two versions on record. Settle it in Review before you quote it."
    );
    expect(detail(receipt, "Still good?")).toBe(
      "Disagrees with another fact on record — a review is open."
    );
  });
});

describe("composeReceipt — raw material", () => {
  test("an unreviewed source says nobody has checked it", () => {
    const receipt = composeReceipt({
      contested: false,
      nameOf,
      now: NOW,
      source: makeSource({ status: "proposed" }),
    });
    expect(receipt.kind).toBe("source");
    expect(receipt.tier).toBe("raw");
    expect(receipt.verdict).toBe("Worth knowing. Don't quote it to them yet.");
    expect(detail(receipt, "Who checked it")).toBe(
      "Nobody yet — it's in the review queue."
    );
  });

  test("a reviewed source is still raw wording, not a fact", () => {
    const receipt = composeReceipt({
      contested: false,
      nameOf,
      now: NOW,
      source: makeSource({ status: "reviewed" }),
    });
    expect(receipt.tier).toBe("raw-reviewed");
    expect(receipt.verdict).toBe(
      "Reviewed — but this is the raw wording, not a confirmed fact."
    );
  });

  test("an email names its subject", () => {
    const receipt = composeReceipt({
      contested: false,
      nameOf,
      now: NOW,
      source: makeSource({
        email: { subject: "Angebot Nordwind" },
        occurredAt: new Date("2026-07-01T09:00:00Z"),
        type: "email",
      }),
    });
    expect(detail(receipt, "Where it came from")).toBe(
      'Forwarded email — "Angebot Nordwind", 1 July'
    );
  });
});

describe("composeReceipt — degraded provenance", () => {
  test("an unresolvable reviewer is a teammate, never a raw id", () => {
    const receipt = composeReceipt({
      contested: false,
      fact: makeFact({ confirmedBy: "eval-fixture" }),
      nameOf,
      now: NOW,
      source: makeSource(),
    });
    const checked = detail(receipt, "Who checked it") ?? "";
    expect(checked).toContain("a teammate");
    expect(checked).not.toContain("eval-fixture");
  });

  test("a consolidated fact with no source says so and omits the capturer", () => {
    const receipt = composeReceipt({
      contested: false,
      fact: makeFact({ sourceId: undefined }),
      nameOf,
      now: NOW,
    });
    expect(detail(receipt, "Where it came from")).toBe(
      "Merged from earlier facts"
    );
    expect(detail(receipt, "Who captured it")).toBeUndefined();
    expect(receipt.quote).toBeNull();
  });

  test("a fact recorded this month reports a date, not a month count", () => {
    const receipt = composeReceipt({
      contested: false,
      fact: makeFact({ validFrom: new Date("2026-08-02T00:00:00Z") }),
      nameOf,
      now: NOW,
      source: makeSource(),
    });
    expect(detail(receipt, "Still good?")).toBe(
      "Recorded 2 August — nothing has contradicted it yet."
    );
  });

  test("a year-old fact carries its year", () => {
    const receipt = composeReceipt({
      contested: false,
      fact: makeFact(),
      nameOf,
      now: NOW,
      source: makeSource({ occurredAt: new Date("2024-11-05T00:00:00Z") }),
    });
    expect(detail(receipt, "Where it came from")).toBe(
      "Voice memo, 5 November 2024"
    );
  });

  test("a long excerpt is truncated with an ellipsis", () => {
    const receipt = composeReceipt({
      contested: false,
      nameOf,
      now: NOW,
      source: makeSource({ excerpt: "x".repeat(400) }),
    });
    expect(receipt.quote).toHaveLength(281);
    expect(receipt.quote?.endsWith("…")).toBe(true);
  });
});

describe("composeReceipt — timezone determinism", () => {
  test("formatDay is UTC-consistent even in negative-offset timezones", () => {
    // A timestamp at midnight UTC: 2026-03-13T00:00:00Z
    // Without timeZone: "UTC", toLocaleDateString renders it in the host's
    // local time: "12 March" in America/Los_Angeles (UTC-8), but "13 March"
    // in UTC and positive-offset zones. Force America/Los_Angeles to prove
    // the fix works. This test fails if someone removes timeZone: "UTC".
    const oldTz = process.env.TZ;
    try {
      process.env.TZ = "America/Los_Angeles";
      const receipt = composeReceipt({
        contested: false,
        nameOf,
        now: NOW,
        source: makeSource({
          occurredAt: new Date("2026-03-13T00:00:00Z"),
          type: "voice",
        }),
      });
      expect(detail(receipt, "Where it came from")).toBe(
        "Voice memo, 13 March"
      );
    } finally {
      process.env.TZ = oldTz;
    }
  });
});

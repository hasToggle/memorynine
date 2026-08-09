import { describe, expect, test } from "bun:test";
import { ObjectId } from "mongodb";
import { BRIEF_FACT_LIMIT, BRIEF_SOURCE_LIMIT, buildBrief } from "../brief";
import type { ReceiptSource } from "../receipt";
import type { Fact } from "../schemas/facts";

const TENANT = "test-tenant";
const NOW = new Date("2026-08-09T10:00:00Z");
const ANCHOR = {
  id: "anchor-1",
  kind: "organization" as const,
  name: "Nordwind Energie",
};

const makeFact = (text: string, validFrom: Date, id = new ObjectId()): Fact =>
  ({
    _id: id,
    anchors: { organizationId: new ObjectId() },
    category: "logistics",
    confidence: 0.9,
    confirmedBy: "user_marie",
    createdAt: validFrom,
    sourceId: new ObjectId(),
    tenantId: TENANT,
    text,
    updatedAt: validFrom,
    validFrom,
  }) as Fact;

const makeSource = (
  excerpt: string,
  status: ReceiptSource["status"]
): ReceiptSource => ({
  _id: new ObjectId(),
  capturedBy: "eric@example.com",
  createdAt: NOW,
  excerpt,
  status,
  type: "voice",
});

describe("buildBrief", () => {
  test("keeps fact text verbatim — no rewriting, no translation", () => {
    const text = "Nordwind braucht die überarbeitete Fassung bis Ende August.";
    const brief = buildBrief({
      anchor: ANCHOR,
      contestedIds: new Set(),
      facts: [makeFact(text, new Date("2026-07-01"))],
      now: NOW,
      sources: [],
    });
    expect(brief.lines[0]?.text).toBe(text);
  });

  test("floats contested facts to the top, whatever their date", () => {
    const oldContested = new ObjectId();
    const brief = buildBrief({
      anchor: ANCHOR,
      contestedIds: new Set([oldContested.toHexString()]),
      facts: [
        makeFact("Neu.", new Date("2026-08-01")),
        makeFact("Alt, aber umstritten.", new Date("2025-01-01"), oldContested),
      ],
      now: NOW,
      sources: [],
    });
    expect(brief.lines[0]?.text).toBe("Alt, aber umstritten.");
    expect(brief.lines[0]?.contested).toBe(true);
    expect(brief.contestedCount).toBe(1);
  });

  test("orders the rest newest first", () => {
    const brief = buildBrief({
      anchor: ANCHOR,
      contestedIds: new Set(),
      facts: [
        makeFact("Älter.", new Date("2026-01-01")),
        makeFact("Neuer.", new Date("2026-06-01")),
      ],
      now: NOW,
      sources: [],
    });
    expect(brief.lines.map((line) => line.text)).toEqual(["Neuer.", "Älter."]);
  });

  test("caps facts and reports the true total", () => {
    const facts = Array.from({ length: 12 }, (_, i) =>
      makeFact(`Faktum ${i}.`, new Date(2026, 0, i + 1))
    );
    const brief = buildBrief({
      anchor: ANCHOR,
      contestedIds: new Set(),
      facts,
      now: NOW,
      sources: [],
    });
    expect(brief.lines).toHaveLength(BRIEF_FACT_LIMIT);
    expect(brief.totalFacts).toBe(12);
  });

  test("appends unreviewed sources as the tail, capped", () => {
    const brief = buildBrief({
      anchor: ANCHOR,
      contestedIds: new Set(),
      facts: [makeFact("Bestätigt.", new Date("2026-08-01"))],
      now: NOW,
      sources: [
        makeSource("Ungeprüft eins.", "proposed"),
        makeSource("Ungeprüft zwei.", "extracting"),
        makeSource("Ungeprüft drei.", "received"),
      ],
    });
    const kinds = brief.lines.map((line) => line.kind);
    expect(kinds).toEqual(["fact", "source", "source"]);
    expect(brief.lines.filter((line) => line.kind === "source")).toHaveLength(
      BRIEF_SOURCE_LIMIT
    );
  });

  test("never offers a reviewed source as raw material", () => {
    const brief = buildBrief({
      anchor: ANCHOR,
      contestedIds: new Set(),
      facts: [],
      now: NOW,
      sources: [makeSource("Schon geprüft.", "reviewed")],
    });
    expect(brief.lines).toHaveLength(0);
  });

  test("an anchor with nothing to say produces an empty brief, not a crash", () => {
    const brief = buildBrief({
      anchor: ANCHOR,
      contestedIds: new Set(),
      facts: [],
      now: NOW,
      sources: [],
    });
    expect(brief.lines).toEqual([]);
    expect(brief.totalFacts).toBe(0);
    expect(brief.contestedCount).toBe(0);
  });

  test("every line carries the id its receipt will be fetched by", () => {
    const factId = new ObjectId();
    const brief = buildBrief({
      anchor: ANCHOR,
      contestedIds: new Set(),
      facts: [makeFact("Mit Beleg.", new Date("2026-08-01"), factId)],
      now: NOW,
      sources: [],
    });
    expect(brief.lines[0]?.citationId).toBe(factId.toHexString());
    expect(brief.lines[0]?.kind).toBe("fact");
  });
});

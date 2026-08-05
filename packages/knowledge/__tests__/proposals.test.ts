import { describe, expect, test } from "bun:test";
import { ObjectId } from "mongodb";
import { proposalSchema } from "../schemas/proposals";

const base = {
  _id: new ObjectId(),
  createdAt: new Date(),
  tenantId: "test-tenant",
  updatedAt: new Date(),
};

describe("proposalSchema", () => {
  test("accepts an ingestion proposal with entity + fact drafts", () => {
    const result = proposalSchema.safeParse({
      ...base,
      entityDrafts: [
        {
          data: { name: "Müller GmbH", status: "lead" },
          draftId: "org-1",
          entityType: "organization",
        },
      ],
      factDrafts: [
        {
          anchors: { organizationDraftId: "org-1" },
          category: "decision-process",
          confidence: 0.8,
          text: "Entscheidung über Workshops trifft die Geschäftsführung.",
        },
      ],
      kind: "ingestion",
      sourceId: new ObjectId(),
      status: "open",
    });
    expect(result.success).toBe(true);
  });

  test("defaults draft resolutions to pending", () => {
    const parsed = proposalSchema.parse({
      ...base,
      entityDrafts: [],
      factDrafts: [
        {
          anchors: { organizationId: new ObjectId() },
          category: "other",
          confidence: 0.5,
          text: "X",
        },
      ],
      kind: "consolidation",
      status: "open",
    });
    expect(parsed.factDrafts[0]?.resolution.status).toBe("pending");
  });

  test("rejects a fact draft with no anchor at all", () => {
    const result = proposalSchema.safeParse({
      ...base,
      entityDrafts: [],
      factDrafts: [
        { anchors: {}, category: "other", confidence: 0.5, text: "X" },
      ],
      kind: "ingestion",
      status: "open",
    });
    expect(result.success).toBe(false);
  });

  test("accepts a resolved proposal with audit fields", () => {
    const result = proposalSchema.safeParse({
      ...base,
      entityDrafts: [],
      factDrafts: [],
      kind: "ingestion",
      resolvedAt: new Date(),
      resolvedBy: "user_ceo1",
      sourceId: new ObjectId(),
      status: "resolved",
    });
    expect(result.success).toBe(true);
  });
});

describe("proposalSchema — lossless extraction fields", () => {
  const lxBase = {
    _id: new ObjectId(),
    createdAt: new Date(),
    entityDrafts: [],
    factDrafts: [],
    kind: "ingestion" as const,
    status: "open" as const,
    tenantId: "t1",
    updatedAt: new Date(),
  };

  test("accepts a skip proposal: a reason, no drafts", () => {
    const parsed = proposalSchema.parse({
      ...lxBase,
      skipReason: "Terminchatter",
    });
    expect(parsed.skipReason).toBe("Terminchatter");
  });

  test("skipReason is absent — not false, not null — on an ordinary proposal", () => {
    // listOpenProposals filters on { $exists: false }, so an explicitly
    // present undefined would silently hide every ordinary proposal.
    expect(proposalSchema.parse(lxBase)).not.toHaveProperty("skipReason");
  });

  test("accepts superseded, which resolved must not be overloaded to mean", () => {
    expect(() =>
      proposalSchema.parse({ ...lxBase, status: "superseded" })
    ).not.toThrow();
  });

  test("rejects an unknown status", () => {
    expect(() =>
      proposalSchema.parse({ ...lxBase, status: "archived" })
    ).toThrow();
  });

  test("carries rejected drafts with a readable reason", () => {
    const parsed = proposalSchema.parse({
      ...lxBase,
      rejectedDrafts: [
        { raw: { text: "x" }, reason: "anchors.personId: expected string" },
      ],
    });
    expect(parsed.rejectedDrafts?.[0]?.reason).toContain("personId");
  });

  test("extractionGeneration is a positive integer when present", () => {
    expect(() =>
      proposalSchema.parse({ ...lxBase, extractionGeneration: 2 })
    ).not.toThrow();
    expect(() =>
      proposalSchema.parse({ ...lxBase, extractionGeneration: 0 })
    ).toThrow();
  });
});

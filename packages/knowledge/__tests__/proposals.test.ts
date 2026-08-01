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

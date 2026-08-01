import { describe, expect, test } from "bun:test";
import { ObjectId } from "mongodb";
import { factSchema } from "../schemas/facts";
import { sourceSchema } from "../schemas/sources";

const base = {
  _id: new ObjectId(),
  createdAt: new Date(),
  tenantId: "test-tenant",
  updatedAt: new Date(),
};

describe("sourceSchema", () => {
  test("accepts a voice source with audio and content", () => {
    const result = sourceSchema.safeParse({
      ...base,
      audio: {
        blobUrl: "https://blob.example/a.m4a",
        contentType: "audio/mp4",
      },
      capturedBy: "user_ceo1",
      content: "Gespräch mit Frau Schmidt über das Q3-Format …",
      status: "transcribed",
      type: "voice",
    });
    expect(result.success).toBe(true);
  });

  test("accepts an email source with email metadata", () => {
    const result = sourceSchema.safeParse({
      ...base,
      capturedBy: "user_ceo2",
      content: "Sehr geehrte Damen und Herren …",
      email: {
        forwardedBy: "ceo1@seminarco.de",
        gmailMessageId: "18c9a7b2f3d4e5f6",
        originalSender: "anna@mueller.de",
        sentAt: new Date("2026-07-01"),
        subject: "Workshop-Anfrage",
      },
      status: "received",
      type: "email",
    });
    expect(result.success).toBe(true);
  });

  test("accepts an email source with attachments", () => {
    const result = sourceSchema.safeParse({
      ...base,
      attachments: [
        {
          blobUrl: "https://blob.example/angebot.pdf",
          contentType: "application/pdf",
          filename: "Angebot_Q3.pdf",
        },
      ],
      capturedBy: "user_ceo2",
      content: "Anbei das Angebot.",
      email: {
        forwardedBy: "ceo1@seminarco.de",
        gmailMessageId: "18c9a7b2f3d4e5f7",
        originalSender: "anna@mueller.de",
        sentAt: new Date("2026-07-02"),
        subject: "Angebot",
      },
      status: "received",
      type: "email",
    });
    expect(result.success).toBe(true);
    expect(result.data?.attachments?.[0]?.filename).toBe("Angebot_Q3.pdf");
  });

  test("rejects unknown status", () => {
    const result = sourceSchema.safeParse({
      ...base,
      capturedBy: "user_ceo1",
      status: "done",
      type: "voice",
    });
    expect(result.success).toBe(false);
  });
});

describe("factSchema", () => {
  const validFact = {
    ...base,
    anchors: { organizationId: new ObjectId() },
    category: "preference",
    confidence: 0.9,
    confirmedBy: "user_ceo1",
    sourceId: new ObjectId(),
    text: "Bevorzugt Präsenz-Workshops gegenüber Remote-Formaten.",
  };

  test("accepts a valid anchored fact", () => {
    expect(factSchema.safeParse(validFact).success).toBe(true);
  });

  test("rejects a fact with zero anchors", () => {
    const result = factSchema.safeParse({ ...validFact, anchors: {} });
    expect(result.success).toBe(false);
  });

  test("rejects out-of-range confidence and unknown category", () => {
    expect(
      factSchema.safeParse({ ...validFact, confidence: 1.5 }).success
    ).toBe(false);
    expect(
      factSchema.safeParse({ ...validFact, category: "gossip" }).success
    ).toBe(false);
  });

  test("accepts lifecycle fields (supersededBy, validUntil, embedding)", () => {
    const result = factSchema.safeParse({
      ...validFact,
      embedding: [0.1, 0.2, 0.3],
      supersededBy: new ObjectId(),
      validUntil: new Date(),
    });
    expect(result.success).toBe(true);
  });
});

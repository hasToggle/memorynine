import type { Db, ObjectId } from "mongodb";
import { z } from "zod";
import { getCollections } from "./collections";
import { deterministicId, insertIgnoringDuplicate } from "./idempotency";

// Inbound email capture. The webhook layer verifies signatures and applies
// the sender allowlist; this module owns the two provider-agnostic pieces:
// the sender → tenant mapping and the idempotent source insert.

const senderMapSchema = z.record(z.string().min(1), z.string().min(1));

/**
 * Parse the KNOWLEDGE_INBOUND_SENDERS env value: a JSON object mapping
 * sender email addresses to tenant ids. Keys are lowercased for lookup.
 * Invalid JSON throws — a silently-empty allowlist would drop every email.
 */
export const parseInboundSenderMap = (
  raw: string | undefined
): Map<string, string> => {
  if (!raw || raw.trim().length === 0) {
    return new Map();
  }
  const parsed = senderMapSchema.parse(JSON.parse(raw));
  return new Map(
    Object.entries(parsed).map(([email, tenantId]) => [
      email.toLowerCase(),
      tenantId,
    ])
  );
};

export interface InboundEmail {
  content: string;
  forwardedBy: string;
  messageId: string;
  originalSender: string;
  sentAt: Date;
  subject: string;
}

export interface CreateEmailSourceResult {
  sourceId: ObjectId;
  status: "created" | "duplicate";
}

/**
 * Idempotent insert of an inbound email as a "received" source — the
 * extraction sweep picks it up from there. The deterministic _id (and the
 * unique tenant_message index behind it) make webhook retries no-ops.
 */
export const createEmailSource = async (
  db: Db,
  tenantId: string,
  email: InboundEmail
): Promise<CreateEmailSourceResult> => {
  const content = email.content.trim();
  if (content.length === 0) {
    throw new Error("Inbound email has no text content to extract from");
  }
  const { sources } = getCollections(db);
  const sourceId = deterministicId(`${tenantId}:email:${email.messageId}`);
  const existing = await sources.findOne({ _id: sourceId, tenantId });
  if (existing) {
    return { sourceId, status: "duplicate" };
  }
  const writtenAt = new Date();
  await insertIgnoringDuplicate(sources, {
    _id: sourceId,
    capturedBy: email.forwardedBy,
    content,
    createdAt: writtenAt,
    email: {
      forwardedBy: email.forwardedBy,
      messageId: email.messageId,
      originalSender: email.originalSender,
      sentAt: email.sentAt,
      subject: email.subject,
    },
    status: "received",
    tenantId,
    type: "email",
    updatedAt: writtenAt,
  });
  return { sourceId, status: "created" };
};

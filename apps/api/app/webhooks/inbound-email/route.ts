import { resend } from "@repo/email";
import { createEmailSource, parseInboundSenderMap } from "@repo/knowledge";
import { getKnowledgeDb } from "@repo/knowledge/client";
import { log } from "@repo/observability/log";
import { NextResponse } from "next/server";

// Resend inbound email → knowledge source. Security model (strict
// allowlist): the svix signature proves the event came from Resend, and
// only senders explicitly mapped to a tenant in KNOWLEDGE_INBOUND_SENDERS
// are processed — everyone else is logged and dropped. Rejections still
// return 200 so Resend does not retry them forever.

export const POST = async (request: Request): Promise<NextResponse> => {
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "RESEND_INBOUND_WEBHOOK_SECRET is not configured" },
      { status: 503 }
    );
  }

  // Raw body: signature verification breaks on re-serialized JSON.
  const payload = await request.text();
  let event: { data: { email_id: string; from: string }; type: string };
  try {
    event = resend.webhooks.verify({
      headers: {
        id: request.headers.get("svix-id") ?? "",
        signature: request.headers.get("svix-signature") ?? "",
        timestamp: request.headers.get("svix-timestamp") ?? "",
      },
      payload,
      webhookSecret: secret,
    }) as unknown as { data: { email_id: string; from: string }; type: string };
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type !== "email.received") {
    return NextResponse.json({ ignored: event.type });
  }

  const senderMap = parseInboundSenderMap(
    process.env.KNOWLEDGE_INBOUND_SENDERS
  );
  const sender = event.data.from.toLowerCase();
  const tenantId = senderMap.get(sender);
  if (!tenantId) {
    log.warn(`inbound-email: rejected unmapped sender ${sender}`);
    return NextResponse.json({ rejected: "sender not allowlisted" });
  }

  // The webhook event carries metadata only — fetch the actual content.
  const { data: email, error } = await resend.emails.receiving.get(
    event.data.email_id
  );
  if (error || !email) {
    log.error(`inbound-email: fetch failed for ${event.data.email_id}`);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }

  const content = email.text?.trim() ?? "";
  if (content.length === 0) {
    log.warn(`inbound-email: ${event.data.email_id} has no text content`);
    return NextResponse.json({ rejected: "no text content" });
  }

  const result = await createEmailSource(getKnowledgeDb(), tenantId, {
    content,
    forwardedBy: sender,
    messageId: event.data.email_id,
    originalSender: sender,
    sentAt: new Date(),
    subject: email.subject ?? "",
  });

  return NextResponse.json({
    sourceId: result.sourceId.toHexString(),
    status: result.status,
  });
};

import { isReservedDomain } from "./join-policy";
import { keys } from "./keys";

// Guarded like instance.ts: imported by the auth instance, must never reach
// a browser bundle but has to load in any server runtime.
if (typeof window !== "undefined") {
  throw new Error(
    "@repo/auth/emails is server-side only and must not reach a browser bundle"
  );
}

export const appOrigin = (): string =>
  keys().BETTER_AUTH_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000";

const FROM = process.env.RESEND_FROM ?? "";

/**
 * Auth mail must never fail the auth flow it accompanies — a broken mail
 * provider should degrade to "no email arrived", not "nobody can sign up".
 * Reserved (RFC 2606) recipient domains are undeliverable by definition and
 * are skipped outright, which keeps tests and local dev from bouncing mail.
 */
const send = async (options: {
  html: string;
  subject: string;
  text: string;
  to: string;
}): Promise<void> => {
  const domain = options.to.slice(options.to.lastIndexOf("@") + 1);
  if (isReservedDomain(domain)) {
    console.warn(`auth email skipped (reserved domain): ${options.to}`);
    return;
  }
  try {
    // Lazy: @repo/email validates its env at module scope, and a broken (or
    // absent, in tests) mail config must not take the auth instance down
    // with it — it should surface here, as a logged send failure.
    const { resend } = await import("@repo/email");
    const { error } = await resend.emails.send({ ...options, from: FROM });
    if (error) {
      console.error(`auth email to ${options.to} failed: ${error.message}`);
    }
  } catch (error) {
    console.error(
      `auth email to ${options.to} failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

export const sendVerificationEmailMessage = ({
  to,
  url,
}: {
  to: string;
  url: string;
}): Promise<void> =>
  send({
    html: `<p>Confirm your email address to finish setting up your account.</p><p><a href="${escapeHtml(url)}">Verify email address</a></p><p>If you didn't create this account, you can ignore this email.</p>`,
    subject: "Verify your email address",
    text: `Confirm your email address to finish setting up your account: ${url}\n\nIf you didn't create this account, you can ignore this email.`,
    to,
  });

export const sendInvitationEmailMessage = ({
  inviterEmail,
  inviterName,
  organizationName,
  to,
  url,
}: {
  inviterEmail: string;
  inviterName: string;
  organizationName: string;
  to: string;
  url: string;
}): Promise<void> =>
  send({
    html: `<p>${escapeHtml(inviterName)} (${escapeHtml(inviterEmail)}) invited you to join <strong>${escapeHtml(organizationName)}</strong>.</p><p><a href="${escapeHtml(url)}">Accept the invitation</a></p><p>Sign in — or create an account with this email address — and the invitation will be waiting for you.</p>`,
    subject: `${inviterName} invited you to ${organizationName}`,
    text: `${inviterName} (${inviterEmail}) invited you to join ${organizationName}.\n\nAccept the invitation: ${url}\n\nSign in — or create an account with this email address — and the invitation will be waiting for you.`,
    to,
  });

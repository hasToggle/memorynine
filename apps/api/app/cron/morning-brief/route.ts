import { appOrigin } from "@repo/auth/emails";
import { runMorningBriefSweep, type SendMorningBrief } from "@repo/knowledge";
import { getKnowledgeDb } from "@repo/knowledge/client";
import { requireCronSecret } from "../auth";

// The initiative loop's first delivery surface (spec §5): one deterministic
// email per enabled tenant per weekday. Mail volume scales with tenants, not
// data, so the consolidation cron's duration budget is more than enough.
export const maxDuration = 300;

export const GET = async (request: Request) => {
  const unauthorized = requireCronSecret(request);
  if (unauthorized) {
    return unauthorized;
  }

  // Same fail-closed posture as CRON_SECRET: an unconfigured sender must
  // close the route, not send from "".
  const from = process.env.RESEND_FROM;
  if (!from) {
    return new Response("RESEND_FROM is not configured", { status: 503 });
  }

  const send: SendMorningBrief = async (email) => {
    // Lazy: @repo/email validates its env at module scope, and this route
    // must stay importable (tests, builds) without mail credentials.
    const { resend } = await import("@repo/email");
    const { error } = await resend.emails.send({ from, ...email });
    if (error) {
      throw new Error(error.message);
    }
  };

  const report = await runMorningBriefSweep(getKnowledgeDb(), {
    appOrigin: appOrigin(),
    now: new Date(),
    send,
  });

  return Response.json(report, {
    status: report.failures.length > 0 ? 207 : 200,
  });
};

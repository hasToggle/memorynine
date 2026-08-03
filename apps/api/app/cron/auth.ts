// Vercel Cron sends `authorization: Bearer ${CRON_SECRET}`. These routes spend
// real money — transcription, gateway inference — across every tenant, so a
// missing secret must close the route rather than open it. The previous
// `if (secret && ...)` form meant an unset variable left them anonymously
// reachable, which is the opposite of what an unconfigured deployment wants.
export const requireCronSecret = (request: Request): Response | null => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return new Response("CRON_SECRET is not configured", { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
};

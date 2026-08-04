// Answers one question: can this model be reached under Zero Data Retention
// through the Vercel AI Gateway?
//   AI_GATEWAY_API_KEY=... bun scripts/probe-zdr.ts
//
// ZDR is enforced per-request via providerOptions.gateway.zeroDataRetention
// and hard-fails rather than routing elsewhere: an uncovered model returns
// HTTP 400 with { error, type: "no_providers_available" } naming what it
// tried. One cheap request per model answers the question definitively — no
// extended audit needed, and max_tokens: 8 keeps each request negligible.
//
// If a model here comes back NOT ZDR-COVERED, the fix is to change *that
// model* — the eval judge in evals.config.ts, or the extraction worker's
// model (gateway.ts's DEFAULT_MODEL / the EXTRACTION_MODEL env var) — never
// to weaken this setting. The eval corpus is entirely synthetic, so ZDR
// protects nothing during a run; weakening a production data-protection
// setting to make a test pass would be backwards. The only requirement on a
// judge is that it is a different model family from the agent under test
// and at least as capable.

const GATEWAY_CHAT_COMPLETIONS_URL =
  "https://ai-gateway.vercel.sh/v1/chat/completions";

// Kept as literals (not imported) so this probe has no import-time
// dependency on evals.config.ts or gateway.ts: it must run standalone with
// nothing but an API key. Keep in sync by hand:
//   - the eval judge, apps/app/evals/evals.config.ts
//   - the extraction worker's default model, packages/knowledge/gateway.ts
const MODELS = ["anthropic/claude-sonnet-5", "deepseek/deepseek-v4-flash-0731"];

export type ZdrVerdict =
  | "auth-error"
  | "covered"
  | "not-covered"
  | "other-error"
  | "unknown-model";

export interface ZdrClassification {
  readonly detail: string;
  readonly verdict: ZdrVerdict;
}

const NO_PROVIDERS_TYPE = "no_providers_available";
const MODEL_NOT_FOUND_TYPE = "model_not_found";
const NO_ZDR_MESSAGE_PATTERN = /no zdr/i;
const MODEL_NOT_FOUND_MESSAGE_PATTERN = /model not found|unknown model/i;

/**
 * Maps one gateway response to a verdict. Pure and independent of fetch, so
 * it is the one part of this script worth unit testing directly: a 401 from
 * a bad key must never be mistaken for "not ZDR-covered", and an unparsable
 * body must never crash the probe.
 */
export const classifyZdrResponse = (
  status: number,
  body: string
): ZdrClassification => {
  if (status >= 200 && status < 300) {
    return { detail: `HTTP ${status}`, verdict: "covered" };
  }

  let parsed: { error?: unknown; type?: unknown } | undefined;
  try {
    parsed = JSON.parse(body) as { error?: unknown; type?: unknown };
  } catch {
    parsed = undefined;
  }
  const type = typeof parsed?.type === "string" ? parsed.type : undefined;
  const message =
    typeof parsed?.error === "string" ? parsed.error : body.slice(0, 300);

  if (type === NO_PROVIDERS_TYPE || NO_ZDR_MESSAGE_PATTERN.test(message)) {
    return { detail: message, verdict: "not-covered" };
  }
  if (status === 401 || status === 403) {
    return { detail: message, verdict: "auth-error" };
  }
  if (
    status === 404 ||
    type === MODEL_NOT_FOUND_TYPE ||
    MODEL_NOT_FOUND_MESSAGE_PATTERN.test(message)
  ) {
    return { detail: message, verdict: "unknown-model" };
  }
  return { detail: `HTTP ${status}: ${message}`, verdict: "other-error" };
};

const VERDICT_LABELS: Record<ZdrVerdict, string> = {
  "auth-error": "AUTH ERROR — bad AI_GATEWAY_API_KEY, not a ZDR signal",
  covered: "ZDR COVERED",
  "not-covered": "NOT ZDR-COVERED",
  "other-error": "OTHER ERROR — inconclusive, investigate",
  "unknown-model": "UNKNOWN MODEL — inconclusive, check the model id",
};

interface ProbeResult {
  readonly detail: string;
  readonly label: string;
  readonly model: string;
}

const probeOne = async (
  apiKey: string,
  model: string
): Promise<ProbeResult> => {
  let response: Response;
  try {
    response = await fetch(GATEWAY_CHAT_COMPLETIONS_URL, {
      body: JSON.stringify({
        max_tokens: 8,
        messages: [{ content: "Reply with the single word: ok", role: "user" }],
        model,
        providerOptions: { gateway: { zeroDataRetention: true } },
      }),
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
  } catch (error) {
    return {
      detail: error instanceof Error ? error.message : String(error),
      label: "NETWORK ERROR — inconclusive, could not reach the gateway",
      model,
    };
  }
  const body = await response.text();
  const { detail, verdict } = classifyZdrResponse(response.status, body);
  return { detail, label: VERDICT_LABELS[verdict], model };
};

const run = async () => {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) {
    console.error("AI_GATEWAY_API_KEY is required");
    process.exit(1);
  }

  for (const model of MODELS) {
    // biome-ignore lint/performance/noAwaitInLoops: sequential one-time probe; output order should follow MODELS
    const result = await probeOne(apiKey, model);
    console.log(`${result.model}\n  ${result.label}\n  ${result.detail}\n`);
  }
};

// Guarded so importing `classifyZdrResponse` for tests never triggers a live
// call — only executing this file directly does. See seed-evals.ts for why
// `require.main === module` is the right guard in this package (CommonJS
// output, no `import.meta`).
if (require.main === module) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

// Thin Vercel AI Gateway client for the extraction worker. Raw fetch, no SDK:
// the worker needs exactly one prompt-in/text-out call, and runExtraction
// treats any throw here as a retryable failure against the source's budget.

export interface GatewayConfig {
  apiKey?: string;
  baseUrl?: string;
  /** Injectable for tests; only ever called as (url, init). */
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>;
  /**
   * Generation budget. The default is deliberately large: live DeepSeek
   * runs sometimes streamed 4k+ tokens of reasoning into the content
   * channel before the JSON — at 4096 the answer was truncated away and
   * cost a retry; at 16384 five out of five runs produced clean proposals.
   * Unused budget is not billed.
   */
  maxOutputTokens?: number;
  model?: string;
  /**
   * Telemetry hook, called once per successful response that carries a
   * `usage` field. Never allowed to fail the call it's reporting on — a
   * throw here is swallowed.
   */
  onUsage?: (usage: GatewayUsage, context?: UsageContext) => void;
  /**
   * Keeps reasoning contained: without it, live DeepSeek runs sometimes
   * burned the whole token budget narrating and leaked thinking into the
   * content channel instead of emitting JSON. "low" is enough for
   * extraction. Set null to omit the parameter for models that reject it.
   */
  reasoningEffort?: string | null;
}

/** What one model call cost, as the gateway reports it. */
export interface GatewayUsage {
  cachedTokens: number;
  completionTokens: number;
  /** Total billed: inference + surcharges. THIS is the number to report. */
  gatewayCost: number;
  /** Reconciliation key against Vercel's dashboard. */
  generationId?: string;
  /** Inference at market rate, before surcharges. */
  inferenceCost: number;
  model: string;
  promptTokens: number;
  reasoningTokens: number;
  /** Surcharges, dominated by ZDR at a flat $0.0001 per request. */
  surchargeCost: number;
}

/**
 * Who a call was for. Passed PER CALL, not per client: one `generate` is
 * constructed at the cron layer and shared across every tenant in a sweep,
 * so a client-scoped tenant id would mis-attribute every row.
 */
export interface UsageContext {
  /** A sourceId, an anchor id, an eval run id — whatever groups the spend. */
  correlationId?: string;
  /**
   * True when cost was computed from a rate constant rather than reported by
   * the vendor (currently: rerank, which the gateway never sees). Set by the
   * caller that did the computing, not invented downstream — an estimate
   * must never be mistaken for an exact figure.
   */
  estimated?: boolean;
  operation: string;
  tenantId: string;
}

const DEFAULT_MODEL = "deepseek/deepseek-v4-flash-0731";
const DEFAULT_BASE_URL = "https://ai-gateway.vercel.sh/v1";
const DEFAULT_MAX_OUTPUT_TOKENS = 16_384;
const DEFAULT_REASONING_EFFORT = "low";

const num = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

/**
 * Extracts cost and token accounting from a gateway chat-completion response.
 * Returns undefined when the response carries no `usage` — callers should
 * treat that as "nothing to report", not as an error.
 */
export const parseGatewayUsage = (body: unknown): GatewayUsage | undefined => {
  if (typeof body !== "object" || body === null) {
    return;
  }
  const root = body as {
    choices?: {
      message?: {
        provider_metadata?: { gateway?: { generationId?: string } };
      };
    }[];
    model?: string;
    usage?: Record<string, unknown>;
  };
  const { usage } = root;
  if (!usage) {
    return;
  }
  const promptDetails = usage.prompt_tokens_details as
    | { cached_tokens?: unknown }
    | undefined;
  const completionDetails = usage.completion_tokens_details as
    | { reasoning_tokens?: unknown }
    | undefined;
  const generationId =
    root.choices?.[0]?.message?.provider_metadata?.gateway?.generationId;

  return {
    cachedTokens: num(promptDetails?.cached_tokens),
    completionTokens: num(usage.completion_tokens),
    gatewayCost: num(usage.gateway_cost),
    ...(generationId === undefined ? {} : { generationId }),
    inferenceCost: num(usage.cost),
    model: typeof root.model === "string" ? root.model : "unknown",
    promptTokens: num(usage.prompt_tokens),
    reasoningTokens: num(completionDetails?.reasoning_tokens),
    surchargeCost: num(usage.surcharge_cost),
  };
};

export const createGatewayGenerate = (
  config: GatewayConfig = {}
): ((prompt: string, context?: UsageContext) => Promise<string>) => {
  const apiKey = config.apiKey ?? process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) {
    throw new Error(
      "AI_GATEWAY_API_KEY is required (pass config.apiKey or set the env var)"
    );
  }
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const doFetch = config.fetchImpl ?? fetch;
  const maxOutputTokens = config.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  const model = config.model ?? process.env.EXTRACTION_MODEL ?? DEFAULT_MODEL;
  const { onUsage } = config;
  const reasoningEffort =
    config.reasoningEffort === undefined
      ? DEFAULT_REASONING_EFFORT
      : config.reasoningEffort;

  return async (prompt: string, context?: UsageContext): Promise<string> => {
    const res = await doFetch(`${baseUrl}/chat/completions`, {
      body: JSON.stringify({
        max_tokens: maxOutputTokens,
        messages: [{ content: prompt, role: "user" }],
        model,
        ...(reasoningEffort === null
          ? {}
          : { reasoning_effort: reasoningEffort }),
      }),
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`gateway ${res.status}: ${body.slice(0, 500)}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      model?: string;
      usage?: Record<string, unknown>;
    };
    if (onUsage) {
      const usage = parseGatewayUsage(data);
      if (usage) {
        // Telemetry must never fail an extraction.
        try {
          onUsage(usage, context);
        } catch {
          // swallowed deliberately
        }
      }
    }
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("gateway returned no content");
    }
    return content;
  };
};

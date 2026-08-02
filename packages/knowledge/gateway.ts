// Thin Vercel AI Gateway client for the extraction worker. Raw fetch, no SDK:
// the worker needs exactly one prompt-in/text-out call, and runExtraction
// treats any throw here as a retryable failure against the source's budget.

export interface GatewayConfig {
  apiKey?: string;
  baseUrl?: string;
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
   * Keeps reasoning contained: without it, live DeepSeek runs sometimes
   * burned the whole token budget narrating and leaked thinking into the
   * content channel instead of emitting JSON. "low" is enough for
   * extraction. Set null to omit the parameter for models that reject it.
   */
  reasoningEffort?: string | null;
}

const DEFAULT_MODEL = "deepseek/deepseek-v4-flash-0731";
const DEFAULT_BASE_URL = "https://ai-gateway.vercel.sh/v1";
const DEFAULT_MAX_OUTPUT_TOKENS = 16_384;
const DEFAULT_REASONING_EFFORT = "low";

export const createGatewayGenerate = (
  config: GatewayConfig = {}
): ((prompt: string) => Promise<string>) => {
  const apiKey = config.apiKey ?? process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) {
    throw new Error(
      "AI_GATEWAY_API_KEY is required (pass config.apiKey or set the env var)"
    );
  }
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const maxOutputTokens = config.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  const model = config.model ?? process.env.EXTRACTION_MODEL ?? DEFAULT_MODEL;
  const reasoningEffort =
    config.reasoningEffort === undefined
      ? DEFAULT_REASONING_EFFORT
      : config.reasoningEffort;

  return async (prompt: string): Promise<string> => {
    const res = await fetch(`${baseUrl}/chat/completions`, {
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
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("gateway returned no content");
    }
    return content;
  };
};

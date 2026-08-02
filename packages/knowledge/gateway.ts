// Thin Vercel AI Gateway client for the extraction worker. Raw fetch, no SDK:
// the worker needs exactly one prompt-in/text-out call, and runExtraction
// treats any throw here as a retryable failure against the source's budget.

export interface GatewayConfig {
  apiKey?: string;
  baseUrl?: string;
  /**
   * Generation budget. The default is deliberately generous: reasoning
   * models (like the default DeepSeek flash) spend ~100+ tokens thinking
   * before emitting JSON, and a truncated reply costs a whole retry.
   */
  maxOutputTokens?: number;
  model?: string;
}

const DEFAULT_MODEL = "deepseek/deepseek-v4-flash-0731";
const DEFAULT_BASE_URL = "https://ai-gateway.vercel.sh/v1";
const DEFAULT_MAX_OUTPUT_TOKENS = 4096;

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

  return async (prompt: string): Promise<string> => {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      body: JSON.stringify({
        max_tokens: maxOutputTokens,
        messages: [{ content: prompt, role: "user" }],
        model,
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

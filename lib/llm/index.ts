/**
 * Provider-agnostic LLM adapter.
 * Auto-detects provider from key prefix: "sk-ant-" → Anthropic, else OpenAI.
 */

export type Provider = "openai" | "anthropic";

export function detectProvider(key: string): Provider {
  return key.startsWith("sk-ant-") ? "anthropic" : "openai";
}

export interface LLMRequest {
  system: string;
  prompt: string;
  /** Base64 data-URL of an image, e.g. "data:image/jpeg;base64,..." */
  image?: string;
  maxTokens?: number;
  /** Override the model id. Defaults to a sensible per-provider choice. */
  model?: string;
}

export async function complete(key: string, provider: Provider, req: LLMRequest): Promise<string> {
  if (provider === "anthropic") return completeAnthropic(key, req);
  return completeOpenAI(key, req);
}

async function completeOpenAI(apiKey: string, req: LLMRequest): Promise<string> {
  const OpenAI = (await import("openai")).default;
  // Bounded: a hung provider request must not pin the route for the platform's
  // full function timeout — fail in 30s so cache fallbacks can kick in.
  const client = new OpenAI({ apiKey, timeout: 30_000, maxRetries: 1 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userContent: any[] = [];

  if (req.image) {
    userContent.push({ type: "image_url", image_url: { url: req.image, detail: "high" } });
  }
  userContent.push({ type: "text", text: req.prompt });

  const response = await client.chat.completions.create({
    model: req.model ?? (req.image ? "gpt-4o" : "gpt-4o-mini"),
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: userContent },
    ],
    // GPT-5 family rejects `max_tokens`; `max_completion_tokens` is the current
    // param and is also accepted by the gpt-4o models used elsewhere.
    max_completion_tokens: req.maxTokens ?? 512,
  });

  return response.choices[0]?.message?.content ?? "";
}

async function completeAnthropic(apiKey: string, req: LLMRequest): Promise<string> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  // Bounded: see completeOpenAI — 30s timeout, single retry.
  const client = new Anthropic({ apiKey, timeout: 30_000, maxRetries: 1 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userContent: any[] = [];

  if (req.image) {
    // Parse "data:image/jpeg;base64,..." into media_type + data
    const match = req.image.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      userContent.push({
        type: "image",
        source: { type: "base64", media_type: match[1], data: match[2] },
      });
    }
  }
  userContent.push({ type: "text", text: req.prompt });

  const response = await client.messages.create({
    model: req.model ?? "claude-sonnet-4-6",
    system: req.system,
    messages: [{ role: "user", content: userContent }],
    max_tokens: req.maxTokens ?? 512,
  });

  // Return the first text block (robust to leading non-text blocks).
  for (const block of response.content) {
    if (block.type === "text") return block.text;
  }
  return "";
}

/**
 * Validate a key by making a minimal API call.
 * Returns true if the key is accepted by the provider.
 */
export async function validateKey(key: string, provider: Provider): Promise<boolean> {
  try {
    await complete(key, provider, {
      system: "Respond with only the word OK.",
      prompt: "OK",
      maxTokens: 5,
    });
    return true;
  } catch {
    return false;
  }
}

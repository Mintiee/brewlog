/**
 * Provider-agnostic LLM adapter.
 * Auto-detects provider from key prefix: "sk-ant-" → Anthropic, else OpenAI.
 */

import type { Provider } from "./detect";

export type { Provider } from "./detect";
export { detectProvider } from "./detect";

export interface LLMRequest {
  system: string;
  prompt: string;
  /** Base64 data-URL of an image, e.g. "data:image/jpeg;base64,..." */
  image?: string;
  maxTokens?: number;
  /** Override the model id. Defaults to a sensible per-provider choice. */
  model?: string;
  /** JSON Schema constraining the reply. When set, the provider's structured-
   *  output mode is used (Anthropic `output_config.format`, OpenAI
   *  `response_format: json_schema`). Prefer completeJSON(), which layers a
   *  tolerant text-parse fallback on top for provider/model combos that reject
   *  or ignore the schema. */
  schema?: Record<string, unknown>;
  /** Schema name (OpenAI requires one; a–z/0–9/_/- only). */
  schemaName?: string;
}

export async function complete(key: string, provider: Provider, req: LLMRequest): Promise<string> {
  if (provider === "anthropic") return completeAnthropic(key, req);
  return completeOpenAI(key, req);
}

/**
 * Tolerant JSON extraction from a raw model reply — the shared fallback used
 * when structured output is unavailable or the reply isn't already clean JSON.
 * Strips markdown fences, then tries the whole string, the first balanced
 * `{...}`, and the first `[...]`. Returns null when nothing parses.
 */
export function extractJson(raw: string): unknown | null {
  const s = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const candidates = [s];
  const obj = s.match(/\{[\s\S]*\}/);
  if (obj) candidates.push(obj[0]);
  const arr = s.match(/\[[\s\S]*\]/);
  if (arr) candidates.push(arr[0]);
  for (const c of candidates) {
    try { return JSON.parse(c); } catch { /* try next candidate */ }
  }
  return null;
}

/**
 * Structured JSON completion with a single shared fallback path.
 *
 * 1. Asks the provider for schema-constrained output (see LLMRequest.schema) and
 *    parses the reply.
 * 2. If the structured request throws (provider/model doesn't support it) or the
 *    reply doesn't parse, retries once WITHOUT the schema and extracts JSON
 *    tolerantly (extractJson).
 *
 * Returns the parsed value (object or array) or null. Callers keep their own
 * domain validation as a second line of defence — this only guarantees "some
 * parsed JSON or null", never a validated shape.
 */
export async function completeJSON(
  key: string,
  provider: Provider,
  req: LLMRequest & { schema: Record<string, unknown> },
): Promise<unknown | null> {
  try {
    const raw = await complete(key, provider, req);
    const parsed = extractJson(raw);
    if (parsed != null) return parsed;
    // Structured call returned unparseable text — fall through to a plain retry.
  } catch (err) {
    console.warn("[llm] structured output failed; falling back to plain parse:", err);
  }
  // Fallback: same request minus the schema, tolerant extraction.
  const plain: LLMRequest = { ...req };
  delete plain.schema;
  delete plain.schemaName;
  const raw = await complete(key, provider, plain);
  return extractJson(raw);
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
    ...(req.schema
      ? {
          response_format: {
            type: "json_schema" as const,
            json_schema: { name: req.schemaName ?? "result", schema: req.schema },
          },
        }
      : {}),
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
    model: req.model ?? "claude-sonnet-5",
    system: req.system,
    messages: [{ role: "user", content: userContent }],
    max_tokens: req.maxTokens ?? 512,
    ...(req.schema
      ? { output_config: { format: { type: "json_schema" as const, schema: req.schema } } }
      : {}),
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

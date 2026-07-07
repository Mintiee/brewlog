/**
 * Pure provider-detection logic, isolated from lib/llm/index.ts so it can be
 * imported by client components without pulling in server-only SDK deps
 * (the "openai" / "@anthropic-ai/sdk" packages dynamically imported there).
 */

export type Provider = "openai" | "anthropic";

export function detectProvider(key: string): Provider {
  const k = key.trim();
  return k.startsWith("sk-ant-") ? "anthropic" : "openai";
}

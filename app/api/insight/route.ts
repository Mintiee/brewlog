/**
 * POST /api/insight — generate a one-sentence Palate insight from recent brews.
 * Body: { brews: string[] } — array of formatted brew digest lines.
 * Returns: { text: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { getHouseholdKey } from "@/lib/llm/getKey";
import { complete } from "@/lib/llm";

const SYSTEM = `You analyse a coffee brew log and find the most specific, slightly surprising pattern.
Reply with ONE sentence, max 20 words, conversational, no preamble, no markdown, no lists. Name specifics.`;

export async function POST(req: NextRequest) {
  const hk = await getHouseholdKey();
  if (!hk) return NextResponse.json({ error: "No AI key configured" }, { status: 403 });

  const { brews } = await req.json();
  if (!Array.isArray(brews) || brews.length === 0) {
    return NextResponse.json({ error: "No brew data" }, { status: 400 });
  }

  try {
    const digest = brews.slice(0, 18).join("\n");
    const text = await complete(hk.key, hk.provider, {
      system: SYSTEM,
      prompt: `BREW LOG:\n${digest}`,
      maxTokens: 60,
    });
    return NextResponse.json({ text: text.trim().replace(/^["']|["']$/g, "") });
  } catch (err) {
    console.error("/api/insight error:", err);
    return NextResponse.json({ error: "Insight generation failed" }, { status: 500 });
  }
}

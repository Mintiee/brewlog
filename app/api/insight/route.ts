/**
 * POST /api/insight — generate a one-sentence Palate insight from recent brews.
 * Body: { brews: string[] } — array of formatted brew digest lines.
 * Returns: { text: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { getHouseholdKey } from "@/lib/llm/getKey";
import { createServiceClient } from "@/lib/supabase/server";
import { complete } from "@/lib/llm";

const SYSTEM = `You analyse a coffee brew log and find the most specific, slightly surprising pattern.
Reply with ONE sentence, max 20 words, conversational, no preamble, no markdown, no lists. Name specifics.`;

const DAY_MS = 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const hk = await getHouseholdKey();
  if (!hk) return NextResponse.json({ error: "No AI key configured" }, { status: 403 });

  const { brews } = await req.json();
  if (!Array.isArray(brews) || brews.length === 0) {
    return NextResponse.json({ error: "No brew data" }, { status: 400 });
  }

  const service = createServiceClient();

  // Cache: at most one LLM call per household per day (caps API spend across devices/remounts).
  const { data: cached } = await service
    .from("household_insight")
    .select("text,generated_at")
    .eq("household_id", hk.householdId)
    .single();

  if (cached && Date.now() - new Date(cached.generated_at).getTime() < DAY_MS) {
    return NextResponse.json({ text: cached.text, cached: true });
  }

  try {
    const digest = brews.slice(0, 18).join("\n");
    const text = (await complete(hk.key, hk.provider, {
      system: SYSTEM,
      prompt: `BREW LOG:\n${digest}`,
      maxTokens: 60,
    })).trim().replace(/^["']|["']$/g, "");

    // Persist the fresh insight as the new daily cache (service role bypasses RLS).
    await service
      .from("household_insight")
      .upsert({ household_id: hk.householdId, text, generated_at: new Date().toISOString() });

    return NextResponse.json({ text });
  } catch (err) {
    console.error("/api/insight error:", err);
    // Fall back to a stale cached insight rather than showing nothing.
    if (cached?.text) return NextResponse.json({ text: cached.text, cached: true });
    return NextResponse.json({ error: "Insight generation failed" }, { status: 500 });
  }
}

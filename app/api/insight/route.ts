/**
 * POST /api/insight — generate a one-sentence Palate insight from recent brews.
 * Body: { brews: string[] } — array of formatted brew digest lines.
 * Returns: { text: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { getHouseholdKey } from "@/lib/llm/getKey";
import { createServiceClient } from "@/lib/supabase/server";
import { complete } from "@/lib/llm";

const SYSTEM = `You are the quietly delightful voice of a home coffee log, writing the "This fortnight" note.
From the brews below — all rated in the last two weeks — surface ONE specific, true, slightly surprising observation: a quirk, a streak, a contrast, a standout favourite, or a pattern in the flavour scores (acidity, sweetness, body, clarity). It need not be statistical; it should feel like a small gift the drinker didn't expect to notice.
Speak to them directly ("you", "your"). Name real specifics from the data — roaster, coffee, brewer, a score — and NEVER invent a detail that isn't in the log. If the data is thin, say something small and honest rather than reaching for a claim.
Avoid generic praise, clichés, and hype.
Output ONLY one warm, conversational sentence of roughly 20 words or fewer — no preamble, no "Here is", no quotes, no markdown, no lists.`;

// Most capable model per provider — this single sentence is worth it.
const INSIGHT_MODEL = { anthropic: "claude-opus-4-8", openai: "gpt-5.5" } as const;

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
      model: INSIGHT_MODEL[hk.provider],
      maxTokens: 1024,
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

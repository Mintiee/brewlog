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
Speak to them directly ("you", "your"). Name real specifics from the data — roaster, coffee, origin, varietal, brewer, days rested, a score — and NEVER invent a detail that isn't in the log. Some cups list two tasters by name with separate scores; you may note where they agree or differ. If the data is thin, say something small and honest rather than reaching for a claim.
Avoid generic praise, clichés, and hype.
Output ONLY one warm, conversational sentence of roughly 20 words or fewer — no preamble, no "Here is", no quotes, no markdown, no lists.`;

// Most capable model per provider — this single sentence is worth it.
const INSIGHT_MODEL = { anthropic: "claude-opus-4-8", openai: "gpt-5.5" } as const;

// The local calendar day (YYYY-MM-DD) of a timestamp, shifted by the client's
// timezone offset (minutes, as returned by Date.prototype.getTimezoneOffset:
// positive west of UTC). Lets a UTC server reason in the user's local day.
function localDay(ms: number, tzOffsetMin: number): string {
  return new Date(ms - tzOffsetMin * 60000).toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const hk = await getHouseholdKey();
  if (!hk) return NextResponse.json({ error: "No AI key configured" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Malformed request body" }, { status: 400 });
  }
  const { brews, date, tzOffsetMin } = body;
  if (!Array.isArray(brews) || brews.length === 0) {
    return NextResponse.json({ error: "No brew data" }, { status: 400 });
  }
  // Client's local "today" and offset; fall back to a UTC day if absent (older clients).
  const offset = typeof tzOffsetMin === "number" ? tzOffsetMin : 0;
  const clientToday = typeof date === "string" ? date : localDay(Date.now(), offset);

  const service = createServiceClient();

  // Cache: at most one LLM call per household per local calendar day. Regenerate
  // when the cached insight was generated on an earlier local day than the
  // client's "today" — so a new note lands at the user's local midnight.
  const { data: cached } = await service
    .from("household_insight")
    .select("text,generated_at")
    .eq("household_id", hk.householdId)
    .maybeSingle();

  if (cached && localDay(new Date(cached.generated_at).getTime(), offset) === clientToday) {
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

/**
 * POST /api/tips — generate 2–3 practical, grounded brewing tips from the
 * household's recent brews. Cached weekly (one LLM call per household per week).
 * Body: { stats: string, brews: string[] } — a compact stats block + per-brew digest.
 * Returns: { tips: { icon: string; text: string }[] } or 204 when there isn't
 * enough signal / generation failed (client falls back to heuristic tips).
 */
import { NextRequest, NextResponse } from "next/server";
import { getHouseholdKey } from "@/lib/llm/getKey";
import { createServiceClient } from "@/lib/supabase/server";
import { complete } from "@/lib/llm";

// Icons the UI can render (see components/ui/Icon.tsx). The model must pick from this set.
const ALLOWED_ICONS = ["brew", "grind", "thermo", "timer", "drop", "scale", "citrus", "sugar", "bean", "spark"] as const;

const SYSTEM = `You are a sharp coffee coach reading a home brewer's recent log. Give 1–3 short, practical tips for their next cup.

Each tip: ONE imperative sentence, 15 words or fewer, leading with the lever — grind finer/coarser, water hotter/cooler, change ratio, rest longer, or favour a brewer/process. Speak directly ("you"). Ground tips in the data, but DON'T recite specifics: name at most one concrete anchor (a brewer, a process, a flavour) and only when it sharpens the advice. Never invent facts. One solid tip beats three padded ones — drop the weak ones. No hype, clichés, or "keep experimenting".

Choose the single most fitting icon for each tip from EXACTLY this list:
brew, grind, thermo, timer, drop, scale, citrus, sugar, bean, spark.

Output ONLY a JSON array — no prose, no markdown fences, nothing else. Each element: {"icon": "<one icon from the list>", "text": "<the tip>"}. Return 1 to 3 elements.`;

// Most capable model per provider — these tips are worth it.
const TIPS_MODEL = { anthropic: "claude-opus-4-8", openai: "gpt-5.5" } as const;

const MIN_BREWS = 3;

// Local calendar-day index of a timestamp, shifted by the client's timezone
// offset (minutes, per Date.prototype.getTimezoneOffset: positive west of UTC).
// Lets a UTC server reason about the user's local week boundary.
function localDayNum(ms: number, tzOffsetMin: number): number {
  return Math.floor((ms - tzOffsetMin * 60000) / 86400000);
}

interface Tip {
  icon: string;
  text: string;
}

/**
 * Tolerant parse of the model's reply into validated tips. Returns [] on any
 * problem so the caller can fall back rather than cache/serve garbage.
 */
function parseTips(raw: string): Tip[] {
  const s = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(s.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const allowed = new Set<string>(ALLOWED_ICONS);
  const out: Tip[] = [];
  for (const it of arr) {
    if (!it || typeof it !== "object") continue;
    const rec = it as Record<string, unknown>;
    const text = typeof rec.text === "string" ? rec.text.trim().replace(/^["']|["']$/g, "") : "";
    if (!text || text.length > 240) continue;
    const icon = typeof rec.icon === "string" && allowed.has(rec.icon) ? rec.icon : "brew";
    out.push({ icon, text });
    if (out.length === 3) break;
  }
  return out;
}

export async function POST(req: NextRequest) {
  const hk = await getHouseholdKey();
  if (!hk) return NextResponse.json({ error: "No AI key configured" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Malformed request body" }, { status: 400 });
  }
  const { stats, brews, tzOffsetMin } = body;
  if (!Array.isArray(brews) || brews.length < MIN_BREWS) {
    // Not enough signal — client shows heuristic tips instead.
    return new NextResponse(null, { status: 204 });
  }
  const offset = typeof tzOffsetMin === "number" ? tzOffsetMin : 0;

  const service = createServiceClient();

  // Weekly cache: at most one LLM call per household per local week. Regenerate
  // once 7 local days have passed since the cached tips were generated, so the
  // refresh lands on the morning of the 7th local day rather than drifting by
  // generation time-of-day or UTC.
  // (If the table doesn't exist yet, `data` is null and we proceed to generate;
  //  the upsert will fail and we degrade to 204 → heuristic tips.)
  const { data: cached } = await service
    .from("household_tips")
    .select("tips,generated_at")
    .eq("household_id", hk.householdId)
    .single();

  if (cached && localDayNum(Date.now(), offset) - localDayNum(new Date(cached.generated_at).getTime(), offset) < 7) {
    return NextResponse.json({ tips: cached.tips, cached: true });
  }

  try {
    const digest = (brews as string[]).join("\n");
    const statsBlock = typeof stats === "string" && stats.trim() ? `STATS:\n${stats.trim()}\n\n` : "";
    const raw = await complete(hk.key, hk.provider, {
      system: SYSTEM,
      prompt: `${statsBlock}BREW LOG (most recent first):\n${digest}`,
      model: TIPS_MODEL[hk.provider],
      maxTokens: 1024,
    });

    const tips = parseTips(raw);
    if (!tips.length) {
      // Parse failed or empty — never cache garbage. Serve stale if we have it,
      // else tell the client to fall back to heuristic tips.
      if (cached?.tips) return NextResponse.json({ tips: cached.tips, cached: true });
      return new NextResponse(null, { status: 204 });
    }

    await service
      .from("household_tips")
      .upsert({ household_id: hk.householdId, tips, generated_at: new Date().toISOString() });

    return NextResponse.json({ tips });
  } catch (err) {
    console.error("/api/tips error:", err);
    if (cached?.tips) return NextResponse.json({ tips: cached.tips, cached: true });
    return new NextResponse(null, { status: 204 });
  }
}

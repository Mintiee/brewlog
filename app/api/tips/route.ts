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

const SYSTEM = `You are a thoughtful, precise coffee coach reading a home brewer's recent log and giving them 2–3 short, practical tips to improve their next cup.

Ground EVERY tip in the data provided — cite their real brewers, coffees, processes, roast levels, days-since-roast, grind / temperature / ratio numbers, tasting notes, or flavour-score patterns (acidity, sweetness, body, clarity, each rated out of 5). NEVER invent a number, gear name, coffee, or fact that isn't in the data. If the data only supports one solid, genuine tip, give just one — one specific tip beats three padded ones.

Each tip is ONE actionable sentence (~25 words max), spoken directly to them ("you", "your"), built around a concrete lever they can pull next brew: reach for a particular brewer, nudge grind finer or coarser, change water temperature or ratio, lean into a process or roast they rate highly, or rest a coffee longer before brewing. Tie the lever to what the data shows (e.g. a brewer that scores higher, a flavour their favourites share). No hype, no clichés, no vague "keep experimenting".

Choose the single most fitting icon for each tip from EXACTLY this list:
brew, grind, thermo, timer, drop, scale, citrus, sugar, bean, spark.

Output ONLY a JSON array — no prose, no markdown fences, nothing else. Each element: {"icon": "<one icon from the list>", "text": "<the tip>"}. Return 1 to 3 elements.`;

// Most capable model per provider — these tips are worth it.
const TIPS_MODEL = { anthropic: "claude-opus-4-8", openai: "gpt-5.5" } as const;

const MIN_BREWS = 3;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

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

  const { stats, brews } = await req.json();
  if (!Array.isArray(brews) || brews.length < MIN_BREWS) {
    // Not enough signal — client shows heuristic tips instead.
    return new NextResponse(null, { status: 204 });
  }

  const service = createServiceClient();

  // Weekly cache: at most one LLM call per household per week.
  // (If the table doesn't exist yet, `data` is null and we proceed to generate;
  //  the upsert will fail and we degrade to 204 → heuristic tips.)
  const { data: cached } = await service
    .from("household_tips")
    .select("tips,generated_at")
    .eq("household_id", hk.householdId)
    .single();

  if (cached && Date.now() - new Date(cached.generated_at).getTime() < WEEK_MS) {
    return NextResponse.json({ tips: cached.tips, cached: true });
  }

  try {
    const digest = (brews as string[]).slice(0, 20).join("\n");
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

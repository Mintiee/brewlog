/**
 * POST /api/tips — generate 2–3 practical, grounded brewing tips from the
 * household's recent brews. Cached weekly (one LLM call per household per week).
 * Body: { stats: string, brews: string[] } — a compact stats block + per-brew digest.
 * Returns: { tips: { icon: string; text: string }[] } or 204 when there isn't
 * enough signal / generation failed (client falls back to heuristic tips).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { completeJSON } from "@/lib/llm";
import { requireHouseholdKey, parseJsonBody, checkRateLimit } from "@/lib/api/guards";

// Icons the UI can render (see components/ui/Icon.tsx). The model must pick from this set.
const ALLOWED_ICONS = ["brew", "grind", "thermo", "timer", "drop", "scale", "citrus", "sugar", "bean", "spark"] as const;

const SYSTEM = `You are a sharp coffee coach reading a home brewer's recent log. Give 1–3 short, practical tips for their next cup.

Each tip: ONE imperative sentence, 15 words or fewer, leading with the lever — grind finer/coarser, water hotter/cooler, change ratio, rest longer, or favour a brewer/process. Speak directly ("you"). Ground tips in the data, but DON'T recite specifics: name at most one concrete anchor (a brewer, a process, a flavour) and only when it sharpens the advice. Never invent facts. One solid tip beats three padded ones — drop the weak ones. No hype, clichés, or "keep experimenting".

Choose the single most fitting icon for each tip from EXACTLY this list:
brew, grind, thermo, timer, drop, scale, citrus, sugar, bean, spark.

Output ONLY a JSON object of the form {"tips":[...]} — no prose, no markdown fences, nothing else. Each array element: {"icon": "<one icon from the list>", "text": "<the tip>"}. Return 1 to 3 elements.`;

// Most capable model per provider — these tips are worth it.
const TIPS_MODEL = { anthropic: "claude-opus-4-8", openai: "gpt-5.5" } as const;

// Structured-output schema — the array is wrapped in an object per JSON-schema
// best practice (structured-output roots must be objects). parseTips remains the
// authoritative validator (icon allowlist, text length) on the parsed result.
const TIPS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["tips"],
  properties: {
    tips: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["icon", "text"],
        properties: {
          icon: { type: "string", enum: [...ALLOWED_ICONS] },
          text: { type: "string" },
        },
      },
    },
  },
} as const;

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
 * Validate the parsed reply into tips. Accepts the structured object
 * `{tips:[...]}` or a bare array (fallback path). Returns [] on any problem so
 * the caller can fall back rather than cache/serve garbage.
 */
function parseTips(parsed: unknown): Tip[] {
  const arr = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { tips?: unknown }).tips)
      ? (parsed as { tips: unknown[] }).tips
      : null;
  if (!arr) return [];
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
  const hkGuard = await requireHouseholdKey();
  if (!hkGuard.ok) return hkGuard.response;
  const hk = hkGuard.value;

  const bodyGuard = await parseJsonBody(req);
  if (!bodyGuard.ok) return bodyGuard.response;
  const { stats, brews, tzOffsetMin, force } = bodyGuard.value as { stats?: unknown; brews?: unknown; tzOffsetMin?: unknown; force?: unknown };
  if (!Array.isArray(brews) || brews.length < MIN_BREWS) {
    // Not enough signal — client shows heuristic tips instead.
    return new NextResponse(null, { status: 204 });
  }
  const offset = typeof tzOffsetMin === "number" ? tzOffsetMin : 0;
  const forceRefresh = force === true;

  // A manual force-refresh bypasses the once-a-week cache gate below, so it
  // needs its own guard against a runaway client loop burning the household's
  // LLM budget — the normal path is already self-limiting via the weekly cache.
  if (forceRefresh) {
    const rateGuard = checkRateLimit(hk.householdId);
    if (!rateGuard.ok) return rateGuard.response;
  }

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

  if (!forceRefresh && cached && localDayNum(Date.now(), offset) - localDayNum(new Date(cached.generated_at).getTime(), offset) < 7) {
    return NextResponse.json({ tips: cached.tips, cached: true });
  }

  try {
    // Defensive backstop — the client already caps to the 40 most recent rated
    // brews before sending, but don't trust that blindly for prompt cost.
    const digest = (brews as string[]).slice(0, 40).join("\n");
    const statsBlock = typeof stats === "string" && stats.trim() ? `STATS:\n${stats.trim()}\n\n` : "";
    const parsed = await completeJSON(hk.key, hk.provider, {
      system: SYSTEM,
      prompt: `${statsBlock}BREW LOG (most recent first):\n${digest}`,
      model: TIPS_MODEL[hk.provider],
      maxTokens: 1024,
      schemaName: "brewing_tips",
      schema: TIPS_SCHEMA,
    });

    const tips = parseTips(parsed);
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

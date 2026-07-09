/**
 * POST /api/classify-varietals — canonicalise unknown varietal tokens.
 * Body: { varietals: string[] }
 * Returns: { map: Record<string, { canonical: string; is_blend_label: boolean }> }
 * Side effect: upserts learned_varietals in the global shared table.
 * Mirrors /api/classify-notes.
 */
import { NextRequest, NextResponse } from "next/server";
import { completeJSON } from "@/lib/llm";
import { createServiceClient } from "@/lib/supabase/server";
import { requireHouseholdKey, parseJsonBody, checkRateLimit } from "@/lib/api/guards";

// Guard for the global learned_varietals primary key AND the returned canonical.
// learned_varietals is a shared, cross-household table, so a bad key written
// once poisons everyone's lookups. Unlike tasting notes, varietal names contain
// digits (SL28, Ruiru 11, 74110) and dots (Anacafe 14 variants) — admit
// letters/digits plus spaces, dots, hyphens and ampersands, capped at 40 chars.
const VARIETAL_KEY_RE = /^[\p{L}\p{N}][\p{L}\p{N} .&-]*$/u;
function isValidVarietalKey(v: string): boolean {
  return v.length >= 1 && v.length <= 40 && VARIETAL_KEY_RE.test(v);
}

export async function POST(req: NextRequest) {
  const hkGuard = await requireHouseholdKey();
  if (!hkGuard.ok) return hkGuard.response;
  const hk = hkGuard.value;

  const rateGuard = checkRateLimit(hk.householdId);
  if (!rateGuard.ok) return rateGuard.response;

  const bodyGuard = await parseJsonBody(req);
  if (!bodyGuard.ok) return bodyGuard.response;
  const { varietals: rawTokens } = bodyGuard.value as { varietals?: unknown };
  if (!Array.isArray(rawTokens) || rawTokens.length === 0) {
    return NextResponse.json({ map: {} });
  }
  // Normalise + dedupe + cap so a big shelf sweep can't blow the token budget.
  const tokens = [...new Set(rawTokens.map((t) => String(t).toLowerCase().trim()).filter(Boolean))].slice(0, 50);
  if (tokens.length === 0) return NextResponse.json({ map: {} });

  try {
    // Schema keys are the exact input tokens → {canonical, is_blend_label} each,
    // so the model must answer every token verbatim and the parse can't drift.
    const parsed = await completeJSON(hk.key, hk.provider, {
      system: `You canonicalise coffee varietal (cultivar) names printed on specialty-coffee bags.
For each input token return its canonical varietal name and whether it is a blend label.
canonical: the standard spelling of the cultivar (e.g. "sl-28" → "SL28", "geisha" → "Gesha", "red bourbon" → "Red Bourbon", "castillo" → "Castillo"). Preserve meaningful qualifiers — "Pink Bourbon" stays "Pink Bourbon", it is NOT Bourbon. If the token is not a recognisable cultivar, return it title-cased verbatim.
is_blend_label: true ONLY for terms that denote an unspecified mix of varieties rather than one specific cultivar — e.g. "Heirloom", "Ethiopian Heirloom", "Landrace", "Field Blend", "Various", "Mixed", "Local Varieties". Specific named cultivars (SL28, Gesha, Caturra, Ruiru 11, Batian, Sidra, Chiroso, Wush Wush, 74110…) are false.
Return ONLY minified JSON mapping each input token (verbatim, lowercase) to {"canonical":"","is_blend_label":false}.`,
      prompt: `VARIETALS: ${JSON.stringify(tokens)}`,
      maxTokens: 768,
      schemaName: "varietal_canonicals",
      schema: {
        type: "object",
        additionalProperties: false,
        required: tokens,
        properties: Object.fromEntries(
          tokens.map((t) => [t, {
            type: "object",
            additionalProperties: false,
            required: ["canonical", "is_blend_label"],
            properties: {
              canonical: { type: "string" },
              is_blend_label: { type: "boolean" },
            },
          }]),
        ),
      },
    });

    // Second line of defence: validate/normalise regardless of how it parsed.
    const llmMap = (parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {}) as Record<string, unknown>;
    const map: Record<string, { canonical: string; is_blend_label: boolean }> = {};

    tokens.forEach((t) => {
      const entry = llmMap[t];
      if (!entry || typeof entry !== "object") return;
      const canonical = String((entry as Record<string, unknown>).canonical ?? "").trim();
      if (!isValidVarietalKey(canonical)) return;
      map[t] = {
        canonical,
        is_blend_label: (entry as Record<string, unknown>).is_blend_label === true,
      };
    });

    // Persist into the global learned_varietals table (service role — bypasses
    // RLS). Insert-only: ignoreDuplicates so a later run can never overwrite an
    // existing global mapping, and skip keys that fail validation so junk from
    // a bad LLM response can't be written to the shared table.
    const rows = Object.entries(map)
      .filter(([raw]) => isValidVarietalKey(raw))
      .map(([raw, v]) => ({ raw, canonical: v.canonical, is_blend_label: v.is_blend_label }));
    if (rows.length) {
      const service = createServiceClient();
      const { error } = await service
        .from("learned_varietals")
        .upsert(rows, { onConflict: "raw", ignoreDuplicates: true });
      if (error) console.error("/api/classify-varietals learned_varietals insert failed:", error);
    }

    return NextResponse.json({ map });
  } catch (err) {
    console.error("/api/classify-varietals error:", err);
    return NextResponse.json({ map: {} });
  }
}

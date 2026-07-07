/**
 * POST /api/classify-notes — classify unknown tasting notes into SCA flavour families.
 * Body: { notes: string[] }
 * Returns: { map: Record<string, string> } — note → family
 * Side effect: upserts learned_notes in the global shared table.
 */
import { NextRequest, NextResponse } from "next/server";
import { complete } from "@/lib/llm";
import { createServiceClient } from "@/lib/supabase/server";
import { requireHouseholdKey, parseJsonBody, checkRateLimit } from "@/lib/api/guards";

const FAMILIES = "floral, citrus, yellow fruit, red fruit, dark fruit, chocolate, roasty, nutty, sweet, spice, winey, herbal, other";

// Guard for the global learned_notes primary key. learned_notes is a shared,
// cross-household table, so a bad key written once poisons everyone's lookups.
// Match the lookup normalisation in lib/flavour (lower-cased, trimmed) and only
// admit strings that plausibly are a tasting note: letters plus spaces, hyphens
// and ampersands, no digits/punctuation/control chars, capped at 40 chars.
const NOTE_KEY_RE = /^[\p{L}][\p{L} &-]*$/u;
function isValidNoteKey(note: string): boolean {
  return note.length >= 1 && note.length <= 40 && NOTE_KEY_RE.test(note);
}
const NOTE_CATMAP: Record<string, string> = {
  floral: "flower",
  citrus: "citrus",
  "yellow fruit": "yellowfruit",
  "red fruit": "redfruit",
  "dark fruit": "berry",
  chocolate: "choco",
  roasty: "roast",
  nutty: "nut",
  sweet: "sugar",
  spice: "spice",
  winey: "wine",
  herbal: "leaf",
  other: "drop",
};

export async function POST(req: NextRequest) {
  const hkGuard = await requireHouseholdKey();
  if (!hkGuard.ok) return hkGuard.response;
  const hk = hkGuard.value;

  const rateGuard = checkRateLimit(hk.householdId);
  if (!rateGuard.ok) return rateGuard.response;

  const bodyGuard = await parseJsonBody(req);
  if (!bodyGuard.ok) return bodyGuard.response;
  const { notes: rawNotes } = bodyGuard.value as { notes?: unknown };
  if (!Array.isArray(rawNotes) || rawNotes.length === 0) {
    return NextResponse.json({ map: {} });
  }
  // Normalise + dedupe + cap so a big shelf sweep can't blow the token budget.
  const notes = [...new Set(rawNotes.map((n) => String(n).toLowerCase().trim()).filter(Boolean))].slice(0, 50);
  if (notes.length === 0) return NextResponse.json({ map: {} });

  try {
    const raw = await complete(hk.key, hk.provider, {
      system: `You categorise coffee tasting notes onto the SCA flavour wheel.
For each note pick exactly one category from: ${FAMILIES}.
Notes that describe acidity, brightness or effervescence rather than a flavour (e.g. acidic, sparkling, lively, tangy) → citrus.
Creamy / dairy / buttery texture notes → nutty. Sweetness or silky / syrupy / round body notes → sweet.
Drinks and confections map to their closest flavour (e.g. cream soda → sweet, cola → sweet, earl grey → citrus).
Use "other" ONLY for notes with no flavour or mouthfeel content at all (e.g. complex, balanced, delicious).
Return ONLY minified JSON mapping each input note (verbatim, lowercase) to its category.`,
      prompt: `NOTES: ${JSON.stringify(notes)}`,
      maxTokens: 512,
    });

    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ map: {} });

    const llmMap: Record<string, string> = JSON.parse(match[0]);
    const map: Record<string, string> = {};

    notes.forEach((n: string) => {
      const fam = NOTE_CATMAP[(llmMap[n] ?? "").toLowerCase()];
      if (fam) map[n] = fam;
    });

    // Persist into the global learned_notes table (service role — bypasses RLS).
    // Insert-only: ignoreDuplicates so a later run can never overwrite an
    // existing global mapping, and skip keys that fail validation so junk from
    // a bad LLM response can't be written to the shared table.
    const rows = Object.entries(map)
      .filter(([note]) => isValidNoteKey(note))
      .map(([note, family]) => ({ note, family }));
    if (rows.length) {
      const service = createServiceClient();
      const { error } = await service
        .from("learned_notes")
        .upsert(rows, { onConflict: "note", ignoreDuplicates: true });
      // Classification still succeeded for this client — log so a broken global
      // cache (every session re-classifying the same notes) is diagnosable.
      if (error) console.error("/api/classify-notes learned_notes insert failed:", error);
    }

    return NextResponse.json({ map });
  } catch (err) {
    console.error("/api/classify-notes error:", err);
    return NextResponse.json({ map: {} });
  }
}

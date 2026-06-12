/**
 * POST /api/classify-notes — classify unknown tasting notes into SCA flavour families.
 * Body: { notes: string[] }
 * Returns: { map: Record<string, string> } — note → family
 * Side effect: upserts learned_notes in the global shared table.
 */
import { NextRequest, NextResponse } from "next/server";
import { getHouseholdKey } from "@/lib/llm/getKey";
import { complete } from "@/lib/llm";
import { createServiceClient } from "@/lib/supabase/server";

const FAMILIES = "floral, citrus, yellow fruit, red fruit, dark fruit, chocolate, roasty, nutty, sweet, spice, winey, herbal, other";
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
  const hk = await getHouseholdKey();
  if (!hk) return NextResponse.json({ error: "No AI key configured" }, { status: 403 });

  const { notes: rawNotes } = await req.json();
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

    // Upsert into the global learned_notes table (service role — bypasses RLS)
    if (Object.keys(map).length) {
      const service = createServiceClient();
      const rows = Object.entries(map).map(([note, family]) => ({ note, family }));
      await service.from("learned_notes").upsert(rows, { onConflict: "note" });
    }

    return NextResponse.json({ map });
  } catch (err) {
    console.error("/api/classify-notes error:", err);
    return NextResponse.json({ map: {} });
  }
}

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

const FAMILIES = "floral, citrus, berry, orchard, chocolate, nutty, sweet, winey, herbal, other";
const NOTE_CATMAP: Record<string, string> = {
  floral: "flower", citrus: "citrus", berry: "berry", orchard: "cherry",
  chocolate: "choco", nutty: "nut", sweet: "sugar", winey: "wine", herbal: "leaf", other: "drop",
};

export async function POST(req: NextRequest) {
  const hk = await getHouseholdKey();
  if (!hk) return NextResponse.json({ error: "No AI key configured" }, { status: 403 });

  const { notes } = await req.json();
  if (!Array.isArray(notes) || notes.length === 0) {
    return NextResponse.json({ map: {} });
  }

  try {
    const raw = await complete(hk.key, hk.provider, {
      system: `You categorise coffee tasting notes onto the SCA flavour wheel.
For each note pick exactly one category from: ${FAMILIES}.
Return ONLY minified JSON mapping each input note (verbatim, lowercase) to its category.`,
      prompt: `NOTES: ${JSON.stringify(notes)}`,
      maxTokens: 256,
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

/**
 * POST /api/import — parse a free-form text description of coffees into a
 * structured list using the household's LLM key. Used by ImportSheet's
 * "Paste text" path when llmEnabled.
 *
 * Body: { text: string }
 * Returns: { coffees: ImportedCoffee[] } or error.
 *
 * Mirrors app/api/extract/route.ts in structure (getHouseholdKey gate, complete(),
 * tolerant JSON parse). Uses an array system prompt like tips/route.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { getHouseholdKey } from "@/lib/llm/getKey";
import { complete } from "@/lib/llm";
import type { ImportedCoffee } from "@/lib/import/types";

const MAX_INPUT = 8000; // characters — generous but bounded

const SYSTEM = `You are helping a coffee enthusiast import their coffee list into a tracking app.
Extract coffee entries from the user's text and return ONLY a minified JSON array — no prose, no markdown, no backticks.

Each element must be an object with these fields (all optional except roaster and name):
{"roaster":"","name":"","origin":"","region":"","varietal":"","process":"","roast":"light|medium-light|medium|medium-dark|dark","roasted_at":"YYYY-MM-DD or null","grams":250,"notes":["tasting","descriptors"]}

Rules:
- roast must be exactly one of: light, medium-light, medium, medium-dark, dark
- roasted_at must be YYYY-MM-DD format, or null if unknown
- grams is the bag weight in grams (default 250 if not mentioned)
- notes is an array of short tasting descriptor strings
- Leave unknown optional fields as empty string or null — do not guess
- Output ONLY the JSON array, nothing else`;

function parseImportResponse(raw: string): ImportedCoffee[] | null {
  const s = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const arr = JSON.parse(s.slice(start, end + 1));
    if (!Array.isArray(arr)) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return arr.filter((item: any) => item && typeof item === "object" && item.name);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const hk = await getHouseholdKey();
  if (!hk) return NextResponse.json({ error: "No AI key configured" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.text !== "string" || !body.text.trim()) {
    return NextResponse.json({ error: "Provide { text }" }, { status: 400 });
  }

  const text = body.text.slice(0, MAX_INPUT);

  try {
    const raw = await complete(hk.key, hk.provider, {
      system: SYSTEM,
      prompt: text,
      maxTokens: 2000,
    });

    const coffees = parseImportResponse(raw);
    if (!coffees) {
      return NextResponse.json({ error: "Could not parse coffee list from response" }, { status: 422 });
    }

    return NextResponse.json({ coffees });
  } catch (err) {
    console.error("/api/import error:", err);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}

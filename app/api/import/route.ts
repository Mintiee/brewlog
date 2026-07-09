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
import { completeJSON } from "@/lib/llm";
import { requireHouseholdKey, checkRateLimit } from "@/lib/api/guards";
import type { ImportedCoffee } from "@/lib/import/types";

const MAX_INPUT = 8000; // characters — generous but bounded

const SYSTEM = `You are helping a coffee enthusiast import their coffee list into a tracking app.
Extract coffee entries from the user's text and return ONLY a minified JSON object of the form {"coffees":[...]} — no prose, no markdown, no backticks.

Each array element must be an object with these fields (all optional except roaster and name):
{"roaster":"","name":"","origin":"","region":"","varietal":"","process":"","roast":"light|medium-light|medium|medium-dark|dark","roasted_at":"YYYY-MM-DD or null","grams":250,"notes":["tasting","descriptors"]}

Rules:
- roast must be exactly one of: light, medium-light, medium, medium-dark, dark
- roasted_at must be YYYY-MM-DD format, or null if unknown
- grams is the bag weight in grams (default 250 if not mentioned)
- notes is an array of short tasting descriptor strings
- varietal: list multiple varietals in one string separated by "/" (e.g. "SL28/SL34")
- Leave unknown optional fields as empty string or null — do not guess
- Output ONLY the JSON object {"coffees":[...]}, nothing else`;

// JSON-schema best practice wraps the list in an object (structured-output roots
// must be objects). additionalProperties:true keeps optional per-coffee fields
// flexible; materialize.ts is the authoritative normaliser downstream.
const IMPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["coffees"],
  properties: {
    coffees: {
      type: "array",
      items: {
        type: "object",
        properties: {
          roaster: { type: "string" },
          name: { type: "string" },
          origin: { type: "string" },
          region: { type: "string" },
          varietal: { type: "string" },
          process: { type: "string" },
          roast: { type: "string" },
          roasted_at: { type: ["string", "null"] },
          grams: { type: "number" },
          notes: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

/** Normalise the parsed reply (object `{coffees:[...]}` from structured output,
 *  or a bare array from the fallback path) into validated ImportedCoffee rows. */
function toImportedCoffees(parsed: unknown): ImportedCoffee[] | null {
  const arr = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { coffees?: unknown }).coffees)
      ? (parsed as { coffees: unknown[] }).coffees
      : null;
  if (!arr) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return arr.filter((item: any) => item && typeof item === "object" && item.name);
}

export async function POST(req: NextRequest) {
  const hkGuard = await requireHouseholdKey();
  if (!hkGuard.ok) return hkGuard.response;
  const hk = hkGuard.value;

  const rateGuard = checkRateLimit(hk.householdId);
  if (!rateGuard.ok) return rateGuard.response;

  const body = await req.json().catch(() => null);
  if (!body || typeof body.text !== "string" || !body.text.trim()) {
    return NextResponse.json({ error: "Provide { text }" }, { status: 400 });
  }

  const text = body.text.slice(0, MAX_INPUT);

  try {
    const parsed = await completeJSON(hk.key, hk.provider, {
      system: SYSTEM,
      prompt: text,
      maxTokens: 2000,
      schemaName: "coffee_list",
      schema: IMPORT_SCHEMA,
    });

    const coffees = toImportedCoffees(parsed);
    if (!coffees) {
      return NextResponse.json({ error: "Could not parse coffee list from response" }, { status: 422 });
    }

    return NextResponse.json({ coffees });
  } catch (err) {
    console.error("/api/import error:", err);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}

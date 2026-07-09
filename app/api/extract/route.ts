/**
 * POST /api/extract — extract coffee details from a bag photo or product URL.
 * Body: { image?: string (base64 data-URL), url?: string }
 * Returns: { roaster, name, origin, region, varietals[], process, roast, roastDaysAgo, notes[] }
 */
import { NextRequest, NextResponse } from "next/server";
import { completeJSON } from "@/lib/llm";
import { requireHouseholdKey, parseJsonBody, checkRateLimit } from "@/lib/api/guards";
import { safeFetchText, UnsafeUrlError } from "@/lib/api/ssrf";
import { sanitizeExtractOutput } from "@/lib/api/extractOutput";

// Structured-output schema mirroring the fields the prompts describe. All keys
// required (nullable where a value may be absent) for strict-mode compatibility;
// sanitizeExtractOutput remains the authoritative validator on the parsed result.
const EXTRACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["roaster", "name", "origin", "region", "varietals", "process", "roast", "roastDaysAgo", "notes"],
  properties: {
    roaster: { type: "string" },
    name: { type: "string" },
    origin: { type: "string" },
    region: { type: "string" },
    varietals: { type: "array", items: { type: "string" } },
    process: { type: "string" },
    roast: { type: ["string", "null"] },
    roastDaysAgo: { type: ["integer", "null"] },
    notes: { type: "array", items: { type: "string" } },
  },
} as const;

const SYSTEM_PHOTO = `You are reading a specialty-coffee bag label to extract structured data.
Return ONLY minified JSON (no prose, no markdown, no backticks):
{"roaster":"","name":"","origin":"","region":"","varietals":["",""],"process":"","roast":"light|medium|dark","roastDaysAgo":<int or null>,"notes":["","",""]}
varietals: list each varietal separately, exactly as printed on the bag (e.g. ["SL28","SL34"] or ["Heirloom"]); use [] if not visible.
Use real-sounding specialty coffee details from what you see. If a field is not visible, use null or empty string.`;

const SYSTEM_URL = `You are reading a roaster's online product page to extract coffee details.
Web pages rarely list a roast date (leave roastDaysAgo as null).
Return ONLY minified JSON (no prose, no markdown, no backticks):
{"roaster":"","name":"","origin":"","region":"","varietals":["",""],"process":"","roast":"light|medium|dark","roastDaysAgo":null,"notes":["","",""]}
varietals: list each varietal separately, exactly as printed on the page (e.g. ["SL28","SL34"] or ["Heirloom"]); use [] if not stated.`;

export async function POST(req: NextRequest) {
  const hkGuard = await requireHouseholdKey();
  if (!hkGuard.ok) return hkGuard.response;
  const hk = hkGuard.value;

  const rateGuard = checkRateLimit(hk.householdId);
  if (!rateGuard.ok) return rateGuard.response;

  const bodyGuard = await parseJsonBody(req);
  if (!bodyGuard.ok) return bodyGuard.response;
  const { image, url } = bodyGuard.value as { image?: string; url?: string };

  try {
    if (image) {
      // Photo extraction — vision model reads the actual bag
      const parsed = await completeJSON(hk.key, hk.provider, {
        system: SYSTEM_PHOTO,
        prompt: "Extract the coffee details from this bag label.",
        image,
        maxTokens: 400,
        schemaName: "coffee_details",
        schema: EXTRACT_SCHEMA,
      });
      if (!parsed) throw new Error("No JSON in response");
      const data = sanitizeExtractOutput(parsed);
      return NextResponse.json(data);
    }

    if (url) {
      // URL extraction — server fetches the page (SSRF-guarded: https-only,
      // rejects private/loopback/link-local/metadata addresses on every
      // redirect hop, capped response size), then extracts.
      let html: string;
      try {
        html = await safeFetchText(url, { headers: { "User-Agent": "Mozilla/5.0 brewlog/1.0" }, timeoutMs: 8000 });
      } catch (err) {
        if (err instanceof UnsafeUrlError) {
          return NextResponse.json({ error: err.message }, { status: 400 });
        }
        throw err;
      }
      // Strip to text content (very basic; the LLM handles the noise)
      const text = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 4000);

      const parsed = await completeJSON(hk.key, hk.provider, {
        system: SYSTEM_URL,
        prompt: `Extract the coffee details from this page content:\n\n${text}`,
        maxTokens: 400,
        schemaName: "coffee_details",
        schema: EXTRACT_SCHEMA,
      });
      if (!parsed) throw new Error("No JSON in response");
      const data = sanitizeExtractOutput(parsed);
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: "Provide image or url" }, { status: 400 });
  } catch (err) {
    console.error("/api/extract error:", err);
    return NextResponse.json({ error: "Extraction failed" }, { status: 500 });
  }
}

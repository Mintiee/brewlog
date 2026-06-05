/**
 * POST /api/extract — extract coffee details from a bag photo or product URL.
 * Body: { image?: string (base64 data-URL), url?: string }
 * Returns: { roaster, name, origin, region, varietal, process, roast, roastDaysAgo, notes[] }
 */
import { NextRequest, NextResponse } from "next/server";
import { getHouseholdKey } from "@/lib/llm/getKey";
import { complete } from "@/lib/llm";

const SYSTEM_PHOTO = `You are reading a specialty-coffee bag label to extract structured data.
Return ONLY minified JSON (no prose, no markdown, no backticks):
{"roaster":"","name":"","origin":"","region":"","varietal":"","process":"","roast":"light|medium|dark","roastDaysAgo":<int or null>,"notes":["","",""]}
Use real-sounding specialty coffee details from what you see. If a field is not visible, use null or empty string.`;

const SYSTEM_URL = `You are reading a roaster's online product page to extract coffee details.
Web pages rarely list a roast date (leave roastDaysAgo as null).
Return ONLY minified JSON (no prose, no markdown, no backticks):
{"roaster":"","name":"","origin":"","region":"","varietal":"","process":"","roast":"light|medium|dark","roastDaysAgo":null,"notes":["","",""]}`;

export async function POST(req: NextRequest) {
  const hk = await getHouseholdKey();
  if (!hk) return NextResponse.json({ error: "No AI key configured" }, { status: 403 });

  const { image, url } = await req.json();

  try {
    if (image) {
      // Photo extraction — vision model reads the actual bag
      const raw = await complete(hk.key, hk.provider, {
        system: SYSTEM_PHOTO,
        prompt: "Extract the coffee details from this bag label.",
        image,
        maxTokens: 400,
      });
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("No JSON in response");
      const data = JSON.parse(match[0]);
      return NextResponse.json(data);
    }

    if (url) {
      // URL extraction — server fetches the page, then extracts
      const pageRes = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 brewlog/1.0" }, signal: AbortSignal.timeout(8000) });
      const html = await pageRes.text();
      // Strip to text content (very basic; the LLM handles the noise)
      const text = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 4000);

      const raw = await complete(hk.key, hk.provider, {
        system: SYSTEM_URL,
        prompt: `Extract the coffee details from this page content:\n\n${text}`,
        maxTokens: 400,
      });
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("No JSON in response");
      const data = JSON.parse(match[0]);
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: "Provide image or url" }, { status: 400 });
  } catch (err) {
    console.error("/api/extract error:", err);
    return NextResponse.json({ error: "Extraction failed" }, { status: 500 });
  }
}

/**
 * Shared API-route guards: auth, household AI key, and JSON body parsing.
 * Extracted from copy-pasted patterns across app/api/* routes — behavior
 * (status codes + response shapes) matches the original inline checks.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getHouseholdKey, type HouseholdKey } from "@/lib/llm/getKey";
import type { User } from "@supabase/supabase-js";

export type Guard<T> = { ok: true; value: T } | { ok: false; response: NextResponse };

/** Require an authenticated Supabase user, or a 401 NextResponse. */
export async function requireUser(): Promise<Guard<User>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }
  return { ok: true, value: user };
}

/** Require a configured household AI key, or a 403 NextResponse. */
export async function requireHouseholdKey(): Promise<Guard<HouseholdKey>> {
  const hk = await getHouseholdKey();
  if (!hk) {
    return { ok: false, response: NextResponse.json({ error: "No AI key configured" }, { status: 403 }) };
  }
  return { ok: true, value: hk };
}

/** Parse the request body as JSON, requiring a plain object, or a 400 NextResponse. */
export async function parseJsonBody(req: NextRequest): Promise<Guard<Record<string, unknown>>> {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return { ok: false, response: NextResponse.json({ error: "Malformed request body" }, { status: 400 }) };
  }
  return { ok: true, value: body as Record<string, unknown> };
}

/**
 * Per-household token-bucket rate limiter for the uncached, per-request LLM
 * routes (import/extract/classify-notes — no daily/weekly cache to absorb
 * abuse). In-memory Map keyed by household id: state is per-instance and
 * resets on cold start, and a multi-instance Vercel deployment means the
 * *effective* limit is (limit × instance count) rather than a hard global
 * cap. That's an acceptable trade at this app's scale — the goal is to stop
 * a runaway client loop or a leaked key from burning through the household's
 * LLM budget, not to defend against a distributed attacker.
 */
interface Bucket {
  tokens: number;
  last: number;
}
const buckets = new Map<string, Bucket>();

const RATE_LIMIT_PER_MIN = 10; // steady-state requests/minute
const RATE_BURST = 15; // bucket capacity — allows a short burst above the steady rate

/** Consume one token from the household's bucket, or return a 429 NextResponse. */
export function checkRateLimit(householdId: string): Guard<void> {
  const now = Date.now();
  const bucket = buckets.get(householdId) ?? { tokens: RATE_BURST, last: now };

  const elapsedMs = now - bucket.last;
  bucket.tokens = Math.min(RATE_BURST, bucket.tokens + (elapsedMs / 60_000) * RATE_LIMIT_PER_MIN);
  bucket.last = now;

  if (bucket.tokens < 1) {
    buckets.set(householdId, bucket);
    return {
      ok: false,
      response: NextResponse.json({ error: "Too many requests — please slow down and try again in a minute." }, { status: 429 }),
    };
  }

  bucket.tokens -= 1;
  buckets.set(householdId, bucket);
  return { ok: true, value: undefined };
}

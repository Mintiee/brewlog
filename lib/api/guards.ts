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

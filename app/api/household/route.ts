/**
 * POST /api/household — join an existing household by invite code.
 * Body: { name: string, inviteCode: string }
 *
 * Called after email+OTP verification, only for users who don't yet have a
 * profile. Validates the submitted invite code against households.invite_code
 * (service-role lookup, bypassing RLS) and, on a match, creates the caller's
 * profile in that household under the given name. A wrong/unknown code → 403.
 *
 * Household *creation* is deliberately NOT a flow here: the shared household
 * already exists and members only ever join it. There is no first-caller
 * seeding — that would let a stranger with a valid session mint a household.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/api/guards";

export async function POST(req: NextRequest) {
  const userGuard = await requireUser();
  if (!userGuard.ok) return userGuard.response;
  const user = userGuard.value;

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const inviteCode = typeof body.inviteCode === "string" ? body.inviteCode.trim() : "";

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!inviteCode) return NextResponse.json({ error: "Invite code is required" }, { status: 400 });

  const service = createServiceClient();

  // Validate the invite code against an existing household. No match → 403.
  const { data: household, error: lookupErr } = await service
    .from("households").select("id").eq("invite_code", inviteCode).maybeSingle();
  if (lookupErr) return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  if (!household) return NextResponse.json({ error: "Invalid invite code" }, { status: 403 });

  // Create/refresh this user's profile in the household (idempotent on re-submit).
  const { error: profileErr } = await service
    .from("profiles").upsert({ id: user.id, household_id: household.id, name });
  if (profileErr) return NextResponse.json({ error: "Could not create profile" }, { status: 500 });

  return NextResponse.json({ household_id: household.id });
}

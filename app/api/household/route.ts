/**
 * POST /api/household — called after first sign-in to create or join a household.
 * Body: { invite_code?: string } — if provided, join that household; else create a new one.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient as createServer } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { seedHousehold } from "@/lib/db/seed";

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export async function POST(req: NextRequest) {
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const inviteCode: string | undefined = body.invite_code;

  const service = createServiceClient();

  // Check if profile already exists (idempotent)
  const { data: existingProfile } = await service.from("profiles").select("id,household_id").eq("id", user.id).single();
  if (existingProfile) {
    return NextResponse.json({ household_id: existingProfile.household_id });
  }

  let householdId: string;

  if (inviteCode) {
    // Join existing household
    const { data: household, error } = await service.from("households").select("id").eq("invite_code", inviteCode.toUpperCase()).single();
    if (error || !household) return NextResponse.json({ error: "Invalid invite code" }, { status: 400 });
    householdId = household.id;
  } else {
    // Create new household
    const code = generateInviteCode();
    const { data: household, error } = await service.from("households").insert({ invite_code: code }).select("id").single();
    if (error || !household) return NextResponse.json({ error: "Failed to create household" }, { status: 500 });
    householdId = household.id;

    // Seed the household with demo data
    try { await seedHousehold(service, householdId, user.id); } catch { /* non-fatal */ }
  }

  // Create profile
  await service.from("profiles").insert({
    id: user.id,
    household_id: householdId,
    name: user.email?.split("@")[0] ?? "You",
  });

  return NextResponse.json({ household_id: householdId });
}

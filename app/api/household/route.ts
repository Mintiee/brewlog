/**
 * POST /api/household — called after picking an identity (no-auth test mode).
 * Body: { name?: string } — the display name (e.g. "Min-Taec" / "Kris").
 *
 * Everyone joins ONE shared household (fixed invite code) so Min-Taec and Kris
 * see the same shelf + brew log. The first caller creates and seeds it; the
 * rest join it. Reversible: when real auth returns, restore invite-code logic.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient as createServer } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { seedHousehold } from "@/lib/db/seed";

// Single shared household for the no-auth phase.
const SHARED_INVITE_CODE = "BREWMK";

export async function POST(req: NextRequest) {
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name: string =
    typeof body.name === "string" && body.name.trim() ? body.name.trim() : "You";

  const service = createServiceClient();

  // Find the shared household, or create + seed it (tolerating a creation race).
  let householdId: string;
  let justCreated = false;

  const { data: existing } = await service
    .from("households").select("id").eq("invite_code", SHARED_INVITE_CODE).maybeSingle();

  if (existing) {
    householdId = existing.id;
  } else {
    const { data: created, error } = await service
      .from("households").insert({ invite_code: SHARED_INVITE_CODE }).select("id").single();
    if (error) {
      // Likely a unique-violation race — another request created it first. Re-fetch.
      const { data: again } = await service
        .from("households").select("id").eq("invite_code", SHARED_INVITE_CODE).maybeSingle();
      if (!again) return NextResponse.json({ error: "Failed to create household" }, { status: 500 });
      householdId = again.id;
    } else {
      householdId = created.id;
      justCreated = true;
    }
  }

  // Create/refresh this user's profile in the shared household (idempotent).
  // Must exist before seeding, since seeded brews reference profiles via logged_by.
  await service.from("profiles").upsert({ id: user.id, household_id: householdId, name });

  // Seed demo data only for the first user who created the household.
  if (justCreated) {
    try { await seedHousehold(service, householdId, user.id); } catch { /* non-fatal */ }
  }

  return NextResponse.json({ household_id: householdId });
}

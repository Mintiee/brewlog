/**
 * Subscription + preference management for push nudges.
 *
 * GET    — current state for the signed-in person (prefs + the learned times).
 * POST   — upsert this browser's subscription, and refresh its IANA timezone.
 * PATCH  — flip a nudge preference.
 * DELETE — drop this browser's subscription.
 *
 * Everything is keyed by person_key (the normalised profile name), never by
 * profile id: anonymous re-logins mint duplicate same-name profiles, and a
 * subscription outlives them (see migration 022 and rateBelongsTo).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, parseJsonBody } from "@/lib/api/guards";
import { createClient } from "@/lib/supabase/server";
import { normName } from "@/lib/domain";
import { isValidTz, minutesToClock } from "@/lib/notify/tz";
import * as store from "@/lib/notify/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function me() {
  const guard = await requireUser();
  if (!guard.ok) return { ok: false as const, response: guard.response };

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, name, household_id")
    .eq("id", guard.value.id)
    .maybeSingle();

  if (!data) {
    return { ok: false as const, response: NextResponse.json({ error: "No profile" }, { status: 403 }) };
  }
  return { ok: true as const, profileId: data.id, householdId: data.household_id, personKey: normName(data.name) };
}

export async function GET() {
  const who = await me();
  if (!who.ok) return who.response;

  const people = await store.listNotifyPeople();
  const row = people.find((p) => p.household_id === who.householdId && p.person_key === who.personKey);
  const slots = store.slotsOf(row);

  return NextResponse.json({
    logNudge: row?.log_nudge ?? true,
    rateNudge: row?.rate_nudge ?? true,
    // null means "no pattern yet" — the engine invents no fallback time.
    morning: slots.morning.active && slots.morning.fireMin !== null ? minutesToClock(slots.morning.fireMin) : null,
    arvo: slots.arvo.active && slots.arvo.fireMin !== null ? minutesToClock(slots.arvo.fireMin) : null,
    vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
  });
}

export async function POST(req: NextRequest) {
  const who = await me();
  if (!who.ok) return who.response;

  const body = await parseJsonBody(req);
  if (!body.ok) return body.response;

  const { endpoint, p256dh, auth, tz } = body.value as Record<string, unknown>;
  if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string") {
    return NextResponse.json({ error: "Malformed subscription" }, { status: 400 });
  }
  // Validate on write: a garbage zone stored here would throw inside the cron
  // loop and take every other person's nudge down with it.
  const iana_tz = isValidTz(tz) ? tz : "Australia/Sydney";

  // push_subscriptions has a composite FK onto notify_person, so the person row
  // has to exist first.
  await store.ensureNotifyPerson(who.householdId, who.personKey);
  await store.upsertSubscription({
    endpoint, p256dh, auth, iana_tz,
    household_id: who.householdId,
    person_key: who.personKey,
    profile_id: who.profileId,
    ua: req.headers.get("user-agent")?.slice(0, 200) ?? null,
  });

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const who = await me();
  if (!who.ok) return who.response;

  const body = await parseJsonBody(req);
  if (!body.ok) return body.response;

  const prefs: { log_nudge?: boolean; rate_nudge?: boolean } = {};
  if (typeof body.value.logNudge === "boolean") prefs.log_nudge = body.value.logNudge;
  if (typeof body.value.rateNudge === "boolean") prefs.rate_nudge = body.value.rateNudge;
  if (Object.keys(prefs).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  await store.ensureNotifyPerson(who.householdId, who.personKey);
  await store.setNudgePrefs(who.householdId, who.personKey, prefs);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const who = await me();
  if (!who.ok) return who.response;

  const endpoint = req.nextUrl.searchParams.get("endpoint");
  if (!endpoint) return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });

  await store.removeSubscription(endpoint);
  return NextResponse.json({ ok: true });
}

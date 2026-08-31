/**
 * Service-role data access for the nudge engine.
 *
 * The generated `Database` type is produced from the live project
 * (`npm run gen:types`), so until migration 022 has been applied there these
 * tables don't exist in it. This module therefore declares its own row shapes
 * and talks to an untyped view of the same client — deliberately quarantined to
 * one file. Once 022 is live and types are regenerated, the cast can go.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";
import type { SlotName, PersonSlots } from "./schedule";
import { EMPTY_SLOT } from "./schedule";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(): SupabaseClient<any, "public", any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createServiceClient() as unknown as SupabaseClient<any, "public", any>;
}

export interface SubscriptionRow {
  endpoint: string;
  household_id: string;
  person_key: string;
  p256dh: string;
  auth: string;
  iana_tz: string;
}

export interface NotifyPersonRow {
  household_id: string;
  person_key: string;
  log_nudge: boolean;
  rate_nudge: boolean;
  morning_fire_min: number | null;
  arvo_fire_min: number | null;
  morning_active: boolean;
  arvo_active: boolean;
  morning_misses: number;
  arvo_misses: number;
  slots_computed_on: string | null;
}

export interface RateCandidate {
  id: string;
  household_id: string;
  started_at: string;
  created_at: string;
  logged_by: string;
  rate_for: string | null;
  /** Embedded to-one coffee. PostgREST returns an object, but some supabase-js
   *  versions surface a single-element array — normalised by coffeeOf(). */
  coffees: { name: string; roaster: string } | { name: string; roaster: string }[] | null;
}

/** The coffee behind a rate candidate, or null. */
export function coffeeOf(b: RateCandidate): { name: string; roaster: string } | null {
  const c = b.coffees;
  if (!c) return null;
  return Array.isArray(c) ? c[0] ?? null : c;
}

// ---------- reads ----------

export async function listSubscriptions(): Promise<SubscriptionRow[]> {
  const { data, error } = await db()
    .from("push_subscriptions")
    .select("endpoint, household_id, person_key, p256dh, auth, iana_tz")
    .order("last_seen_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SubscriptionRow[];
}

export async function listNotifyPeople(): Promise<NotifyPersonRow[]> {
  const { data, error } = await db().from("notify_person").select("*");
  if (error) throw error;
  return (data ?? []) as NotifyPersonRow[];
}

/** profile id → { name, household_id } for every profile in the given households. */
export async function profileNames(householdIds: string[]): Promise<Map<string, { name: string; household_id: string }>> {
  if (householdIds.length === 0) return new Map();
  const { data, error } = await db()
    .from("profiles")
    .select("id, name, household_id")
    .in("household_id", householdIds);
  if (error) throw error;
  const out = new Map<string, { name: string; household_id: string }>();
  for (const r of (data ?? []) as { id: string; name: string; household_id: string }[]) {
    out.set(r.id, { name: r.name, household_id: r.household_id });
  }
  return out;
}

/** Every non-guest brew in these households since `sinceIso`, for slot learning
 *  and for the "already logged in this window today" check. */
export async function brewTimes(householdIds: string[], sinceIso: string): Promise<{ started_at: string; logged_by: string; household_id: string }[]> {
  if (householdIds.length === 0) return [];
  const { data, error } = await db()
    .from("brews")
    .select("started_at, logged_by, household_id")
    .in("household_id", householdIds)
    .eq("guest", false)
    .gte("started_at", sinceIso);
  if (error) throw error;
  return (data ?? []) as { started_at: string; logged_by: string; household_id: string }[];
}

/**
 * Brews eligible for a rate nudge.
 *
 * `rated_at is null`, never `stars is null`: a brew deliberately resolved as
 * unrated has rated_at set with stars still null (see brewEditPatch in
 * lib/domain) and must not be dragged back into the queue.
 *
 * The cross-column "it arrived before its own nudge time" guard can't be
 * expressed in PostgREST, so it is applied in JS below — see rateGate().
 */
export async function rateCandidates(nowMs: number): Promise<RateCandidate[]> {
  const iso = (ms: number) => new Date(ms).toISOString();
  const { data, error } = await db()
    .from("brews")
    .select("id, household_id, started_at, created_at, logged_by, rate_for, coffees(name, roaster)")
    .is("rated_at", null)
    .is("rate_nudged_at", null)
    .eq("guest", false)
    .lte("started_at", iso(nowMs - RATE_DELAY_MS))
    .gte("started_at", iso(nowMs - RATE_MAX_AGE_MS))
    .gte("created_at", iso(nowMs - RATE_MAX_AGE_MS));
  if (error) throw error;
  return ((data ?? []) as unknown as RateCandidate[]).filter(rateGate);
}

/** Wait this long after the brew before asking — you've actually drunk it by then. */
export const RATE_DELAY_MS = 25 * 60_000;
/** Beyond this the moment has passed; the in-app pending badge takes over. */
export const RATE_MAX_AGE_MS = 3 * 60 * 60_000;
/** How late a row may reach the server relative to its own started_at. */
const ARRIVAL_GRACE_MS = 20 * 60_000;

/**
 * The offline-outbox guard.
 *
 * lib/store/outbox.ts replays a stored write verbatim, so a brew started at
 * 09:00 with no signal lands hours later still carrying started_at = 09:00.
 * `created_at` is server-authoritative (default now(), never emitted by
 * brewToRow/brewPatchToRow), so "it arrived before its own nudge time" cleanly
 * excludes late drains. Those brews still show in the in-app pending badge,
 * which is the honest outcome — what we must not do is push "rate your 09:00
 * brew?" at 3pm.
 */
export function rateGate(b: { started_at: string; created_at: string }): boolean {
  return Date.parse(b.created_at) <= Date.parse(b.started_at) + ARRIVAL_GRACE_MS;
}

export async function countRateNudges(householdId: string, personKey: string, localDay: string): Promise<number> {
  const { count, error } = await db()
    .from("notification_log")
    .select("id", { count: "exact", head: true })
    .eq("household_id", householdId)
    .eq("person_key", personKey)
    .eq("kind", "rate")
    .eq("local_day", localDay);
  if (error) throw error;
  return count ?? 0;
}

// ---------- claims ----------

/**
 * Claim a batch of rate nudges. The conditional update IS the lock: a
 * concurrent run sees zero rows for the same brew, so overlapping ticks need no
 * advisory lock. Only the returned ids may be pushed.
 */
export async function claimRateNudges(brewIds: string[]): Promise<Set<string>> {
  if (brewIds.length === 0) return new Set();
  const { data, error } = await db()
    .from("brews")
    .update({ rate_nudged_at: new Date().toISOString() })
    .in("id", brewIds)
    .is("rate_nudged_at", null)
    .select("id");
  if (error) throw error;
  return new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
}

export async function releaseRateNudge(brewId: string): Promise<void> {
  await db().from("brews").update({ rate_nudged_at: null }).eq("id", brewId);
}

/**
 * Claim a log nudge for (person, local day, slot). The unique index on
 * notification_log is the lock — no row returned means someone already claimed
 * it. Returns the claim id, or null.
 */
export async function claimLogNudge(
  householdId: string,
  personKey: string,
  localDay: string,
  slot: SlotName,
): Promise<number | null> {
  const { data, error } = await db()
    .from("notification_log")
    .upsert(
      { household_id: householdId, person_key: personKey, kind: "log", local_day: localDay, slot },
      { onConflict: "household_id,person_key,kind,local_day,slot", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw error;
  const rows = (data ?? []) as { id: number }[];
  return rows.length > 0 ? rows[0].id : null;
}

/** Best-effort ledger entry for a sent rate nudge — this is what the per-day
 *  rate cap counts. The authoritative claim is brews.rate_nudged_at. */
export async function logRateNudge(householdId: string, personKey: string, localDay: string, brewId: string): Promise<void> {
  await db()
    .from("notification_log")
    .upsert(
      { household_id: householdId, person_key: personKey, kind: "rate", local_day: localDay, slot: brewId },
      { onConflict: "household_id,person_key,kind,local_day,slot", ignoreDuplicates: true },
    );
}

export async function releaseClaim(id: number): Promise<void> {
  await db().from("notification_log").delete().eq("id", id);
}

// ---------- writes ----------

export async function deleteSubscriptions(endpoints: string[]): Promise<void> {
  if (endpoints.length === 0) return;
  await db().from("push_subscriptions").delete().in("endpoint", endpoints);
}

export async function saveSlots(
  householdId: string,
  personKey: string,
  slots: PersonSlots,
  computedOn: string,
): Promise<void> {
  const { error } = await db().from("notify_person").update({
    morning_fire_min: slots.morning.fireMin,
    morning_active: slots.morning.active,
    morning_misses: slots.morning.misses,
    arvo_fire_min: slots.arvo.fireMin,
    arvo_active: slots.arvo.active,
    arvo_misses: slots.arvo.misses,
    slots_computed_on: computedOn,
  }).eq("household_id", householdId).eq("person_key", personKey);
  if (error) throw error;
}

/** Create the notify_person row if it doesn't exist — push_subscriptions has a
 *  composite FK onto it, so this must happen before the first subscribe. */
export async function ensureNotifyPerson(householdId: string, personKey: string): Promise<void> {
  const { error } = await db()
    .from("notify_person")
    .upsert({ household_id: householdId, person_key: personKey }, { onConflict: "household_id,person_key", ignoreDuplicates: true });
  if (error) throw error;
}

export async function upsertSubscription(row: SubscriptionRow & { profile_id: string; ua: string | null }): Promise<void> {
  const { error } = await db().from("push_subscriptions").upsert(
    { ...row, last_seen_at: new Date().toISOString() },
    { onConflict: "endpoint" },
  );
  if (error) throw error;
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await db().from("push_subscriptions").delete().eq("endpoint", endpoint);
}

export async function setNudgePrefs(
  householdId: string,
  personKey: string,
  prefs: { log_nudge?: boolean; rate_nudge?: boolean },
): Promise<void> {
  const { error } = await db()
    .from("notify_person")
    .update(prefs)
    .eq("household_id", householdId)
    .eq("person_key", personKey);
  if (error) throw error;
}

/** Read one person's row, defaulting to an all-off state when absent. */
export function slotsOf(row: NotifyPersonRow | undefined): PersonSlots {
  if (!row) return { morning: EMPTY_SLOT, arvo: EMPTY_SLOT };
  return {
    morning: { fireMin: row.morning_fire_min, active: row.morning_active, misses: row.morning_misses },
    arvo: { fireMin: row.arvo_fire_min, active: row.arvo_active, misses: row.arvo_misses },
  };
}

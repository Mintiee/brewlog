/**
 * Typed Supabase data access — browser-side (uses anon key + RLS).
 * All queries are household-scoped; RLS enforces access.
 */
import { createClient } from "@/lib/supabase/browser";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Coffee, Brew, Config, Profile } from "@/lib/types";
import { coffeeColor } from "@/lib/flavour";
import { SEED_BREWERS } from "@/lib/domain/seed";

/**
 * Each read accepts an optional Supabase client. Pass a server client (from
 * lib/supabase/server) to prefetch during SSR; omit it on the client, where the
 * browser anon client is used. RLS scopes every query to the household either way.
 */
type DB = SupabaseClient;

// ---- Coffees ----

export async function fetchCoffees(client?: DB): Promise<Coffee[]> {
  const sb = client ?? createClient();
  const { data, error } = await sb.from("coffees").select("*").order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []).map(rowToCoffee);
}

export async function insertCoffee(coffee: Omit<Coffee, "id" | "household_id">): Promise<Coffee> {
  const sb = createClient();
  const { data, error } = await sb.from("coffees").insert(coffeeToRow(coffee)).select().single();
  if (error) throw error;
  return rowToCoffee(data);
}

export async function upsertCoffee(coffee: Coffee): Promise<Coffee> {
  const sb = createClient();
  const { data, error } = await sb.from("coffees").upsert(coffeeToRow(coffee)).select().single();
  if (error) throw error;
  return rowToCoffee(data);
}

// ---- Brews ----

export async function fetchBrews(client?: DB): Promise<Brew[]> {
  const sb = client ?? createClient();
  // Newest first, bounded so the payload doesn't grow without limit as history
  // accumulates. 2000 ≈ a couple of years of daily brewing; for true lifetime
  // history, paginate the journal + aggregate stats server-side.
  const { data, error } = await sb.from("brews").select("*").order("started_at", { ascending: false }).limit(2000);
  if (error) throw error;
  return (data ?? []).map(rowToBrew);
}

export async function insertBrew(brew: Brew): Promise<Brew> {
  const sb = createClient();
  const { data, error } = await sb.from("brews").insert(brewToRow(brew)).select().single();
  if (error) throw error;
  return rowToBrew(data);
}

export async function updateBrew(id: string, patch: Partial<Brew>): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("brews").update(brewToRow(patch as Brew)).eq("id", id);
  if (error) throw error;
}

export async function deleteBrew(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("brews").delete().eq("id", id);
  if (error) throw error;
}

// ---- Config ----

export async function fetchConfig(client?: DB): Promise<Config | null> {
  const sb = client ?? createClient();
  const { data, error } = await sb.from("config").select("*").single();
  if (error && error.code !== "PGRST116") throw error;
  return data ? rowToConfig(data) : null;
}

export async function upsertConfig(config: Config, householdId: string): Promise<void> {
  const sb = createClient();
  const row = {
    household_id: householdId,
    grinder: config.grinder,
    brewers: config.brewers,
    waters: config.waters,
    default_water: config.default_water,
    taster2: config.taster2,
    random_greeting: config.random_greeting,
    rest_days: config.rest_days,
    peak_days: config.peak_days,
    serving_grams: config.serving_grams,
  };
  const { error } = await sb.from("config").upsert(row);
  if (error) throw error;
}

// ---- Profile + Household ----

export async function fetchProfile(userId: string, client?: DB): Promise<Profile | null> {
  // userId is passed in (from the caller's already-resolved session) so this no
  // longer makes its own getUser() round-trip.
  const sb = client ?? createClient();
  const { data, error } = await sb.from("profiles").select("*").eq("id", userId).single();
  if (error) return null;
  return { id: data.id, household_id: data.household_id, name: data.name };
}

/** All profiles in the caller's household (RLS scopes this to their household).
 *  Used to resolve the other member as a "send to rate" target and to label
 *  who a handed-off brew came from. */
export async function fetchHouseholdProfiles(client?: DB): Promise<Profile[]> {
  const sb = client ?? createClient();
  const { data, error } = await sb.from("profiles").select("*");
  if (error) return [];
  return (data ?? []).map((r: { id: string; household_id: string; name: string }) => ({
    id: r.id, household_id: r.household_id, name: r.name,
  }));
}

export async function updateProfileName(id: string, name: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("profiles").update({ name }).eq("id", id);
  if (error) throw error;
}

// ---- Learned notes ----

export async function fetchLearnedNotes(client?: DB): Promise<Record<string, string>> {
  const sb = client ?? createClient();
  const { data } = await sb.from("learned_notes").select("note,family");
  const map: Record<string, string> = {};
  (data ?? []).forEach((r: { note: string; family: string }) => { map[r.note] = r.family; });
  return map;
}

// ---- AI key status (read-only from client — never returns the key itself) ----

export async function fetchAiKeyStatus(client?: DB): Promise<{ set: boolean; provider?: string } | null> {
  const sb = client ?? createClient();
  const { data, error } = await sb.from("household_ai").select("provider").single();
  if (error && error.code !== "PGRST116") throw error;
  if (!data) return { set: false };
  return { set: true, provider: data.provider };
}

// ---- Row mappers ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToCoffee(r: any): Coffee {
  return {
    id: r.id,
    household_id: r.household_id,
    roaster: r.roaster,
    name: r.name,
    origin: r.origin,
    region: r.region,
    varietal: r.varietal,
    process: r.process,
    roast: r.roast,
    roasted_at: r.roasted_at,
    rest_days: r.rest_days,
    peak_days: r.peak_days,
    grams: Number(r.grams),          // numeric in DB; coerce in case PostgREST returns a string
    frozen_grams: Number(r.frozen_grams),
    frozen_at: r.frozen_at ?? null,
    thawed_at: r.thawed_at ?? null,
    archived: r.archived,
    notes: r.notes ?? [],
    color: coffeeColor(r.notes ?? []), // derived on read — always reflects current notes
    cc: r.cc,
  };
}

function coffeeToRow(c: Partial<Coffee>) {
  return {
    ...(c.id ? { id: c.id } : {}),
    ...(c.household_id ? { household_id: c.household_id } : {}),
    roaster: c.roaster, name: c.name, origin: c.origin, region: c.region,
    varietal: c.varietal, process: c.process, roast: c.roast, roasted_at: c.roasted_at,
    rest_days: c.rest_days, peak_days: c.peak_days, grams: c.grams,
    frozen_grams: c.frozen_grams, frozen_at: c.frozen_at ?? null, thawed_at: c.thawed_at ?? null,
    archived: c.archived, notes: c.notes,
    color: c.notes ? coffeeColor(c.notes) : c.color, // keep column non-null; no longer authoritative
    cc: c.cc,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToBrew(r: any): Brew {
  return {
    id: r.id,
    household_id: r.household_id,
    coffee_id: r.coffee_id,
    brewer_id: r.brewer_id,
    dose: r.dose, water: r.water, bypass: r.bypass, temp: r.temp,
    grind: r.grind, ratio: r.ratio, water_type: r.water_type,
    started_at: new Date(r.started_at).getTime().toString(),
    rest_days: r.rest_days ?? null,
    rated_at: r.rated_at ? new Date(r.rated_at).getTime().toString() : null,
    logged_by: r.logged_by,
    pending: r.rated_at == null,
    rate_for: r.rate_for ?? null,
    stars: r.stars, stars2: r.stars2,
    taster1: r.taster1, taster2: r.taster2,
    acidity: r.acidity, sweetness: r.sweetness, body: r.body, clarity: r.clarity,
    note: r.note,
    session_id: r.session_id ?? null,
  };
}

function brewToRow(b: Partial<Brew>) {
  return {
    ...(b.id ? { id: b.id } : {}),
    // Supply household_id / logged_by explicitly — do not rely on DB defaults
    // (migration 002 defaults are belt-and-braces; the client must send these).
    ...(b.household_id ? { household_id: b.household_id } : {}),
    ...(b.logged_by ? { logged_by: b.logged_by } : {}),
    coffee_id: b.coffee_id,
    brewer_id: b.brewer_id,
    dose: b.dose, water: b.water, bypass: b.bypass, temp: b.temp,
    grind: b.grind, ratio: b.ratio, water_type: b.water_type,
    started_at: b.started_at ? new Date(parseInt(b.started_at)).toISOString() : undefined,
    // Only write rest_days when present — keep rating-only patch updates from nulling it.
    ...(b.rest_days !== undefined ? { rest_days: b.rest_days } : {}),
    // Only write rate_for when present in the patch, so unrelated updates don't
    // null it; an explicit null (cleared on rate) still writes through.
    ...(b.rate_for !== undefined ? { rate_for: b.rate_for } : {}),
    // Only write session_id when present — rating-only patches must not clobber it.
    ...(b.session_id !== undefined ? { session_id: b.session_id } : {}),
    rated_at: b.rated_at ? new Date(parseInt(b.rated_at)).toISOString() : null,
    stars: b.stars, stars2: b.stars2,
    taster1: b.taster1, taster2: b.taster2,
    // 0 means "not set" from the UI — send null so the check (x between 1 and 5) passes
    acidity: b.acidity || null, sweetness: b.sweetness || null,
    body: b.body || null, clarity: b.clarity || null,
    note: b.note,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToConfig(r: any): Config {
  const rawBrewers = Array.isArray(r.brewers) && r.brewers.length ? r.brewers : SEED_BREWERS;
  // Backfill `water` (default water out, mL) for brewers stored before this field existed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const brewers = rawBrewers.map((b: any) => ({
    ...b,
    water: b.water ?? Math.round(b.dose * (b.ratio ?? 16)),
  }));
  // Backfill grind range/step defaults for grinders stored before these fields existed
  const grinder = {
    name: "Comandante C40", unit: "clicks", grind_min: 0, grind_max: 50, grind_step: 1,
    ...(r.grinder ?? {}),
  };
  return {
    grinder,
    brewers,
    waters: r.waters ?? ["Third Wave", "Filtered", "Volvic", "Tap"],
    default_water: r.default_water ?? "Third Wave",
    taster2: r.taster2 ?? "Kris",
    random_greeting: r.random_greeting !== false,
    rest_days: r.rest_days ?? 28,
    peak_days: r.peak_days ?? 56,
    serving_grams: r.serving_grams != null ? Number(r.serving_grams) : 12.5,
  };
}

/**
 * Typed Supabase data access — browser-side (uses anon key + RLS).
 * All queries are household-scoped; RLS enforces access.
 */
import { createClient } from "@/lib/supabase/browser";
import type { Coffee, Brew, Config, Profile } from "@/lib/types";
import { SEED_BREWERS } from "@/lib/domain/seed";

// ---- Coffees ----

export async function fetchCoffees(): Promise<Coffee[]> {
  const sb = createClient();
  const { data, error } = await sb.from("coffees").select("*").order("created_at", { ascending: false });
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

export async function fetchBrews(): Promise<Brew[]> {
  const sb = createClient();
  // Last 90 days
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  const { data, error } = await sb.from("brews").select("*").gte("started_at", since).order("started_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToBrew);
}

export async function insertBrew(brew: Omit<Brew, "id">): Promise<Brew> {
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

export async function fetchConfig(): Promise<Config | null> {
  const sb = createClient();
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
  };
  const { error } = await sb.from("config").upsert(row);
  if (error) throw error;
}

// ---- Profile + Household ----

export async function fetchProfile(): Promise<Profile | null> {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data, error } = await sb.from("profiles").select("*").eq("id", user.id).single();
  if (error) return null;
  return { id: data.id, household_id: data.household_id, name: data.name };
}

export async function updateProfileName(id: string, name: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("profiles").update({ name }).eq("id", id);
  if (error) throw error;
}

// ---- Learned notes ----

export async function fetchLearnedNotes(): Promise<Record<string, string>> {
  const sb = createClient();
  const { data } = await sb.from("learned_notes").select("note,family");
  const map: Record<string, string> = {};
  (data ?? []).forEach((r: { note: string; family: string }) => { map[r.note] = r.family; });
  return map;
}

// ---- AI key status (read-only from client — never returns the key itself) ----

export async function fetchAiKeyStatus(): Promise<{ set: boolean; provider?: string } | null> {
  const sb = createClient();
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
    grams: r.grams,
    frozen_grams: r.frozen_grams,
    archived: r.archived,
    notes: r.notes ?? [],
    color: r.color,
    cc: r.cc,
  };
}

function coffeeToRow(c: Partial<Coffee>) {
  return {
    roaster: c.roaster, name: c.name, origin: c.origin, region: c.region,
    varietal: c.varietal, process: c.process, roast: c.roast, roasted_at: c.roasted_at,
    rest_days: c.rest_days, peak_days: c.peak_days, grams: c.grams,
    frozen_grams: c.frozen_grams, archived: c.archived, notes: c.notes, color: c.color, cc: c.cc,
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
    rated_at: r.rated_at ? new Date(r.rated_at).getTime().toString() : null,
    logged_by: r.logged_by,
    pending: r.rated_at == null,
    stars: r.stars, stars2: r.stars2,
    taster1: r.taster1, taster2: r.taster2,
    acidity: r.acidity, sweetness: r.sweetness, body: r.body, clarity: r.clarity,
    note: r.note,
  };
}

function brewToRow(b: Partial<Brew>) {
  return {
    coffee_id: b.coffee_id,
    brewer_id: b.brewer_id,
    dose: b.dose, water: b.water, bypass: b.bypass, temp: b.temp,
    grind: b.grind, ratio: b.ratio, water_type: b.water_type,
    started_at: b.started_at ? new Date(parseInt(b.started_at)).toISOString() : undefined,
    rated_at: b.rated_at ? new Date(parseInt(b.rated_at)).toISOString() : null,
    logged_by: b.logged_by,
    stars: b.stars, stars2: b.stars2,
    taster1: b.taster1, taster2: b.taster2,
    acidity: b.acidity, sweetness: b.sweetness, body: b.body, clarity: b.clarity,
    note: b.note,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToConfig(r: any): Config {
  const brewers = Array.isArray(r.brewers) && r.brewers.length ? r.brewers : SEED_BREWERS;
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
  };
}

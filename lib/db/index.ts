/**
 * Typed Supabase data access — browser-side (uses anon key + RLS).
 * All queries are household-scoped; RLS enforces access.
 */
import { createClient } from "@/lib/supabase/browser";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Coffee, Brew, Config, Profile } from "@/lib/types";
import { rowToCoffee, coffeeToRow, rowToBrew, brewToRow, brewPatchToRow, rowToConfig } from "./mappers";

export * from "./mappers";

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
  const { error } = await sb.from("brews").update(brewPatchToRow(patch)).eq("id", id);
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
    // Grinder/Brewer interfaces lack Json's index signature; structurally they
    // are plain JSON objects, so the cast is safe.
    grinder: config.grinder as unknown as import("./database.types").Json,
    brewers: config.brewers as unknown as import("./database.types").Json,
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

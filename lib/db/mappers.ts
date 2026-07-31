/**
 * Row mappers — domain types ↔ Supabase rows. Pure functions, no client import,
 * so they're unit-testable without Supabase.
 */
import type { Coffee, Brew, Config, SavedRecipe, RoasterWindow } from "@/lib/types";
import type { Tables, TablesInsert } from "./database.types";
import { SEED_BREWERS } from "@/lib/domain/seed";
import { parseVarietals } from "@/lib/varietal";

export function rowToCoffee(r: Tables<"coffees">): Coffee {
  return {
    id: r.id,
    household_id: r.household_id,
    roaster: r.roaster,
    name: r.name,
    origin: r.origin,
    region: r.region,
    // Gap rows written by pre-019 code have varietals='{}' but a legacy string —
    // parse it so nothing disappears between the migration and the deploy.
    varietals: r.varietals?.length ? r.varietals : parseVarietals(r.varietal ?? ""),
    process: r.process,
    roast: r.roast as Coffee["roast"],
    roasted_at: r.roasted_at,
    rest_days: r.rest_days,
    peak_days: r.peak_days,
    grams: Number(r.grams),          // numeric in DB; coerce in case PostgREST returns a string
    frozen_grams: Number(r.frozen_grams),
    frozen_at: r.frozen_at ?? null,
    thawed_at: r.thawed_at ?? null,
    archived: r.archived,
    notes: r.notes ?? [],
    // No `color` — coffee colours are derived from notes at render time
    // (see useCoffeeColor). Baking it here froze SSR/stale colours.
    cc: r.cc,
  };
}

export function coffeeToRow(c: Omit<Coffee, "id"> & { id?: string }): TablesInsert<"coffees"> {
  return {
    ...(c.id ? { id: c.id } : {}),
    ...(c.household_id ? { household_id: c.household_id } : {}),
    roaster: c.roaster, name: c.name, origin: c.origin, region: c.region,
    // Dual-write: varietals is the source of truth; the legacy varietal string is
    // kept in sync so a code rollback (pre-array build) still shows varietals.
    varietals: c.varietals, varietal: c.varietals.join(" · "),
    process: c.process, roast: c.roast, roasted_at: c.roasted_at,
    rest_days: c.rest_days, peak_days: c.peak_days, grams: c.grams,
    frozen_grams: c.frozen_grams, frozen_at: c.frozen_at ?? null, thawed_at: c.thawed_at ?? null,
    archived: c.archived, notes: c.notes,
    // `color` column intentionally omitted — it has a DB default and nothing
    // reads it any more (colours are render-derived). Left vestigial; no migration.
    cc: c.cc,
  };
}

export function rowToBrew(r: Tables<"brews">): Brew {
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
    guest: r.guest ?? false,
    stars: r.stars, stars2: r.stars2,
    taster1: r.taster1, taster2: r.taster2,
    acidity: r.acidity, sweetness: r.sweetness, body: r.body, clarity: r.clarity,
    note: r.note,
    session_id: r.session_id ?? null,
  };
}

/** Full-row mapping for inserts — every column is emitted. Do NOT use for
 *  partial updates: absent rating fields would null their columns (this was
 *  the "brews resurrect as pending / scores vanish" bug). */
export function brewToRow(b: Brew): TablesInsert<"brews"> {
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
    rest_days: b.rest_days ?? null,
    rate_for: b.rate_for ?? null,
    session_id: b.session_id ?? null,
    guest: b.guest,
    rated_at: b.rated_at ? new Date(parseInt(b.rated_at)).toISOString() : null,
    stars: b.stars, stars2: b.stars2,
    taster1: b.taster1, taster2: b.taster2,
    // 0 means "not set" from the UI — send null so the check (x between 1 and 5) passes
    acidity: b.acidity || null, sweetness: b.sweetness || null,
    body: b.body || null, clarity: b.clarity || null,
    note: b.note,
  };
}

/** Patch-aware row mapping for updates — emits ONLY columns whose keys are
 *  present in the patch, so an edit that doesn't mention a field can never
 *  clobber it. `pending` (derived from rated_at) and `id` are never emitted. */
export function brewPatchToRow(patch: Partial<Brew>): Partial<TablesInsert<"brews">> {
  const row: Record<string, unknown> = {};
  const passthrough = [
    "coffee_id", "brewer_id", "dose", "water", "bypass", "temp", "grind",
    "ratio", "water_type", "rest_days", "rate_for", "session_id", "guest",
    "stars", "stars2", "taster1", "taster2", "note",
  ] as const;
  for (const k of passthrough) if (k in patch) row[k] = patch[k];
  // Identity columns: only when truthy — never null these out via a patch.
  if (patch.household_id) row.household_id = patch.household_id;
  if (patch.logged_by) row.logged_by = patch.logged_by;
  // Timestamps: ms-string in the domain, ISO in the DB.
  if ("started_at" in patch && patch.started_at) {
    row.started_at = new Date(parseInt(patch.started_at)).toISOString();
  }
  if ("rated_at" in patch) {
    row.rated_at = patch.rated_at ? new Date(parseInt(patch.rated_at)).toISOString() : null;
  }
  // Scales: 0 means "not set" from the UI — store null so the 1–5 check passes.
  for (const k of ["acidity", "sweetness", "body", "clarity"] as const) {
    if (k in patch) row[k] = patch[k] || null;
  }
  return row as Partial<TablesInsert<"brews">>;
}

export function rowToSavedRecipe(r: Tables<"recipes">): SavedRecipe {
  return {
    id: r.id,
    household_id: r.household_id,
    name: r.name,
    dose: Number(r.dose),          // numeric in DB; coerce in case PostgREST returns a string
    water: Number(r.water),
    bypass: Number(r.bypass),
    temp: Number(r.temp),
    grind: Number(r.grind),
    ratio: Number(r.ratio),
    water_type: r.water_type,
    brewer_id: r.brewer_id ?? null,
    created_at: r.created_at,
  };
}

export function savedRecipeToRow(rec: Omit<SavedRecipe, "id"> & { id?: string }): TablesInsert<"recipes"> {
  return {
    ...(rec.id ? { id: rec.id } : {}),
    ...(rec.household_id ? { household_id: rec.household_id } : {}),
    name: rec.name,
    dose: rec.dose, water: rec.water, bypass: rec.bypass, temp: rec.temp,
    grind: rec.grind, ratio: rec.ratio, water_type: rec.water_type,
    brewer_id: rec.brewer_id ?? null,
  };
}

/**
 * Coerce the roaster_rest jsonb blob (migration 020) into the domain shape,
 * dropping anything malformed rather than letting it reach the freshness maths —
 * a NaN window would silently turn every coffee from that roaster into "Ready in
 * NaNd". Same defensive spirit as the grinder coercion below.
 *
 * Entries are kept only with a non-empty key and finite positive day counts;
 * peak is floored at rest + 1 to preserve statusFrom's invariant. `name` falls
 * back to the key so a hand-edited row still renders in Settings.
 */
function parseRoasterRest(raw: Tables<"config">["roaster_rest"]): Record<string, RoasterWindow> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, RoasterWindow> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!key.trim()) continue;
    if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
    const v = value as Record<string, unknown>;
    const rest = Number(v.rest_days);
    const peak = Number(v.peak_days);
    if (!Number.isFinite(rest) || rest <= 0) continue;
    if (!Number.isFinite(peak) || peak <= 0) continue;
    out[key] = {
      name: typeof v.name === "string" && v.name.trim() ? v.name : key,
      rest_days: Math.round(rest),
      peak_days: Math.max(Math.round(peak), Math.round(rest) + 1),
    };
  }
  return out;
}

export function rowToConfig(r: Tables<"config">): Config {
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
    ...((typeof r.grinder === "object" && !Array.isArray(r.grinder) ? r.grinder : {}) ?? {}),
  } as Config["grinder"];
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
    roaster_rest: parseRoasterRest(r.roaster_rest),
  };
}

// Core domain types for Brew

// Free text — common processes (Washed/Natural) are quick-picks in the UI, but
// any string is allowed (Honey, Anaerobic, Carbonic Maceration, experimental…).
export type Process = string;
export type Roast = "light" | "medium-light" | "medium" | "medium-dark" | "dark";
export type FreshState = "resting" | "peak" | "past" | "frozen";

export interface Coffee {
  id: string;
  household_id?: string;
  roaster: string;
  name: string;
  origin: string;
  region: string;
  /** Varietals as printed on the bag, one tag each ("SL28", "Heirloom"). Proportions
   *  are unknown, so stats group mixes via varietalGroup() rather than splitting. */
  varietals: string[];
  process: Process;
  roast: Roast;
  /** ISO date string e.g. "2025-05-01" — roastedDaysAgo is derived */
  roasted_at: string;
  rest_days: number;  // default 28
  peak_days: number;  // default 56
  grams: number;
  frozen_grams: number;
  /** ISO date beans went into the freezer (aging pauses while frozen). null = never frozen. */
  frozen_at: string | null;
  /** ISO date beans came back out (aging resumes). null = still frozen or never frozen. */
  thawed_at: string | null;
  archived: boolean;
  notes: string[];
  // No `color` field — a coffee's colour is derived from its notes at render time
  // via useCoffeeColor(); storing it froze stale/SSR colours (see C2).
  cc: string | null;   // ISO-2 country code for silhouette
}

export interface Brew {
  id: string;
  household_id?: string;
  coffee_id: string;
  brewer_id: string;
  dose: number;
  water: number;
  bypass: number;
  temp: number;
  grind: number;
  ratio: number;
  water_type: string;
  started_at: string;    // epoch ms as string (from DB) or ms number
  /** Freeze-adjusted days the beans had rested when this brew was pulled (snapshot). */
  rest_days: number | null;
  rated_at: string | null;
  logged_by: string;     // profile id
  pending: boolean;
  /** When set, this brew was handed off to that profile to rate — it leaves the
   *  sender's pending list and shows only for the target. null = shared pending. */
  rate_for: string | null;
  /** Links the two rows of a split (double) brew — one physical cup split between
   *  two drinkers. Each row is rated independently via the normal flow. null = single brew. */
  session_id: string | null;
  /** This cup was made for a guest — never enters the rating queue, excluded from palate
   *  stats, but still draws down bean inventory on the shelf. */
  guest: boolean;
  // rating fields (null until rated)
  stars: number | null;
  stars2: number | null;
  taster1: string | null;
  taster2: string | null;
  acidity: number | null;
  sweetness: number | null;
  body: number | null;
  clarity: number | null;
  note: string | null;
}

export interface Brewer {
  id: string;
  name: string;
  short: string;
  // Recipe fields below are the brewer's *seed* — captured once when the brewer is added,
  // and used only as the cold-start default until the first brew on this brewer exists.
  // After that, each brew remembers its own parameters (see StepHow's fallback chain).
  dose: number;
  water?: number;  // seed water out (mL); backfilled from dose×ratio for legacy brewers
  ratio: number;   // legacy / derived (water ÷ dose); kept for back-compat
  temp: number;
  grind: number;   // seed grind size (within the grinder's range)
  pours: number;
  bypass: boolean;
}

export interface Grinder {
  name: string;
  unit: string;
  grind_min: number;   // minimum grind setting (e.g. 0 for a ZP6)
  grind_max: number;   // maximum grind setting (e.g. 10)
  grind_step: number;  // increment per tap (e.g. 0.1)
}

/** A roaster's own freshness window, overriding the household defaults for every
 *  coffee from that roaster. Stored in Config.roaster_rest keyed by
 *  roasterKey(name) (lib/domain), so spelling variants share one entry. */
export interface RoasterWindow {
  name: string;        // display spelling captured when the override was set
  rest_days: number;   // this roaster's "ready from" day
  peak_days: number;   // this roaster's "best until" day
}

export interface Config {
  grinder: Grinder;
  brewers: Brewer[];
  waters: string[];
  default_water: string;
  taster2: string;
  random_greeting: boolean;
  rest_days: number;       // default "ready from" day (resting ends, drink window opens)
  peak_days: number;       // default "best until" day (drink window closes)
  serving_grams: number;   // grams of coffee per cup/serve (for "serves left")
  /** Per-roaster overrides of the two windows above, keyed by roasterKey(name).
   *  A coffee whose roaster has no entry uses rest_days/peak_days. */
  roaster_rest: Record<string, RoasterWindow>;
}

export interface Profile {
  id: string;
  household_id: string;
  name: string;
}

export interface Household {
  id: string;
  invite_code: string;
}

export interface FreshStatus {
  state: FreshState;
  label: string;
  day: number;   // days since roast
  ready: boolean;
  pct: number;
  restLeft?: number;
}

export interface Recipe {
  dose: number;
  water: number;
  bypass: number;
  temp: number;
  grind: number;
  ratio: number;
  water_type: string;
}

/** A named, persisted recipe in the household library — distinct from the
 *  transient `Recipe` shape above (which is the working recipe inside the brew
 *  flow). Saved recipes are shown as chips in StepHow and managed in Settings. */
export interface SavedRecipe {
  id: string;
  household_id?: string;
  name: string;
  dose: number;
  water: number;
  bypass: number;
  temp: number;
  grind: number;
  ratio: number;
  water_type: string;
  /** Configured brewer this recipe was saved on, if any — applied on tap. */
  brewer_id: string | null;
  created_at?: string;
}

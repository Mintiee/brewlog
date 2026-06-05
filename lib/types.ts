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
  varietal: string;
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
  color: string;       // dominant-family hex
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

export interface Config {
  grinder: Grinder;
  brewers: Brewer[];
  waters: string[];
  default_water: string;
  taster2: string;
  random_greeting: boolean;
  rest_days: number;       // global "ready from" day (resting ends, drink window opens)
  peak_days: number;       // global "best until" day (drink window closes)
  serving_grams: number;   // grams of coffee per cup/serve (for "serves left")
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

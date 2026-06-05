/**
 * Seed data — mirrors the prototype's COFFEES/BREWERS/BREWS/WATERS/GRINDER.
 * Timestamps are anchored to "now - daysAgo" at start-of-day so freshness
 * labels reproduce correctly regardless of when the app is loaded.
 */
import type { Coffee, Brew, Brewer, Config } from "@/lib/types";
import { defaultsFor, restDaysAt } from "@/lib/domain";

function daysAgoDate(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  // Format in local time to avoid UTC timezone drift
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysAgoMs(n: number): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.getTime();
}

export const SEED_BREWERS: Brewer[] = [
  { id: "v60",     name: "Hario V60",        short: "V60",     dose: 15, water: 240, ratio: 16.0, temp: 96, grind: 5, pours: 4, bypass: false },
  { id: "origami", name: "Origami Air",       short: "Origami", dose: 15, water: 250, ratio: 16.7, temp: 94, grind: 5, pours: 3, bypass: false },
  { id: "kalita",  name: "Kalita Wave 155",   short: "Kalita",  dose: 17, water: 255, ratio: 15.0, temp: 93, grind: 5, pours: 4, bypass: false },
  { id: "oxo",     name: "OXO Rapid Brewer",  short: "OXO",     dose: 22, water: 363, ratio: 16.5, temp: 94, grind: 5, pours: 1, bypass: true },
];

export const SEED_COFFEES: Coffee[] = [
  {
    id: "sey-hamasho", household_id: "seed", roaster: "Sey", name: "Hamasho",
    origin: "Ethiopia", region: "Sidama, Bensa", varietal: "Heirloom", process: "Washed",
    roast: "light", roasted_at: daysAgoDate(34), rest_days: 28, peak_days: 56,
    grams: 250, frozen_grams: 0, frozen_at: null, thawed_at: null, archived: false,
    notes: ["Jasmine", "Bergamot", "White peach"], color: "#d98fb0", cc: "et",
  },
  {
    id: "onyx-geo", household_id: "seed", roaster: "Onyx", name: "Geometry",
    origin: "Blend", region: "Colombia · Ethiopia", varietal: "Caturra · Heirloom", process: "Washed",
    roast: "medium-light", roasted_at: daysAgoDate(30), rest_days: 28, peak_days: 56,
    grams: 340, frozen_grams: 0, frozen_at: null, thawed_at: null, archived: false,
    notes: ["Milk chocolate", "Cherry", "Almond"], color: "#b07d52", cc: "co",
  },
  {
    id: "bw-guji", household_id: "seed", roaster: "Black & White", name: "Ethiopia Guji",
    origin: "Ethiopia", region: "Guji, Hambela", varietal: "Heirloom", process: "Natural",
    roast: "light", roasted_at: daysAgoDate(45), rest_days: 28, peak_days: 56,
    grams: 340, frozen_grams: 0, frozen_at: null, thawed_at: null, archived: false,
    notes: ["Blueberry", "Cocoa", "Wine"], color: "#a886c4", cc: "et",
  },
  {
    id: "tw-desarrollo", household_id: "seed", roaster: "Tim Wendelboe", name: "El Desarrollo · Lot 14",
    origin: "Colombia", region: "Cundinamarca", varietal: "Castillo", process: "Washed",
    roast: "light", roasted_at: daysAgoDate(18), rest_days: 28, peak_days: 56,
    grams: 250, frozen_grams: 0, frozen_at: null, thawed_at: null, archived: false,
    notes: ["Red apple", "Caramel", "Black tea"], color: "#d97a6a", cc: "co",
  },
  {
    id: "hydrangea-gesha", household_id: "seed", roaster: "Hydrangea", name: "Hacienda La Esmeralda",
    origin: "Panama", region: "Boquete", varietal: "Gesha", process: "Washed",
    roast: "light", roasted_at: daysAgoDate(14), rest_days: 28, peak_days: 56,
    grams: 100, frozen_grams: 100, frozen_at: daysAgoDate(4), thawed_at: null, archived: false,
    notes: ["Jasmine", "Bergamot", "Honeysuckle"], color: "#d98fb0", cc: "pa",
  },
  {
    id: "heart-brisas", household_id: "seed", roaster: "Heart", name: "Las Brisas",
    origin: "Costa Rica", region: "Tarrazú", varietal: "Caturra", process: "Honey",
    roast: "medium", roasted_at: daysAgoDate(60), rest_days: 28, peak_days: 56,
    grams: 340, frozen_grams: 0, frozen_at: null, thawed_at: null, archived: false,
    notes: ["Brown sugar", "Plum", "Walnut"], color: "#e0a55f", cc: "cr",
  },
];

function brewerById(id: string) { return SEED_BREWERS.find((b) => b.id === id)!; }
function coffeeById(id: string) { return SEED_COFFEES.find((c) => c.id === id)!; }
function to5(v: number) { return Math.max(1, Math.min(5, Math.round(v / 20))); }

const seedRows: [number, string, string, number, number, number, number, string][] = [
  [0,  "sey-hamasho",  "v60",     5, 78, 64, 40, "Bergamot really popped. Best yet."],
  [1,  "onyx-geo",     "origami", 4, 55, 70, 58, "Rounder, chocolatey. Easy drinker."],
  [1,  "sey-hamasho",  "kalita",  3, 60, 55, 62, "Muted vs V60 — too heavy."],
  [2,  "bw-guji",      "v60",     4, 50, 72, 66, "Blueberry jammy, a touch over."],
  [3,  "sey-hamasho",  "v60",     5, 80, 60, 42, ""],
  [4,  "onyx-geo",     "v60",     4, 62, 66, 52, "Cherry brighter on V60."],
  [5,  "bw-guji",      "origami", 3, 48, 64, 60, ""],
  [6,  "sey-hamasho",  "origami", 4, 72, 62, 48, "Floral, slightly less clarity."],
  [7,  "heart-brisas", "kalita",  3, 40, 68, 70, "Brown sugar, heavy body."],
  [8,  "onyx-geo",     "kalita",  4, 52, 74, 64, "Syrupy & sweet."],
  [9,  "sey-hamasho",  "v60",     5, 79, 63, 41, "Dialed. 22 clicks, 96°."],
  [10, "bw-guji",      "v60",     4, 53, 70, 64, ""],
  [11, "heart-brisas", "origami", 2, 38, 60, 66, "Flat. Past its best."],
  [12, "onyx-geo",     "v60",     4, 60, 68, 54, ""],
  [13, "sey-hamasho",  "origami", 4, 74, 61, 47, ""],
  [14, "bw-guji",      "kalita",  3, 46, 66, 68, "Wanted more acidity."],
  [16, "sey-hamasho",  "v60",     5, 81, 62, 40, "Coarser 23 clicks — cleaner."],
  [18, "onyx-geo",     "origami", 4, 56, 71, 57, ""],
  [20, "heart-brisas", "kalita",  3, 41, 69, 71, ""],
];

const WATERS = ["Third Wave", "Filtered", "Volvic", "Tap"];

export const SEED_BREWS: Brew[] = seedRows.map(([daysAgo, cid, bid, stars, acidity, sweetness, body, note], i) => {
  const coffee = coffeeById(cid);
  const brewer = brewerById(bid);
  const def = defaultsFor(coffee, brewer);
  const startMs = daysAgoMs(daysAgo as number);
  return {
    id: `b${i}`,
    household_id: "seed",
    coffee_id: cid,
    brewer_id: bid,
    dose: def.dose,
    water: def.water,
    bypass: def.bypass,
    temp: def.temp,
    grind: brewer.grind + (cid === "sey-hamasho" ? 1 : 0),
    ratio: def.ratio,
    water_type: WATERS[i % 2],
    started_at: String(startMs),
    rest_days: restDaysAt(coffee, startMs),
    rated_at: String(startMs + 3600000),
    logged_by: "me",
    pending: false,
    rate_for: null,
    stars,
    stars2: null,
    taster1: "You",
    taster2: null,
    acidity: to5(acidity as number),
    sweetness: to5(sweetness as number),
    body: to5(body as number),
    clarity: Math.max(1, Math.min(5, stars as number)),
    note: note as string || null,
  };
});

export const SEED_CONFIG: Config = {
  grinder: { name: "Comandante C40", unit: "clicks", grind_min: 0, grind_max: 50, grind_step: 1 },
  brewers: SEED_BREWERS,
  waters: WATERS,
  default_water: "Third Wave",
  taster2: "Kris",
  random_greeting: true,
  rest_days: 28,
  peak_days: 56,
  serving_grams: 12.5,
};

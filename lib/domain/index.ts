import type { Coffee, Brew, Brewer, FreshStatus, Recipe } from "@/lib/types";

// ---------- Household-wide settings (set from config on load) ----------
// Mirrors the lib/flavour setLearnedNotes pattern: a module-level value the
// pure domain helpers read, so we don't thread config through every call site.

let restWindow = 28;        // days before a coffee is "ready" (global, all coffees)
const peakWindow = 56;      // days until past-peak
let servingGrams = 12.5;

export function setRestWindow(days: number) {
  if (Number.isFinite(days) && days > 0) restWindow = days;
}
export function setServingGrams(grams: number) {
  if (Number.isFinite(grams) && grams > 0) servingGrams = grams;
}
export function getRestWindow() { return restWindow; }
export function getPeakWindow() { return peakWindow; }

// ---------- Freshness ----------

function parseLocalDate(iso: string): Date {
  // Parse "YYYY-MM-DD" as local midnight (not UTC) to avoid ±1 day timezone drift
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function parseTs(ts: string | number): number {
  return typeof ts === "number" ? ts : parseInt(ts, 10);
}

export function roastedDaysAgo(coffee: Coffee): number {
  const roastedAt = parseLocalDate(coffee.roasted_at);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today.getTime() - roastedAt.getTime()) / 86400000));
}

export function coffeeStatus(coffee: Coffee, brews: Brew[] = []): FreshStatus {
  const d = roastedDaysAgo(coffee);
  const frozen = frozenGramsOf(coffee, brews);
  const active = activeGrams(coffee, brews);
  // Global windows (one knob for all coffees) — see setRestWindow.
  const rest = restWindow;
  const peak = Math.max(peakWindow, rest + 1);

  if (active <= 0 && frozen > 0) {
    const restLeft = Math.max(0, rest - d);
    return { state: "frozen", label: restLeft > 0 ? `Ready in ${restLeft}d` : "Ready", day: d, ready: false, pct: 1, restLeft };
  }
  if (d < rest) {
    return { state: "resting", label: `Ready in ${rest - d}d`, day: d, ready: false, pct: d / rest };
  }
  if (d <= peak) {
    const intoPeak = (d - rest) / (peak - rest);
    return { state: "peak", label: `${peak - d}d left`, day: d, ready: active > 0, pct: intoPeak };
  }
  return { state: "past", label: `${d - peak}d past`, day: d, ready: active > 0, pct: 1 };
}

export function freshColor(state: string): string {
  if (state === "peak") return "var(--accent)";
  if (state === "resting") return "var(--rest)";
  if (state === "frozen") return "var(--frozen)";
  return "var(--fade)";
}

// ---------- Inventory ----------

export const CUP_GRAMS = 12.5;  // default serving size; override via setServingGrams

export function gramsUsed(coffeeId: string, brews: Brew[]): number {
  return brews.filter((b) => b.coffee_id === coffeeId).reduce((s, b) => s + (b.dose || 0), 0);
}

export function remainingGrams(coffee: Coffee, brews: Brew[]): number {
  return Math.max(0, (coffee.grams || 250) - gramsUsed(coffee.id, brews));
}

export function frozenGramsOf(coffee: Coffee, brews: Brew[]): number {
  return Math.max(0, Math.min(coffee.frozen_grams || 0, remainingGrams(coffee, brews)));
}

export function activeGrams(coffee: Coffee, brews: Brew[]): number {
  return Math.max(0, remainingGrams(coffee, brews) - frozenGramsOf(coffee, brews));
}

export function cupsLeft(grams: number): number {
  return grams / servingGrams;
}

// ---------- Brew analytics ----------

export function brewRating(b: Brew): number {
  if (b.stars2 != null && b.stars != null) return (b.stars + b.stars2) / 2;
  return b.stars ?? 0;
}

export function lastBrewOf(coffeeId: string, brews: Brew[]): Brew | null {
  const rated = brews
    .filter((b) => b.coffee_id === coffeeId && !b.pending)
    .sort((a, b) => parseTs(b.started_at) - parseTs(a.started_at));
  return rated[0] ?? null;
}

export function pendingBrews(brews: Brew[]): Brew[] {
  return brews
    .filter((b) => b.pending)
    .sort((a, b) => parseTs(b.started_at) - parseTs(a.started_at));
}

// ---------- Time helpers ----------

export function sinceText(ts: string | number): string {
  const ms = parseTs(ts);
  if (!ms) return "just now";
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60), mm = m % 60;
  if (h < 24) return `${h}h${mm ? ` ${mm}m` : ""} ago`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? "day" : "days"} ago`;
}

export function daysAgoFromStartedAt(startedAt: string | number): number {
  const ms = parseTs(startedAt);
  return Math.floor((Date.now() - ms) / 86400000);
}

// ---------- Recipe defaults ----------

const ROAST_TEMP_NUDGE: Record<string, number> = {
  light: 1, "medium-light": 0, medium: -2, "medium-dark": -3, dark: -4,
};

export function defaultsFor(coffee: Coffee | null, brewer: Brewer): Recipe {
  let temp = brewer.temp;
  if (coffee) temp += ROAST_TEMP_NUDGE[coffee.roast] ?? 0;
  const dose = brewer.dose;
  // Water is the source of truth; fall back to dose×ratio for legacy brewers.
  const total = brewer.water ?? Math.round(dose * brewer.ratio);
  const water = brewer.bypass ? Math.round(total * 0.55) : total;
  const bypass = brewer.bypass ? total - water : 0;
  const ratio = total / dose;
  return { dose, ratio, water, bypass, temp, grind: brewer.grind, water_type: "" };
}

// ---------- Greeting + randomised question ----------

function timeSlot(): "late" | "morning" | "afternoon" | "evening" {
  const h = new Date().getHours();
  if (h < 5) return "late";
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

const OPENERS: Record<string, string[]> = {
  morning:   ["Morning", "Good morning", "Rise and grind", "Up and at 'em", "Top of the morning", "Early bird", "Bright and early", "First light", "Hello, sunshine"],
  afternoon: ["Afternoon", "Good afternoon", "Midday", "Hey there", "Halfway there", "Afternoon slump?", "Back for more"],
  evening:   ["Evening", "Good evening", "Winding down", "Night owl", "Day's done", "Golden hour", "Easy now"],
  late:      ["Late night", "Still up?", "Midnight oil", "Can't sleep?", "One more?", "The witching hour"],
};
const TAILS = ["", "", "", "", ", friend", " — coffee o'clock", ", let's go", ", you", ", champ", ", you legend", " then"];
const VERBS = ["brewing", "pouring", "grinding", "drinking", "sipping", "chasing", "cupping", "making", "dialing in", "fancying"];
const ADJ   = ["bright", "sweet", "fruity", "chocolatey", "clean", "funky", "juicy", "floral", "bold", "delicate", "wild", "cozy", "zippy", "jammy", "tea-like", "syrupy", "crisp", "punchy", "comforting", "honeyed", "boozy", "vibrant"];
const NOUNS = ["cup", "pour", "bean", "brew", "ritual", "morning cup", "first cup", "one"];

function randOf<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)]; }
function pick2<T>(a: T[]): [T, T] { const x = randOf(a); let y = randOf(a); let g = 0; while (y === x && g++ < 6) y = randOf(a); return [x, y]; }
function cap(s: string) { return s[0].toUpperCase() + s.slice(1); }

const Q_TEMPLATES: Array<() => string> = [
  () => `What are you ${randOf(VERBS)}?`,
  () => { const [a, b] = pick2(ADJ); return `Something ${a} or something ${b}?`; },
  () => `In the mood for something ${randOf(ADJ)}?`,
  () => `Feeling ${randOf(ADJ)} today?`,
  () => `${cap(randOf(ADJ))} today?`,
  () => `Time for something ${randOf(ADJ)}.`,
  () => `Let's ${randOf(VERBS)} something ${randOf(ADJ)}.`,
  () => `${cap(randOf(VERBS))} something ${randOf(ADJ)}?`,
  () => `Which ${randOf(NOUNS)} today?`,
  () => { const [a, b] = pick2(ADJ); return `${cap(a)} and ${b}?`; },
  () => `Chasing something ${randOf(ADJ)}?`,
  () => `What's the ${randOf(NOUNS)} today?`,
  () => "Your move.",
  () => "Dealer's choice.",
  () => "What sounds good?",
  () => "Ready when you are.",
  () => `Make it a ${randOf(ADJ)} one?`,
];

function baseGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Late night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function makeIntro(randomGreeting: boolean): { greet: string; q: string } {
  if (!randomGreeting) return { greet: baseGreeting(), q: "What are you brewing?" };
  return {
    greet: randOf(OPENERS[timeSlot()]) + randOf(TAILS),
    q: randOf(Q_TEMPLATES)(),
  };
}

// ---------- Origin helpers ----------

export const ORIGIN_CODES: Record<string, string> = {
  Ethiopia: "et", Colombia: "co", Kenya: "ke", Panama: "pa", "Costa Rica": "cr",
  Guatemala: "gt", Brazil: "br", Rwanda: "rw", Burundi: "bi", Honduras: "hn",
  Peru: "pe", Mexico: "mx", Indonesia: "id", Yemen: "ye", Tanzania: "tz",
  "El Salvador": "sv", Nicaragua: "ni", Bolivia: "bo", Uganda: "ug", India: "in",
  China: "cn", Ecuador: "ec", "Papua New Guinea": "pg", "DR Congo": "cd",
};

export function originCode(origin: string | null): string | null {
  if (!origin) return null;
  const o = origin.trim();
  if (ORIGIN_CODES[o]) return ORIGIN_CODES[o];
  const key = Object.keys(ORIGIN_CODES).find((k) => o.toLowerCase().includes(k.toLowerCase()));
  return key ? ORIGIN_CODES[key] : null;
}

export function initials(roaster: string): string {
  const words = (roaster || "").split(/\s+/).filter((w) => /[a-z0-9]/i.test(w));
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  const w = words[0] || "?";
  return w.slice(0, 2).toUpperCase();
}

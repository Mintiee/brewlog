import type { Coffee, Brew, Brewer, FreshStatus, Recipe } from "@/lib/types";

// ---------- Household-wide settings (set from config on load) ----------
// Mirrors the lib/flavour setLearnedNotes pattern: a module-level value the
// pure domain helpers read, so we don't thread config through every call site.

let restWindow = 28;        // days before a coffee is "ready" (global, all coffees)
let peakWindow = 56;        // days until past-peak (end of drink window)
let servingGrams = 12.5;

export function setRestWindow(days: number) {
  if (Number.isFinite(days) && days > 0) restWindow = days;
}
export function setPeakWindow(days: number) {
  if (Number.isFinite(days) && days > 0) peakWindow = days;
}
export function setServingGrams(grams: number) {
  if (Number.isFinite(grams) && grams > 0) servingGrams = grams;
}
export function getRestWindow() { return restWindow; }
export function getPeakWindow() { return peakWindow; }

// ---------- Freshness ----------

export function parseLocalDate(iso: string): Date {
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

// Milliseconds this coffee spent frozen between roast and `toMs`. Freezing pauses
// aging, so this span is subtracted from calendar age. Single freeze cycle:
// frozen_at → thawed_at (or up to `toMs` if still frozen).
function frozenSpanMs(coffee: Coffee, toMs: number): number {
  if (!coffee.frozen_at) return 0;
  const fz = parseLocalDate(coffee.frozen_at).getTime();
  if (toMs <= fz) return 0;
  const thawMs = coffee.thawed_at ? parseLocalDate(coffee.thawed_at).getTime() : toMs;
  return Math.max(0, Math.min(thawMs, toMs) - fz);
}

// Freeze-adjusted days the beans had rested at a given moment.
export function restDaysAt(coffee: Coffee, atMs: number): number {
  const roastedAt = parseLocalDate(coffee.roasted_at).getTime();
  return Math.max(0, Math.round((atMs - roastedAt - frozenSpanMs(coffee, atMs)) / 86400000));
}

// Freeze-adjusted rest at the moment this brew was pulled.
export function restDaysAtBrew(coffee: Coffee, brew: Brew): number {
  return restDaysAt(coffee, parseTs(brew.started_at));
}

// Freeze-adjusted age of the coffee as of now — drives freshness (resting/peak/past).
export function effectiveDaysAgo(coffee: Coffee): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return restDaysAt(coffee, today.getTime());
}

export function coffeeStatus(coffee: Coffee, brews: Brew[] = []): FreshStatus {
  const d = effectiveDaysAgo(coffee);
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
  // Compare calendar days in local time (not a rolling 24h window), so a brew
  // logged late last night reads as "yesterday", not "today". Math.round (not
  // floor) keeps it correct across DST boundaries, where two local midnights
  // can be 23h apart. Mirrors roastedDaysAgo.
  const d = new Date(parseTs(startedAt));
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today.getTime() - d.getTime()) / 86400000));
}

export function roastDateText(iso: string): string {
  // Format "YYYY-MM-DD" as a local date (avoids UTC ±1-day drift) e.g. "23 May 2025"
  return parseLocalDate(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

// Local "YYYY-MM-DD" for a timestamp — matches how date columns (roasted_at,
// frozen_at) are stored and avoids UTC ±1-day drift.
export function localISODate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Absolute journal date e.g. "Fri 6 Jun" (weekday + day + short month), adding
// the year only when it differs from the current year.
export function journalDateText(ms: number): string {
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-AU", {
    weekday: "short", day: "numeric", month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

// ---------- Shelf consumption estimate ----------

/** Average grams of coffee consumed per day, household-wide, over the last
 *  `windowDays` (or the shorter span of available brew history). Counts all
 *  brews — the dose was consumed regardless of whether the brew was rated.
 *  Returns 0 when there's no brew history in the window. */
export function avgDailyGrams(brews: Brew[], windowDays = 14): number {
  if (!brews.length) return 0;
  const now = Date.now();
  const cutoff = now - windowDays * 86400000;
  let sum = 0;
  let earliest = now;
  for (const b of brews) {
    const ts = parseTs(b.started_at);
    if (ts < earliest) earliest = ts;
    if (ts >= cutoff) sum += b.dose || 0;
  }
  if (sum === 0) return 0;
  const span = Math.min(windowDays, Math.max(1, Math.ceil((now - earliest) / 86400000)));
  return sum / span;
}

export function formatWeight(grams: number): string {
  if (grams >= 1000) {
    const kg = grams / 1000;
    // trim trailing zeros: 2.10 -> "2.1", 2.00 -> "2"
    return `${parseFloat(kg.toFixed(2))}kg`;
  }
  return `${Math.round(grams)}g`;
}

export function formatDaysWorth(days: number): string {
  if (days > 365) return "plenty left";
  if (days > 60) return `~${Math.round(days / 30)}m left`;
  if (days >= 14) return `~${Math.round(days / 7)}w left`;
  return `~${Math.round(days)}d left`;
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
const TAILS = ["", "", "", "", ", friend", " — coffee o'clock", ", let's go", ", champ", ", you legend", " then"];
const VERBS = ["brewing", "pouring", "grinding", "drinking", "sipping", "chasing", "cupping", "making", "dialing in", "fancying"];
// Base-form verbs for templates that need the infinitive ("Let's brew…"); the
// gerund VERBS above would read "Let's brewing…".
const BASE_VERBS = ["brew", "pour", "grind", "make", "chase", "sip"];
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
  () => `Let's ${randOf(BASE_VERBS)} something ${randOf(ADJ)}.`,
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

// Tails are vocatives/addendums (", champ", " then", " — coffee o'clock"). They
// only read well after a plain greeting, so skip them when the opener is already
// a question/exclamation ("Afternoon slump?", "Still up?") or already carries its
// own comma clause ("Hello, sunshine") — otherwise we get "Afternoon slump?, champ".
function withTail(opener: string, tail: string): string {
  if (/[?!.]$/.test(opener) || opener.includes(",")) return opener;
  return opener + tail;
}

export function makeIntro(randomGreeting: boolean): { greet: string; q: string } {
  if (!randomGreeting) return { greet: baseGreeting(), q: "What are you brewing?" };
  return {
    greet: withTail(randOf(OPENERS[timeSlot()]), randOf(TAILS)),
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

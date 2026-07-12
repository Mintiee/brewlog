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

// Local midnight of the day containing `ms`. Day counts are calendar-day diffs
// (midnight to midnight): without this, a brew logged after noon rounds up to
// one more rest day than the freshness display shows for the same coffee.
function localMidnightMs(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
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
  const at = localMidnightMs(atMs);
  const roastedAt = parseLocalDate(coffee.roasted_at).getTime();
  return Math.max(0, Math.round((at - roastedAt - frozenSpanMs(coffee, at)) / 86400000));
}

// Calendar days roast→atMs, ignoring any freeze — the out-of-freezer portion
// never paused, so it ages by the calendar.
function calendarDaysAt(coffee: Coffee, atMs: number): number {
  const at = localMidnightMs(atMs);
  const roastedAt = parseLocalDate(coffee.roasted_at).getTime();
  return Math.max(0, Math.round((at - roastedAt) / 86400000));
}

// Rest snapshot for a brew: you pull from the out-of-freezer portion when there
// is one (calendar rest — those beans never paused), and only pull from the
// freezer when nothing's active (freeze-adjusted pre-freeze rest).
export function restForBrew(coffee: Coffee, brews: Brew[], atMs: number): number {
  return activeGrams(coffee, brews) > 0 ? calendarDaysAt(coffee, atMs) : restDaysAt(coffee, atMs);
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

// Days this coffee has spent frozen (aging paused): frozen_at → thawed_at,
// or → today if still frozen. 0 if never frozen. frozenSpanMs already caps at
// thawed_at, so passing today works for both current and past freeze cycles.
export function frozenDays(coffee: Coffee): number {
  if (!coffee.frozen_at) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round(frozenSpanMs(coffee, today.getTime()) / 86400000);
}

export function coffeeStatus(coffee: Coffee, brews: Brew[] = []): FreshStatus {
  const frozen = frozenGramsOf(coffee, brews);
  const active = activeGrams(coffee, brews);
  // Global windows (one knob for all coffees) — see setRestWindow.
  const rest = restWindow;
  const peak = Math.max(peakWindow, rest + 1);

  if (active <= 0 && frozen > 0) {
    // Only frozen beans left — show their paused age.
    const fd = effectiveDaysAgo(coffee);
    const restLeft = Math.max(0, rest - fd);
    return { state: "frozen", label: restLeft > 0 ? `Ready in ${restLeft}d` : "Ready", day: fd, ready: false, pct: 1, restLeft };
  }

  // The drinkable (out-of-freezer) portion drives the resting/peak/past clock.
  // While any beans are still frozen, that portion was never paused → calendar age.
  // Once nothing is frozen (never-frozen or fully thawed), effectiveDaysAgo carries
  // the right pause.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = frozen > 0 ? calendarDaysAt(coffee, today.getTime()) : effectiveDaysAgo(coffee);
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
  // For split sessions (session_id set), count each physical brew's dose only once.
  // Cups poured and ratings remain per-row; only bean weight is deduplicated here.
  const seenSessions = new Set<string>();
  return brews
    .filter((b) => b.coffee_id === coffeeId)
    .reduce((s, b) => {
      if (b.session_id) {
        if (seenSessions.has(b.session_id)) return s;
        seenSessions.add(b.session_id);
      }
      return s + (b.dose || 0);
    }, 0);
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

// ---------- Roasters ----------

/** Normalised matching key for a roaster name: case/whitespace-insensitive,
 *  ignoring common trailing words ("Coffee", "Roasters", …) so "five senses"
 *  and "Five Senses Coffee" are recognised as the same roaster. */
export function roasterKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+(coffee( co\.?| company)?|roasters?|roastery|roasting( co\.?| company)?)$/, "")
    .trim();
}

/** Distinct roaster names across the shelf — one canonical spelling per
 *  roasterKey (the most-used original spelling; ties go to the most recent,
 *  i.e. first in the coffees array, which is sorted newest-first). */
export function distinctRoasters(coffees: Coffee[]): string[] {
  const byKey = new Map<string, Map<string, number>>();
  coffees.forEach((c) => {
    const raw = (c.roaster || "").replace(/\s+/g, " ").trim();
    const key = roasterKey(raw);
    if (!key) return;
    const spellings = byKey.get(key) ?? new Map<string, number>();
    spellings.set(raw, (spellings.get(raw) ?? 0) + 1);
    byKey.set(key, spellings);
  });
  return [...byKey.values()].map((spellings) => {
    let best = "", n = 0;
    spellings.forEach((count, spelling) => { if (count > n) { best = spelling; n = count; } });
    return best;
  });
}

/** Resolve a typed roaster name to the shelf's canonical spelling when it
 *  matches an existing roaster (case/suffix-insensitively); otherwise return
 *  the trimmed input as-is. Keeps near-duplicate roasters from accumulating. */
export function canonicalRoaster(input: string, coffees: Coffee[]): string {
  const trimmed = (input || "").replace(/\s+/g, " ").trim();
  const key = roasterKey(trimmed);
  if (!key) return trimmed;
  return distinctRoasters(coffees).find((r) => roasterKey(r) === key) ?? trimmed;
}

/** Existing roasters worth suggesting while typing: prefix/substring matches on
 *  the normalised key, excluding an already-exact match. */
export function roasterSuggestions(input: string, coffees: Coffee[], limit = 3): string[] {
  const key = roasterKey(input);
  if (!key) return [];
  return distinctRoasters(coffees)
    .filter((r) => {
      const rk = roasterKey(r);
      return rk.includes(key) && !(rk === key && r === input.replace(/\s+/g, " ").trim());
    })
    .slice(0, limit);
}

// ---------- Brew analytics ----------

export function brewRating(b: Brew): number {
  if (b.stars2 != null && b.stars != null) return (b.stars + b.stars2) / 2;
  return b.stars ?? 0;
}

/** Average star rating across a coffee's rated brews (split halves count
 *  separately — they're independent ratings). null when nothing is rated. */
export function bagAvgRating(coffeeId: string, brews: Brew[]): number | null {
  const ratings = brews
    .filter((b) => b.coffee_id === coffeeId && !b.pending && b.stars != null)
    .map(brewRating);
  if (!ratings.length) return null;
  return ratings.reduce((s, r) => s + r, 0) / ratings.length;
}

export function lastBrewOf(coffeeId: string, brews: Brew[]): Brew | null {
  const rated = brews
    .filter((b) => b.coffee_id === coffeeId && !b.pending)
    .sort((a, b) => parseTs(b.started_at) - parseTs(a.started_at));
  return rated[0] ?? null;
}

/** Most recent non-pending brew of a coffee, optionally scoped to a brewer,
 *  excluding a specific brew (e.g. itself) and/or brews at or after `beforeMs`
 *  (so "previous" means previous-to-THIS-brew, not latest overall). */
export function previousBrewFor(
  coffeeId: string,
  brewerId: string | null,
  brews: Brew[],
  excludeId?: string,
  beforeMs?: number,
): Brew | null {
  const candidates = brews
    .filter((b) => b.coffee_id === coffeeId && !b.pending)
    .filter((b) => (brewerId ? b.brewer_id === brewerId : true))
    .filter((b) => (excludeId ? b.id !== excludeId : true))
    .filter((b) => (beforeMs != null ? parseTs(b.started_at) < beforeMs : true))
    .sort((a, b) => parseTs(b.started_at) - parseTs(a.started_at));
  return candidates[0] ?? null;
}

export interface RecipeDeltaRow {
  key: string;
  label: string;
  prev: number;
  current: number;
  changed: boolean;
}

/** Field-by-field comparison of a previous brew's recipe against the current
 *  one — pure display data, no interpretation of which direction is "better". */
export function recipeDelta(
  prev: Brew,
  current: { dose: number; water: number; temp: number; grind: number },
): RecipeDeltaRow[] {
  const fields: Array<{ key: string; label: string; prevVal: number; curVal: number }> = [
    { key: "grind", label: "Grind", prevVal: prev.grind, curVal: current.grind },
    { key: "temp", label: "Temp", prevVal: prev.temp, curVal: current.temp },
    { key: "dose", label: "Dose", prevVal: prev.dose, curVal: current.dose },
    { key: "water", label: "Water", prevVal: prev.water, curVal: current.water },
  ];
  return fields.map(({ key, label, prevVal, curVal }) => ({
    key, label, prev: prevVal, current: curVal, changed: prevVal !== curVal,
  }));
}

export function pendingBrews(brews: Brew[]): Brew[] {
  return brews
    .filter((b) => b.pending && !b.guest)
    .sort((a, b) => parseTs(b.started_at) - parseTs(a.started_at));
}

/** The ids to remove for a "delete this brew" action rooted at `id`: if the
 *  target brew is part of a split session (shares a session_id with another
 *  row), every row in that session is included so a session-delete removes
 *  both cups atomically. Falls back to just `id` for a solo brew or an id
 *  that isn't found. Pulled out of AppContext's dismissBrewSession so the
 *  grouping rule is independently testable. */
export function sessionDeleteIds(brews: Brew[], id: string): Set<string> {
  const brew = brews.find((x) => x.id === id);
  return new Set(
    brew?.session_id
      ? brews.filter((x) => x.session_id === brew.session_id).map((x) => x.id)
      : [id],
  );
}

/** After removing `nextBrews` worth of brews for `coffee`, should an
 *  archived bag be auto-restored? True only if the bag was archived (i.e.
 *  it was previously marked finished) and the deletion left it with active
 *  grams again — deleting the brew that finished it off un-finishes it.
 *  Pulled out of AppContext's deleteBrews (Bug 1c) so the decision is
 *  independently testable. */
export function shouldUnarchiveAfterDelete(coffee: Coffee | undefined, nextBrews: Brew[]): boolean {
  return !!coffee?.archived && activeGrams(coffee, nextBrews) > 0;
}

/** After editing a bag's remaining weight, should an archived bag be
 *  auto-restored? True only if the bag was archived and the edit leaves it
 *  with active (non-frozen) grams again — correcting the weight upward
 *  un-finishes it, mirroring shouldUnarchiveAfterDelete. `newRemaining` is
 *  the edited total remaining (frozen included); post-edit frozen clamps to
 *  the new remaining, so active > 0 reduces to remaining > frozen. Compared
 *  against stored frozen_grams directly (not frozenGramsOf) because that
 *  helper clamps against the stale pre-edit remaining. */
export function shouldUnarchiveAfterEdit(coffee: Coffee, newRemaining: number): boolean {
  return coffee.archived && newRemaining > (coffee.frozen_grams || 0);
}

/** Whose "waiting to rate" list a brew belongs in: the person it was handed off
 *  to (rate_for) if set, otherwise the person who logged it. A logged brew is
 *  the logger's to rate until they send it to someone else. */
export function ratingOwnerId(b: Brew): string {
  return b.rate_for ?? b.logged_by;
}

/** Does this brew's rating belong to `profile`? Identity is by NAME, not profile
 *  id: anonymous re-logins mint duplicate same-name profiles (e.g. several
 *  "Min-Taec"s), and they're all the same person. Falls back to id match when a
 *  name can't be resolved (members not yet loaded). */
export function rateBelongsTo(
  b: Brew,
  profile: { id: string; name: string },
  members: { id: string; name: string }[],
): boolean {
  const ownerId = ratingOwnerId(b);
  if (ownerId === profile.id) return true;
  const ownerName = members.find((m) => m.id === ownerId)?.name;
  return ownerName != null && ownerName === profile.name;
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

/** Today as local YYYY-MM-DD (not UTC) — matches the device's "today". */
export function todayISO(): string {
  return localISODate(Date.now());
}

/**
 * Local calendar day (YYYY-MM-DD) of a UTC timestamp, shifted by an explicit
 * timezone offset in minutes (Date.prototype.getTimezoneOffset: positive west
 * of UTC). For server routes (which run in UTC) reasoning about a client's
 * local day — the client sends its own getTimezoneOffset() value. Shifts the
 * timestamp then reads UTC fields, so it doesn't depend on the server's own
 * timezone the way localISODate (which reads local fields) does.
 */
export function localDayAtOffset(ms: number, tzOffsetMin: number): string {
  return new Date(ms - tzOffsetMin * 60000).toISOString().slice(0, 10);
}

/** Same shift as localDayAtOffset, but as a bucket-able day index rather than
 *  a formatted string — for "N days since" cache-freshness comparisons. */
export function localDayIndexAtOffset(ms: number, tzOffsetMin: number): number {
  return Math.floor((ms - tzOffsetMin * 60000) / 86400000);
}

/** N days ago as local YYYY-MM-DD. */
export function daysAgoISO(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return localISODate(d.getTime());
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
  // Same split-session dedup as gramsUsed: one physical brew = one dose for weight.
  const seenSessions = new Set<string>();
  for (const b of brews) {
    const ts = parseTs(b.started_at);
    if (ts < earliest) earliest = ts;
    if (b.session_id) {
      if (seenSessions.has(b.session_id)) continue;
      seenSessions.add(b.session_id);
    }
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

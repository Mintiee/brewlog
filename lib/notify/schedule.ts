/**
 * The nudge decision engine. Pure — no I/O, no Supabase, no Date.now(). Every
 * input is passed in, so the whole thing is testable without a database or a
 * push endpoint, which is where all the confidence in this feature comes from.
 *
 * The load-bearing design choice is the +30 minute grace on the median: the
 * nudge fires *after* the time this person would normally already have logged,
 * so it only ever speaks when something is unusual. A nudge before the usual
 * time would be prompting someone to make coffee, which is advice, and the app
 * does not advise.
 */
import { zoned, dayDiff } from "./tz";

export type SlotName = "morning" | "arvo";

/** Local minute-of-day bounds, [from, to). A brew outside both windows (a 21:00
 *  decaf) teaches nothing and is ignored entirely. */
export const WINDOWS: Record<SlotName, { from: number; to: number }> = {
  morning: { from: 4 * 60, to: 11 * 60 },
  arvo: { from: 11 * 60, to: 17 * 60 },
};

export const SLOTS: SlotName[] = ["morning", "arvo"];

// --- Tuning ---
/** 8 whole weeks, so the sliding window never changes its weekday composition. */
const LOOKBACK_DAYS = 56;
const GATE_DAYS = 28;
/**
 * How often you must brew in a window for a *missing* brew to be worth
 * mentioning. Measured over the whole 56-day lookback, not a short recent
 * window: a fortnight away would otherwise silence a years-old habit.
 *
 * Set high on purpose. A slot you use half the time would nudge on the other
 * half — roughly four false alarms a week, which is the opposite of chill. At
 * 55% the nudge only speaks about a routine dense enough that a gap in it is
 * genuinely notable. Checked against the household's real history via
 * probe.test.ts; see docs/notifications.md.
 */
const MIN_HABIT_RATE = 0.55;
/** ...and the habit has to still be alive: this many days in the last GATE_DAYS.
 *  Deliberately low — this is a pulse check, not a second density gate. */
const MIN_RECENT_DAYS = 6;
const MIN_SAMPLES = 15;          // out of LOOKBACK_DAYS
/** Median absolute deviation ceiling. Someone whose arvo coffee is scattered
 *  uniformly across 11:00-17:00 has no typical time; a nudge at their median is
 *  noise, so that slot simply never fires. */
const MAX_MAD_MIN = 75;
const GRACE_MIN = 30;
const SNAP_MIN = 15;
/** Only adopt a recomputed time if it moved this far — kills the few-minute
 *  drift that would otherwise show up as a wandering nudge. */
const HYSTERESIS_MIN = 20;
/** Consecutive daily recomputes the gate must fail before a slot goes quiet. */
const DEACTIVATE_AFTER = 2;
/** How long after its fire time a slot may still nudge. Without this bound a
 *  Supabase project paused all morning wakes at 14:00 and delivers the 07:45
 *  nudge. A missed window should simply be missed. */
export const CATCHUP_MIN = 90;

/** No rate nudge between these local minutes-of-day. This is the entire
 *  quiet-hours feature: the log windows are structurally 04:00-17:00 already. */
const RATE_QUIET_FROM = 22 * 60;
const RATE_QUIET_TO = 6 * 60;

/** Max rate nudges per person per local day. */
export const RATE_CAP_PER_DAY = 2;

export interface SlotState {
  /** Local minutes past midnight, or null if never learned. */
  fireMin: number | null;
  active: boolean;
  misses: number;
}

export type PersonSlots = Record<SlotName, SlotState>;

export const EMPTY_SLOT: SlotState = { fireMin: null, active: false, misses: 0 };

// ---------- statistics ----------

/** Median, taking the lower of the two middle values for even n so the result
 *  is always an observed value and the downstream snap is deterministic. */
export function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
}

/** Median absolute deviation — the robust twin of the median, for the same
 *  reason we use a median at all: one airport morning must not move it. */
export function mad(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const m = median(xs);
  return median(xs.map((x) => Math.abs(x - m)));
}

function snap(min: number, to: number): number {
  return Math.round(min / to) * to;
}

// ---------- sampling ----------

export interface Sample { day: string; minutes: number }

/**
 * One sample per local day: the *earliest* brew in the window that day.
 *
 * The nudge predicts the first cup, not the average cup — taking every brew
 * would drag a two-coffee morning median toward 09:30 and nudge someone who had
 * already logged at 07:00.
 */
export function samplesFor(
  startedAtMs: number[],
  tz: string,
  slot: SlotName,
  nowMs: number,
): Sample[] {
  const { from, to } = WINDOWS[slot];
  const today = zoned(nowMs, tz).day;
  const earliest = new Map<string, number>();

  for (const ms of startedAtMs) {
    const z = zoned(ms, tz);
    if (z.minutes < from || z.minutes >= to) continue;
    const age = dayDiff(today, z.day);
    if (age < 0 || age >= LOOKBACK_DAYS) continue;
    const prev = earliest.get(z.day);
    if (prev === undefined || z.minutes < prev) earliest.set(z.day, z.minutes);
  }

  return [...earliest.entries()]
    .map(([day, minutes]) => ({ day, minutes }))
    .sort((a, b) => (a.day < b.day ? -1 : 1));
}

// ---------- learning ----------

/**
 * Recompute one slot from history. Called at most once per local day (see
 * `needsRecompute`) — never per tick, so the published fire time is a constant
 * between recomputes and cannot flap.
 */
export function learnSlot(
  startedAtMs: number[],
  tz: string,
  slot: SlotName,
  nowMs: number,
  prev: SlotState = EMPTY_SLOT,
): SlotState {
  const samples = samplesFor(startedAtMs, tz, slot, nowMs);
  const today = zoned(nowMs, tz).day;
  const recentDays = samples.filter((s) => dayDiff(today, s.day) < GATE_DAYS).length;
  const minutes = samples.map((s) => s.minutes);

  const passes =
    samples.length >= MIN_SAMPLES &&
    samples.length / LOOKBACK_DAYS >= MIN_HABIT_RATE &&
    recentDays >= MIN_RECENT_DAYS &&
    mad(minutes) <= MAX_MAD_MIN;

  if (!passes) {
    // Keep the last known good time; only the active flag decays, and only
    // after DEACTIVATE_AFTER consecutive failures, so one sick day or one week
    // away does not flicker the slot off and back on.
    const misses = prev.misses + 1;
    return { fireMin: prev.fireMin, active: prev.active && misses < DEACTIVATE_AFTER, misses };
  }

  const { to } = WINDOWS[slot];
  const raw = Math.min(median(minutes) + GRACE_MIN, to - SNAP_MIN);
  const fresh = snap(raw, SNAP_MIN);
  const fireMin =
    prev.fireMin !== null && Math.abs(fresh - prev.fireMin) < HYSTERESIS_MIN
      ? prev.fireMin
      : fresh;

  return { fireMin, active: true, misses: 0 };
}

export function learnSlots(
  startedAtMs: number[],
  tz: string,
  nowMs: number,
  prev: PersonSlots = { morning: EMPTY_SLOT, arvo: EMPTY_SLOT },
): PersonSlots {
  return {
    morning: learnSlot(startedAtMs, tz, "morning", nowMs, prev.morning),
    arvo: learnSlot(startedAtMs, tz, "arvo", nowMs, prev.arvo),
  };
}

/** Recompute once per local day, on the first tick after local 03:00 — before
 *  any window opens, so a day's nudges are decided from a settled snapshot.
 *
 *  Exception: a person who has never been computed is done on the next tick
 *  whatever the hour, so subscribing at 09:00 doesn't mean waiting until
 *  tomorrow for the arvo slot to exist. */
export function needsRecompute(computedOn: string | null, tz: string, nowMs: number): boolean {
  if (computedOn === null) return true;
  const z = zoned(nowMs, tz);
  if (z.minutes < 3 * 60) return false;
  return computedOn !== z.day;
}

// ---------- firing ----------

/** Has this person already logged a brew in this window today? */
export function loggedInWindowToday(
  startedAtMs: number[],
  tz: string,
  slot: SlotName,
  nowMs: number,
): boolean {
  const { from, to } = WINDOWS[slot];
  const today = zoned(nowMs, tz).day;
  return startedAtMs.some((ms) => {
    const z = zoned(ms, tz);
    return z.day === today && z.minutes >= from && z.minutes < to;
  });
}

export interface LogNudgeInput {
  slots: PersonSlots;
  /** Every non-guest brew this person logged, epoch ms. */
  startedAtMs: number[];
  tz: string;
  nowMs: number;
  enabled: boolean;
}

/** Which slots (if any) should nudge on this tick. Idempotency is *not* handled
 *  here — the caller claims a notification_log row before sending. */
export function dueLogSlots(input: LogNudgeInput): SlotName[] {
  if (!input.enabled) return [];
  const nowMin = zoned(input.nowMs, input.tz).minutes;
  return SLOTS.filter((slot) => {
    const st = input.slots[slot];
    if (!st.active || st.fireMin === null) return false;
    if (nowMin < st.fireMin || nowMin >= st.fireMin + CATCHUP_MIN) return false;
    return !loggedInWindowToday(input.startedAtMs, input.tz, slot, input.nowMs);
  });
}

/** Rate nudges stay silent overnight. */
export function inRateQuietHours(tz: string, nowMs: number): boolean {
  const m = zoned(nowMs, tz).minutes;
  return m >= RATE_QUIET_FROM || m < RATE_QUIET_TO;
}

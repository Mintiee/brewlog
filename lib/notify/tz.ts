/**
 * Timezone primitives for the nudge scheduler.
 *
 * The rest of the app classifies timestamps that have already happened, moments
 * after they happened, using a client-sent fixed offset (see localDayAtOffset in
 * lib/domain). This engine does the opposite: it decides *when a future local
 * wall-clock moment occurs*, from a statistic learned across two months. A fixed
 * offset learned in January is wrong from the first Sunday in April, so we carry
 * the IANA zone instead and let Intl do the DST arithmetic.
 *
 * No dependencies — Intl.DateTimeFormat with an explicit timeZone is correct on
 * Vercel's Node runtime (full ICU).
 */

// Constructing a DateTimeFormat is expensive and this runs every 5 minutes
// forever, over every brew in an 8-week window. There will only ever be one or
// two distinct zones, so memoising is free.
const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = FORMATTERS.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      // hourCycle "h23", not hour12:false — the latter renders midnight as "24"
      // on some ICU builds, which would put every midnight brew at minute 1440.
      hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
    FORMATTERS.set(tz, f);
  }
  return f;
}

export interface Zoned {
  /** Local calendar day, "YYYY-MM-DD". */
  day: string;
  /** Local minute of day, 0..1439. */
  minutes: number;
}

/** Local calendar day + minute-of-day for a UTC instant, in `tz`. */
export function zoned(ms: number, tz: string): Zoned {
  const parts: Record<string, string> = {};
  for (const { type, value } of formatterFor(tz).formatToParts(new Date(ms))) {
    parts[type] = value;
  }
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/**
 * Is this a timezone Intl actually knows? Validated on write, so a garbage
 * value from a client can never reach the cron loop and throw there — the loop
 * would take every other person's nudge down with it.
 */
export function isValidTz(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Local minute-of-day as "7:20am" — for showing learned times in Settings. */
export function minutesToClock(min: number): string {
  const h24 = Math.floor(min / 60) % 24;
  const m = min % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2, "0")}${h24 < 12 ? "am" : "pm"}`;
}

/** Days between two "YYYY-MM-DD" local day strings (a - b). */
export function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

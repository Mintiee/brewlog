import { describe, it, expect } from "vitest";
import { zoned, isValidTz, minutesToClock, dayDiff } from "@/lib/notify/tz";
import {
  learnSlot, learnSlots, samplesFor, dueLogSlots, loggedInWindowToday,
  needsRecompute, inRateQuietHours, median, mad, EMPTY_SLOT, WINDOWS, CATCHUP_MIN,
  type SlotState,
} from "@/lib/notify/schedule";

const SYD = "Australia/Sydney";

/** Epoch ms for a Sydney local wall-clock time. Built by search rather than by
 *  offset arithmetic so the test itself never has to know the DST rules. */
function sydney(day: string, hour: number, minute: number): number {
  const asUtc = Date.parse(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);
  // Sydney is UTC+10/+11; search a generous band so the test never encodes the
  // DST rules it is meant to be checking.
  for (let offsetMin = 8 * 60; offsetMin <= 14 * 60; offsetMin += 15) {
    const ms = asUtc - offsetMin * 60_000;
    const z = zoned(ms, SYD);
    if (z.day === day && z.minutes === hour * 60 + minute) return ms;
  }
  throw new Error(`no Sydney instant for ${day} ${hour}:${minute}`);
}

/** N consecutive days ending the day before `endDay`, each with one brew at the
 *  given local time (plus optional per-day jitter in minutes). */
function history(endDay: string, days: number, hour: number, minute: number, jitter: (i: number) => number = () => 0): number[] {
  const out: number[] = [];
  const end = Date.parse(`${endDay}T00:00:00Z`);
  for (let i = 1; i <= days; i++) {
    const day = new Date(end - i * 86_400_000).toISOString().slice(0, 10);
    const m = hour * 60 + minute + jitter(i);
    out.push(sydney(day, Math.floor(m / 60), m % 60));
  }
  return out;
}

describe("tz", () => {
  it("reads local day and minute-of-day in the target zone", () => {
    // 2026-08-31 00:30 UTC is already mid-morning in Sydney (UTC+10 in August).
    const z = zoned(Date.parse("2026-08-31T00:30:00Z"), SYD);
    expect(z.day).toBe("2026-08-31");
    expect(z.minutes).toBe(10 * 60 + 30);
  });

  it("renders midnight as minute 0, not 1440 (hourCycle h23, not hour12:false)", () => {
    expect(zoned(sydney("2026-06-15", 0, 0), SYD).minutes).toBe(0);
  });

  it("survives both Sydney DST transitions", () => {
    // Sydney goes to UTC+11 on the first Sunday in October and back to UTC+10
    // on the first Sunday in April. 07:45 local must stay 07:45 either side.
    for (const day of ["2026-04-04", "2026-04-05", "2026-04-06", "2026-10-03", "2026-10-04", "2026-10-05"]) {
      expect(zoned(sydney(day, 7, 45), SYD)).toEqual({ day, minutes: 7 * 60 + 45 });
    }
  });

  it("validates timezones", () => {
    expect(isValidTz(SYD)).toBe(true);
    expect(isValidTz("Mars/Olympus")).toBe(false);
    expect(isValidTz("")).toBe(false);
    expect(isValidTz(600)).toBe(false);
  });

  it("formats a clock label", () => {
    expect(minutesToClock(7 * 60 + 20)).toBe("7:20am");
    expect(minutesToClock(14 * 60 + 40)).toBe("2:40pm");
    expect(minutesToClock(12 * 60)).toBe("12:00pm");
    expect(minutesToClock(0)).toBe("12:00am");
  });

  it("counts whole days between local day strings", () => {
    expect(dayDiff("2026-08-31", "2026-08-24")).toBe(7);
    // Across the April DST transition the *calendar* gap is still exact.
    expect(dayDiff("2026-04-06", "2026-04-04")).toBe(2);
  });
});

describe("statistics", () => {
  it("median takes the lower middle for even n", () => {
    expect(median([1, 2, 3, 4])).toBe(2);
    expect(median([3, 1, 2])).toBe(2);
    expect(Number.isNaN(median([]))).toBe(true);
  });

  it("mad ignores a lone outlier", () => {
    expect(mad([100, 102, 104, 106, 900])).toBeLessThan(10);
  });
});

describe("samplesFor", () => {
  const now = sydney("2026-08-31", 12, 0);

  it("keeps only the earliest brew per day within the window", () => {
    const brews = [
      sydney("2026-08-30", 7, 30),
      sydney("2026-08-30", 9, 45),  // second coffee, same morning — ignored
      sydney("2026-08-29", 6, 50),
    ];
    expect(samplesFor(brews, SYD, "morning", now)).toEqual([
      { day: "2026-08-29", minutes: 6 * 60 + 50 },
      { day: "2026-08-30", minutes: 7 * 60 + 30 },
    ]);
  });

  it("ignores brews outside both windows and beyond the lookback", () => {
    const brews = [
      sydney("2026-08-30", 21, 0),   // evening decaf
      sydney("2026-08-30", 3, 30),   // before the morning window opens
      sydney("2026-05-01", 7, 30),   // older than 56 days
    ];
    expect(samplesFor(brews, SYD, "morning", now)).toEqual([]);
  });

  it("splits morning and arvo at 11:00", () => {
    const brews = [sydney("2026-08-30", 10, 59), sydney("2026-08-30", 11, 0)];
    expect(samplesFor(brews, SYD, "morning", now)).toHaveLength(1);
    expect(samplesFor(brews, SYD, "arvo", now)).toHaveLength(1);
  });
});

describe("learnSlot", () => {
  const now = sydney("2026-08-31", 3, 30); // a recompute tick

  it("learns median + 30min grace, snapped to 15", () => {
    // 30 days at 07:10 → median 430 + 30 = 460 → snaps to 465 (07:45).
    const st = learnSlot(history("2026-08-31", 40, 7, 10), SYD, "morning", now);
    expect(st.active).toBe(true);
    expect(st.fireMin).toBe(7 * 60 + 45);
  });

  it("fires after the usual time, never before", () => {
    const brews = history("2026-08-31", 40, 7, 10);
    const st = learnSlot(brews, SYD, "morning", now);
    expect(st.fireMin!).toBeGreaterThan(7 * 60 + 10);
  });

  it("a single outlier does not move it (median, not mean)", () => {
    const normal = history("2026-08-31", 39, 7, 10);
    const withOutlier = [...normal, sydney("2026-07-04", 4, 40)];
    expect(learnSlot(withOutlier, SYD, "morning", now).fireMin)
      .toBe(learnSlot(normal, SYD, "morning", now).fireMin);
  });

  it("stays inactive with too little history, and invents no fallback time", () => {
    const st = learnSlot(history("2026-08-31", 8, 7, 10), SYD, "morning", now);
    expect(st.active).toBe(false);
    expect(st.fireMin).toBeNull();
  });

  it("stays inactive once a habit has been dropped", () => {
    // 20 samples, all in the older half of the lookback: the density gate fails
    // and so does the recency pulse check.
    const old = history("2026-08-03", 20, 7, 10); // all >28 days before 2026-08-31
    const st = learnSlot(old, SYD, "morning", now);
    expect(st.active).toBe(false);
  });

  it("refuses a slot with no typical time (MAD gate)", () => {
    // Arvo coffee scattered across the whole 11:00-17:00 window.
    const scattered = history("2026-08-31", 40, 11, 0, (i) => (i * 83) % 355);
    const st = learnSlot(scattered, SYD, "arvo", now);
    expect(st.active).toBe(false);
  });

  it("accepts a tight arvo habit", () => {
    const tight = history("2026-08-31", 40, 14, 0, (i) => (i % 3) * 5);
    const st = learnSlot(tight, SYD, "arvo", now);
    expect(st.active).toBe(true);
    expect(st.fireMin).toBe(14 * 60 + 30);
  });

  it("clamps the fire time inside the window", () => {
    const late = history("2026-08-31", 40, 16, 50, () => 0);
    const st = learnSlot(late, SYD, "arvo", now);
    expect(st.fireMin!).toBeLessThanOrEqual(WINDOWS.arvo.to - 15);
  });

  it("hysteresis: a small drift keeps the published time", () => {
    const prev: SlotState = { fireMin: 7 * 60 + 45, active: true, misses: 0 };
    // The recomputed time lands on 8:00 — a 15-minute move, under the threshold.
    const st = learnSlot(history("2026-08-31", 40, 7, 25), SYD, "morning", now, prev);
    expect(st.fireMin).toBe(7 * 60 + 45);
  });

  it("hysteresis: a real move is adopted", () => {
    const prev: SlotState = { fireMin: 7 * 60 + 45, active: true, misses: 0 };
    const st = learnSlot(history("2026-08-31", 40, 9, 0), SYD, "morning", now, prev);
    expect(st.fireMin).toBe(9 * 60 + 30);
  });

  it("one bad recompute does not deactivate a live slot; two do", () => {
    const active: SlotState = { fireMin: 7 * 60 + 45, active: true, misses: 0 };
    const first = learnSlot([], SYD, "morning", now, active);
    expect(first.active).toBe(true);
    expect(first.misses).toBe(1);
    expect(first.fireMin).toBe(7 * 60 + 45); // last known good time is kept

    const second = learnSlot([], SYD, "morning", now, first);
    expect(second.active).toBe(false);
  });

  it("refuses a slot used only about half the time", () => {
    // Every second day. A nudge here would cry wolf on the other half — the
    // exact failure the density gate exists to prevent.
    const alternate = history("2026-08-31", 56, 7, 10).filter((_, i) => i % 2 === 0);
    expect(learnSlot(alternate, SYD, "morning", now).active).toBe(false);
  });

  it("accepts a slot used most days", () => {
    const most = history("2026-08-31", 56, 7, 10).filter((_, i) => i % 4 !== 0);
    expect(learnSlot(most, SYD, "morning", now).active).toBe(true);
  });

  it("learnSlots does both windows independently", () => {
    const brews = [...history("2026-08-31", 40, 7, 10), ...history("2026-08-31", 5, 14, 0)];
    const slots = learnSlots(brews, SYD, now);
    expect(slots.morning.active).toBe(true);
    expect(slots.arvo.active).toBe(false); // only 5 arvo days — no nudge, no guess
  });
});

describe("needsRecompute", () => {
  it("computes a brand-new person immediately, whatever the hour", () => {
    // Otherwise subscribing at 09:00 means no slots until tomorrow.
    expect(needsRecompute(null, SYD, sydney("2026-08-31", 9, 0))).toBe(true);
    expect(needsRecompute(null, SYD, sydney("2026-08-31", 2, 55))).toBe(true);
  });

  it("waits until after local 03:00 and then runs once per local day", () => {
    expect(needsRecompute("2026-08-30", SYD, sydney("2026-08-31", 2, 55))).toBe(false);
    expect(needsRecompute("2026-08-31", SYD, sydney("2026-08-31", 9, 0))).toBe(false);
    expect(needsRecompute("2026-08-30", SYD, sydney("2026-08-31", 9, 0))).toBe(true);
  });
});

describe("dueLogSlots", () => {
  const slots = {
    morning: { fireMin: 7 * 60 + 45, active: true, misses: 0 },
    arvo: { fireMin: 14 * 60 + 30, active: false, misses: 2 },
  };
  const base = { slots, startedAtMs: [] as number[], tz: SYD, enabled: true };

  it("does not fire before the learned time", () => {
    expect(dueLogSlots({ ...base, nowMs: sydney("2026-08-31", 7, 30) })).toEqual([]);
  });

  it("fires at the learned time", () => {
    expect(dueLogSlots({ ...base, nowMs: sydney("2026-08-31", 7, 45) })).toEqual(["morning"]);
  });

  it("stays quiet once the coffee is already logged", () => {
    const logged = [sydney("2026-08-31", 7, 5)];
    expect(dueLogSlots({ ...base, startedAtMs: logged, nowMs: sydney("2026-08-31", 7, 45) })).toEqual([]);
  });

  it("a brew in the other window does not satisfy this one", () => {
    const arvoOnly = [sydney("2026-08-31", 15, 0)];
    expect(dueLogSlots({ ...base, startedAtMs: arvoOnly, nowMs: sydney("2026-08-31", 7, 45) })).toEqual(["morning"]);
  });

  it("a missed window stays missed — no backlog after a paused project", () => {
    const late = sydney("2026-08-31", 7, 45) + CATCHUP_MIN * 60_000;
    expect(dueLogSlots({ ...base, nowMs: late })).toEqual([]);
    expect(dueLogSlots({ ...base, nowMs: late - 60_000 })).toEqual(["morning"]);
  });

  it("never fires an inactive slot", () => {
    expect(dueLogSlots({ ...base, nowMs: sydney("2026-08-31", 14, 30) })).toEqual([]);
  });

  it("respects the per-person opt-out", () => {
    expect(dueLogSlots({ ...base, enabled: false, nowMs: sydney("2026-08-31", 7, 45) })).toEqual([]);
  });

  it("fires at the same local time either side of a DST change", () => {
    for (const day of ["2026-04-04", "2026-04-06", "2026-10-03", "2026-10-05"]) {
      expect(dueLogSlots({ ...base, nowMs: sydney(day, 7, 45) })).toEqual(["morning"]);
    }
  });
});

describe("loggedInWindowToday", () => {
  it("only counts today, in local time", () => {
    const yesterday = [sydney("2026-08-30", 7, 30)];
    expect(loggedInWindowToday(yesterday, SYD, "morning", sydney("2026-08-31", 7, 45))).toBe(false);
  });
});

describe("inRateQuietHours", () => {
  it("is quiet from 22:00 to 06:00 local", () => {
    expect(inRateQuietHours(SYD, sydney("2026-08-31", 22, 0))).toBe(true);
    expect(inRateQuietHours(SYD, sydney("2026-08-31", 2, 0))).toBe(true);
    expect(inRateQuietHours(SYD, sydney("2026-08-31", 5, 59))).toBe(true);
    expect(inRateQuietHours(SYD, sydney("2026-08-31", 6, 0))).toBe(false);
    expect(inRateQuietHours(SYD, sydney("2026-08-31", 21, 59))).toBe(false);
  });
});

describe("EMPTY_SLOT", () => {
  it("is inert", () => {
    expect(EMPTY_SLOT).toEqual({ fireMin: null, active: false, misses: 0 });
  });
});

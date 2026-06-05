import { describe, it, expect } from "vitest";
import {
  coffeeStatus, remainingGrams, frozenGramsOf, activeGrams, cupsLeft,
  brewRating, lastBrewOf, pendingBrews, sinceText, defaultsFor, roastedDaysAgo,
  effectiveDaysAgo, restDaysAt,
  setRestWindow, setServingGrams, daysAgoFromStartedAt,
} from "@/lib/domain";
import type { Coffee, Brew, Brewer } from "@/lib/types";

// Format a Date as local YYYY-MM-DD (not UTC) to avoid timezone drift
function localIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysAgoDate(n: number): string {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n);
  return localIso(d);
}

function makeCoffee(overrides: Partial<Coffee> = {}): Coffee {
  return {
    id: "c1", household_id: "h1", roaster: "Test", name: "Test", origin: "Ethiopia",
    region: "Sidama", varietal: "Heirloom", process: "Washed", roast: "light",
    roasted_at: daysAgoDate(0),
    rest_days: 28, peak_days: 56, grams: 250, frozen_grams: 0,
    frozen_at: null, thawed_at: null, archived: false,
    notes: [], color: "#aaa", cc: "et",
    ...overrides,
  };
}

function makeBrew(overrides: Partial<Brew> = {}): Brew {
  return {
    id: "b1", household_id: "h1", coffee_id: "c1", brewer_id: "v60",
    dose: 15, water: 240, bypass: 0, temp: 96, grind: 22, ratio: 16,
    water_type: "Filtered", started_at: String(Date.now()), rated_at: String(Date.now()),
    logged_by: "me", pending: false, rate_for: null,
    rest_days: null,
    stars: 4, stars2: null, taster1: "You", taster2: null,
    acidity: 3, sweetness: 3, body: 3, clarity: 4, note: null,
    ...overrides,
  };
}

describe("freeze-adjusted age (effectiveDaysAgo / restDaysAt)", () => {
  it("matches calendar age when never frozen", () => {
    const c = makeCoffee({ roasted_at: daysAgoDate(30) });
    expect(effectiveDaysAgo(c)).toBe(30);
  });

  it("pauses aging while frozen (still in the freezer)", () => {
    // Roasted 50d ago, frozen 40d ago and never taken out → aged ~10d.
    const c = makeCoffee({ roasted_at: daysAgoDate(50), frozen_at: daysAgoDate(40), thawed_at: null, frozen_grams: 100, grams: 100 });
    expect(effectiveDaysAgo(c)).toBe(10);
  });

  it("subtracts only the frozen span once thawed", () => {
    // Roasted 50d ago, frozen 40d→20d ago (20d frozen), then out → aged 30d.
    const c = makeCoffee({ roasted_at: daysAgoDate(50), frozen_at: daysAgoDate(40), thawed_at: daysAgoDate(20) });
    expect(effectiveDaysAgo(c)).toBe(30);
  });

  it("restDaysAt snapshots pre-freeze rest for a brew pulled from the freezer", () => {
    const now = Date.now();
    const c = makeCoffee({ roasted_at: daysAgoDate(50), frozen_at: daysAgoDate(40), thawed_at: null });
    // Brewed now, straight from the freezer: rest ≈ days roast→freeze = 10.
    expect(restDaysAt(c, now)).toBe(10);
  });
});

describe("roastedDaysAgo", () => {
  it("returns 0 for today", () => {
    const c = makeCoffee();
    expect(roastedDaysAgo(c)).toBe(0);
  });
  it("returns n for n days ago", () => {
    const c = makeCoffee({ roasted_at: daysAgoDate(34) });
    expect(roastedDaysAgo(c)).toBe(34);
  });
});

describe("coffeeStatus", () => {
  it("resting: days < rest_days", () => {
    const c = makeCoffee({ roasted_at: daysAgoDate(10), rest_days: 28, peak_days: 56 });
    const st = coffeeStatus(c, []);
    expect(st.state).toBe("resting");
    expect(st.label).toBe("Ready in 18d");
    expect(st.ready).toBe(false);
  });
  it("peak: rest_days <= days <= peak_days", () => {
    const c = makeCoffee({ roasted_at: daysAgoDate(34), rest_days: 28, peak_days: 56 });
    const st = coffeeStatus(c, []);
    expect(st.state).toBe("peak");
    expect(st.label).toBe("22d left");
    expect(st.ready).toBe(true);
  });
  it("past: days > peak_days", () => {
    const c = makeCoffee({ roasted_at: daysAgoDate(60), rest_days: 28, peak_days: 56 });
    const st = coffeeStatus(c, []);
    expect(st.state).toBe("past");
    expect(st.label).toBe("4d past");
  });
  it("frozen: no active grams, has frozen", () => {
    const c = makeCoffee({ roasted_at: daysAgoDate(14), grams: 100, frozen_grams: 100 });
    const st = coffeeStatus(c, []);
    expect(st.state).toBe("frozen");
  });
  // Verify the three screenshot labels from the plan
  it("Guji: 45d roasted, 28/56 → 11d left", () => {
    const c = makeCoffee({ roasted_at: daysAgoDate(45), rest_days: 28, peak_days: 56 });
    const st = coffeeStatus(c, []);
    expect(st.state).toBe("peak");
    expect(st.label).toBe("11d left");
  });
  it("Hamasho: 34d roasted, 28/56 → 22d left", () => {
    const c = makeCoffee({ roasted_at: daysAgoDate(34), rest_days: 28, peak_days: 56 });
    expect(coffeeStatus(c, []).label).toBe("22d left");
  });
  it("Geometry: 30d roasted, 28/56 → 26d left", () => {
    const c = makeCoffee({ roasted_at: daysAgoDate(30), rest_days: 28, peak_days: 56 });
    expect(coffeeStatus(c, []).label).toBe("26d left");
  });
});

describe("inventory", () => {
  it("remaining = grams - sum of all brews (incl pending)", () => {
    const c = makeCoffee({ grams: 250 });
    const brews = [
      makeBrew({ coffee_id: "c1", dose: 15, pending: false }),
      makeBrew({ id: "b2", coffee_id: "c1", dose: 15, pending: true }),
    ];
    expect(remainingGrams(c, brews)).toBe(220);
  });
  it("frozen capped at remaining", () => {
    const c = makeCoffee({ grams: 100, frozen_grams: 200 });
    expect(frozenGramsOf(c, [])).toBe(100);
  });
  it("active = remaining - frozen", () => {
    const c = makeCoffee({ grams: 250, frozen_grams: 50 });
    expect(activeGrams(c, [])).toBe(200);
  });
  it("cupsLeft uses 12.5g per serve", () => {
    expect(cupsLeft(125)).toBeCloseTo(10);
  });
});

describe("brewRating", () => {
  it("single rater", () => {
    expect(brewRating(makeBrew({ stars: 4, stars2: null }))).toBe(4);
  });
  it("two raters averaged", () => {
    expect(brewRating(makeBrew({ stars: 4, stars2: 2 }))).toBe(3);
  });
});

describe("lastBrewOf / pendingBrews", () => {
  it("lastBrewOf skips pending", () => {
    const brews = [
      makeBrew({ id: "b1", coffee_id: "c1", pending: true, started_at: String(Date.now()) }),
      makeBrew({ id: "b2", coffee_id: "c1", pending: false, started_at: String(Date.now() - 86400000) }),
    ];
    const result = lastBrewOf("c1", brews);
    expect(result?.id).toBe("b2");
  });
  it("pendingBrews newest first", () => {
    const now = Date.now();
    const brews = [
      makeBrew({ id: "b1", pending: true, started_at: String(now - 3600000) }),
      makeBrew({ id: "b2", pending: true, started_at: String(now) }),
    ];
    const pending = pendingBrews(brews);
    expect(pending[0].id).toBe("b2");
  });
});

describe("sinceText", () => {
  it("just now for <30s", () => { expect(sinceText(Date.now() - 10000)).toBe("just now"); });
  it("Xm ago", () => { expect(sinceText(Date.now() - 720000)).toBe("12m ago"); });
  it("Xh Ym ago", () => { expect(sinceText(Date.now() - 3840000)).toBe("1h 4m ago"); });
  it("X days ago", () => { expect(sinceText(Date.now() - 2 * 86400000)).toBe("2 days ago"); });
});

describe("global settings (setRestWindow / setServingGrams)", () => {
  it("rest window drives coffeeStatus for all coffees", () => {
    const c = makeCoffee({ roasted_at: daysAgoDate(10) });
    expect(coffeeStatus(c, []).label).toBe("Ready in 18d"); // default 28
    setRestWindow(14);
    expect(coffeeStatus(c, []).label).toBe("Ready in 4d");  // 14 - 10
    setRestWindow(28); // restore for other tests
  });
  it("serving size drives cupsLeft", () => {
    setServingGrams(20);
    expect(cupsLeft(100)).toBeCloseTo(5);
    setServingGrams(12.5); // restore
    expect(cupsLeft(125)).toBeCloseTo(10);
  });
});

describe("defaultsFor", () => {
  const v60: Brewer = { id: "v60", name: "V60", short: "V60", dose: 15, ratio: 16, temp: 96, grind: 22, pours: 4, bypass: false };
  it("uses brewer defaults", () => {
    const r = defaultsFor(null, v60);
    expect(r.dose).toBe(15);
    expect(r.water).toBe(240);
    expect(r.bypass).toBe(0);
    expect(r.temp).toBe(96);
  });
  it("nudges temp +1 for light roast", () => {
    const c = makeCoffee({ roast: "light" });
    const r = defaultsFor(c, v60);
    expect(r.temp).toBe(97);
  });
  it("bypass brewer splits 55/45", () => {
    const oxo: Brewer = { id: "oxo", name: "OXO", short: "OXO", dose: 22, ratio: 16.5, temp: 94, grind: 24, pours: 1, bypass: true };
    const r = defaultsFor(null, oxo);
    const total = Math.round(22 * 16.5);
    expect(r.water + r.bypass).toBe(total);
    expect(r.water).toBe(Math.round(total * 0.55));
  });
});

describe("daysAgoFromStartedAt — calendar days in local time", () => {
  const localMidnight = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

  it("counts a brew logged late last night as 1 day ago, not 0", () => {
    // The reported bug: a brew at 11pm yesterday read as "Today" because the old
    // code compared a rolling 24h window. It must be "Yesterday" (1) at any
    // time of day, in any timezone.
    const d = localMidnight(); d.setDate(d.getDate() - 1); d.setHours(23, 0, 0, 0);
    expect(daysAgoFromStartedAt(String(d.getTime()))).toBe(1);
  });

  it("counts a brew logged just after midnight today as 0 days ago", () => {
    const d = localMidnight(); d.setHours(0, 30, 0, 0);
    expect(daysAgoFromStartedAt(String(d.getTime()))).toBe(0);
  });

  it("counts a brew earlier today as 0 days ago", () => {
    const d = localMidnight(); d.setHours(8, 0, 0, 0);
    expect(daysAgoFromStartedAt(String(d.getTime()))).toBe(0);
  });

  it("clamps a future timestamp to 0 (never negative)", () => {
    const d = localMidnight(); d.setDate(d.getDate() + 1);
    expect(daysAgoFromStartedAt(String(d.getTime()))).toBe(0);
  });

  it("counts exactly N calendar days ago", () => {
    const d = localMidnight(); d.setDate(d.getDate() - 5); d.setHours(14, 0, 0, 0);
    expect(daysAgoFromStartedAt(String(d.getTime()))).toBe(5);
  });
});

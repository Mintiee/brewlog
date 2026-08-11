import { describe, it, expect } from "vitest";
import {
  coffeeStatus, remainingGrams, frozenGramsOf, activeGrams, cupsLeft,
  gramsUsed, avgDailyGrams,
  brewRating, lastBrewOf, previousBrewFor, recipeDelta, pendingBrews, sinceText, defaultsFor, roastedDaysAgo,
  roasterKey, distinctRoasters, canonicalRoaster, roasterSuggestions, bagAvgRating,
  effectiveDaysAgo, restDaysAt, restForBrew,
  setRestWindow, setServingGrams, daysAgoFromStartedAt, todayISO, daysAgoISO,
  setRoasterWindows, getRoasterWindows, resolveWindows,
  sessionDeleteIds, shouldUnarchiveAfterDelete, shouldUnarchiveAfterEdit,
  recipeRatio, brewEditPatch, type BrewEditForm,
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
    region: "Sidama", varietals: ["Heirloom"], process: "Washed", roast: "light",
    roasted_at: daysAgoDate(0),
    rest_days: 28, peak_days: 56, grams: 250, frozen_grams: 0,
    frozen_at: null, thawed_at: null, archived: false,
    notes: [], cc: "et",
    ...overrides,
  };
}

function makeBrew(overrides: Partial<Brew> = {}): Brew {
  return {
    id: "b1", household_id: "h1", coffee_id: "c1", brewer_id: "v60",
    dose: 15, water: 240, bypass: 0, temp: 96, grind: 22, ratio: 16,
    water_type: "Filtered", started_at: String(Date.now()), rated_at: String(Date.now()),
    logged_by: "me", pending: false, rate_for: null, session_id: null, guest: false,
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

describe("partial-freeze aging (only the frozen portion pauses)", () => {
  it("coffeeStatus: unfrozen half keeps aging by the calendar while the rest is frozen", () => {
    // Roasted 34d ago, half the bag put in the freezer 10d ago. The out-of-freezer
    // half was never paused → still ages by calendar (day 34), not paused at ~24.
    const c = makeCoffee({ roasted_at: daysAgoDate(34), grams: 200, frozen_grams: 100, frozen_at: daysAgoDate(10), thawed_at: null });
    const st = coffeeStatus(c, []);
    expect(st.state).toBe("peak");
    expect(st.day).toBe(34);
    expect(st.label).toBe("22d left");
  });

  it("coffeeStatus: only-frozen bag shows the paused age", () => {
    const c = makeCoffee({ roasted_at: daysAgoDate(34), grams: 100, frozen_grams: 100, frozen_at: daysAgoDate(10), thawed_at: null });
    const st = coffeeStatus(c, []);
    expect(st.state).toBe("frozen");
    expect(st.day).toBe(24); // aged 34-10=24d before the freeze, then paused
  });

  it("restForBrew: brewing from the out-of-freezer portion snapshots calendar rest", () => {
    const now = Date.now();
    const c = makeCoffee({ roasted_at: daysAgoDate(34), grams: 200, frozen_grams: 100, frozen_at: daysAgoDate(10), thawed_at: null });
    expect(restForBrew(c, [], now)).toBe(34);
  });

  it("restForBrew: brewing from the freezer (nothing active) snapshots freeze-adjusted rest", () => {
    const now = Date.now();
    const c = makeCoffee({ roasted_at: daysAgoDate(50), grams: 100, frozen_grams: 100, frozen_at: daysAgoDate(40), thawed_at: null });
    expect(restForBrew(c, [], now)).toBe(restDaysAt(c, now));
    expect(restForBrew(c, [], now)).toBe(10);
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

describe("split-session dedup (gramsUsed / avgDailyGrams)", () => {
  it("gramsUsed counts a split session's dose only once", () => {
    // One 22g OXO brew → two rows sharing session_id. Should deduct 22g, not 44g.
    const brews = [
      makeBrew({ id: "b1", coffee_id: "c1", dose: 22, session_id: "s1" }),
      makeBrew({ id: "b2", coffee_id: "c1", dose: 22, session_id: "s1" }),
    ];
    expect(gramsUsed("c1", brews)).toBe(22);
  });

  it("gramsUsed counts two different sessions independently", () => {
    const brews = [
      makeBrew({ id: "b1", coffee_id: "c1", dose: 22, session_id: "s1" }),
      makeBrew({ id: "b2", coffee_id: "c1", dose: 22, session_id: "s1" }),
      makeBrew({ id: "b3", coffee_id: "c1", dose: 22, session_id: "s2" }),
      makeBrew({ id: "b4", coffee_id: "c1", dose: 22, session_id: "s2" }),
    ];
    expect(gramsUsed("c1", brews)).toBe(44); // two physical brews, 22g each
  });

  it("gramsUsed counts solo brews (no session_id) normally", () => {
    const brews = [
      makeBrew({ id: "b1", coffee_id: "c1", dose: 15, session_id: null }),
      makeBrew({ id: "b2", coffee_id: "c1", dose: 15, session_id: null }),
    ];
    expect(gramsUsed("c1", brews)).toBe(30);
  });

  it("avgDailyGrams counts a split session's dose only once", () => {
    const now = Date.now();
    const brews = [
      makeBrew({ id: "b1", dose: 22, session_id: "s1", started_at: String(now) }),
      makeBrew({ id: "b2", dose: 22, session_id: "s1", started_at: String(now) }),
    ];
    // 22g over 1 day = 22g/day (not 44g)
    expect(avgDailyGrams(brews, 14)).toBeCloseTo(22, 0);
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

describe("previousBrewFor", () => {
  const now = Date.now();
  const brews = [
    makeBrew({ id: "v1", coffee_id: "c1", brewer_id: "v60", started_at: String(now - 3 * 86400000) }),
    makeBrew({ id: "v2", coffee_id: "c1", brewer_id: "v60", started_at: String(now - 2 * 86400000) }),
    makeBrew({ id: "o1", coffee_id: "c1", brewer_id: "oxo", started_at: String(now - 1 * 86400000) }),
    makeBrew({ id: "p1", coffee_id: "c1", brewer_id: "v60", pending: true, started_at: String(now) }),
    makeBrew({ id: "x1", coffee_id: "other", brewer_id: "v60", started_at: String(now) }),
  ];

  it("scopes to a brewer when brewerId is given", () => {
    const result = previousBrewFor("c1", "v60", brews);
    expect(result?.id).toBe("v2");
  });

  it("ignores brewer scoping when brewerId is null (most recent across brewers)", () => {
    const result = previousBrewFor("c1", null, brews);
    expect(result?.id).toBe("o1");
  });

  it("excludes the given excludeId", () => {
    const result = previousBrewFor("c1", "v60", brews, "v2");
    expect(result?.id).toBe("v1");
  });

  it("only returns brews strictly older than beforeMs", () => {
    const result = previousBrewFor("c1", "v60", brews, undefined, now - 2 * 86400000);
    expect(result?.id).toBe("v1");
  });

  it("excludes pending brews", () => {
    const result = previousBrewFor("c1", "v60", brews);
    expect(result?.id).not.toBe("p1");
  });

  it("returns null when there is no matching brew", () => {
    expect(previousBrewFor("none", "v60", brews)).toBeNull();
    expect(previousBrewFor("c1", "gabi", brews)).toBeNull();
    expect(previousBrewFor("c1", "v60", [])).toBeNull();
  });
});

describe("recipeDelta", () => {
  const prev = makeBrew({ dose: 15, water: 240, temp: 96, grind: 22 });

  it("flags changed fields and leaves unchanged ones", () => {
    const rows = recipeDelta(prev, { dose: 15, water: 250, temp: 93, grind: 20 });
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey.dose.changed).toBe(false);
    expect(byKey.water.changed).toBe(true);
    expect(byKey.water.prev).toBe(240);
    expect(byKey.water.current).toBe(250);
    expect(byKey.temp.changed).toBe(true);
    expect(byKey.grind.changed).toBe(true);
  });

  it("reports no changes when the recipe is identical", () => {
    const rows = recipeDelta(prev, { dose: 15, water: 240, temp: 96, grind: 22 });
    expect(rows.every((r) => !r.changed)).toBe(true);
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

describe("per-roaster rest windows (setRoasterWindows / resolveWindows)", () => {
  // Every test restores the empty map so the rest of the suite keeps the defaults.
  const clear = () => setRoasterWindows({});

  it("falls back to the household windows when the roaster has no entry", () => {
    clear();
    const c = makeCoffee({ roaster: "Five Senses" });
    expect(resolveWindows(c)).toEqual({ rest: 28, peak: 56 });
  });

  it("returns the roaster's own window when there is one", () => {
    setRoasterWindows({ "five senses": { name: "Five Senses", rest_days: 14, peak_days: 42 } });
    expect(resolveWindows(makeCoffee({ roaster: "Five Senses" }))).toEqual({ rest: 14, peak: 42 });
    // A different roaster is untouched.
    expect(resolveWindows(makeCoffee({ roaster: "ONA" }))).toEqual({ rest: 28, peak: 56 });
    clear();
  });

  it("matches through roasterKey — case, whitespace and trailing suffixes", () => {
    setRoasterWindows({ "Five  Senses Coffee": { name: "Five Senses", rest_days: 14, peak_days: 42 } });
    for (const roaster of ["five senses", "FIVE SENSES", "Five Senses Roasters", "Five  Senses"]) {
      expect(resolveWindows(makeCoffee({ roaster })), roaster).toEqual({ rest: 14, peak: 42 });
    }
    clear();
  });

  it("drops malformed entries rather than letting NaN reach the maths", () => {
    setRoasterWindows({
      "": { name: "blank key", rest_days: 14, peak_days: 42 },
      nan: { name: "NaN", rest_days: NaN, peak_days: 42 },
      zero: { name: "Zero", rest_days: 0, peak_days: 42 },
      nopeak: { name: "No peak", rest_days: 14, peak_days: -1 },
      good: { name: "Good", rest_days: 14, peak_days: 42 },
    });
    expect(Object.keys(getRoasterWindows())).toEqual(["good"]);
    expect(resolveWindows(makeCoffee({ roaster: "NaN" })).rest).toBe(28);
    clear();
  });

  it("replaces the map by identity, so memo consumers invalidate", () => {
    const before = getRoasterWindows();
    setRoasterWindows({ ona: { name: "ONA", rest_days: 21, peak_days: 49 } });
    expect(getRoasterWindows()).not.toBe(before);
    clear();
  });

  it("treats null/undefined as no overrides", () => {
    setRoasterWindows({ ona: { name: "ONA", rest_days: 21, peak_days: 49 } });
    setRoasterWindows(null);
    expect(getRoasterWindows()).toEqual({});
  });

  it("coffeeStatus uses the roaster's window: same age, different verdicts", () => {
    setRoasterWindows({ "five senses": { name: "Five Senses", rest_days: 14, peak_days: 42 } });
    const overridden = makeCoffee({ roaster: "Five Senses Coffee", roasted_at: daysAgoDate(16) });
    const plain = makeCoffee({ roaster: "Some Other Roasters", roasted_at: daysAgoDate(16) });

    const a = coffeeStatus(overridden, []);
    expect(a.state).toBe("peak");
    expect(a.ready).toBe(true);
    expect(a.label).toBe("26d left");    // 42 - 16

    const b = coffeeStatus(plain, []);
    expect(b.state).toBe("resting");
    expect(b.label).toBe("Ready in 12d"); // 28 - 16
    clear();
  });

  it("the frozen branch counts down the roaster's rest", () => {
    setRoasterWindows({ "five senses": { name: "Five Senses", rest_days: 14, peak_days: 42 } });
    // Roasted 20d ago, frozen at day 10 and still in the freezer → paused at day 10,
    // so 4d short of this roaster's 14d rest (12d short of the 28d default).
    const c = makeCoffee({
      roaster: "Five Senses", roasted_at: daysAgoDate(20), frozen_at: daysAgoDate(10),
      grams: 100, frozen_grams: 100,
    });
    const st = coffeeStatus(c, []);
    expect(st.state).toBe("frozen");
    expect(st.day).toBe(10);
    expect(st.restLeft).toBe(4);
    expect(st.label).toBe("Ready in 4d");
    clear();
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

describe("todayISO / daysAgoISO", () => {
  it("todayISO matches the device-local date", () => {
    const d = new Date();
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(todayISO()).toBe(expected);
  });

  it("daysAgoISO(0) equals todayISO", () => {
    expect(daysAgoISO(0)).toBe(todayISO());
  });

  it("daysAgoISO counts back local calendar days", () => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 10);
    expect(daysAgoISO(10)).toBe(localIso(d));
  });
});

describe("roaster dedup helpers", () => {
  const shelf = [
    makeCoffee({ id: "r1", roaster: "Five Senses Coffee" }),
    makeCoffee({ id: "r2", roaster: "Five Senses Coffee" }),
    makeCoffee({ id: "r3", roaster: "five senses " }),
    makeCoffee({ id: "r4", roaster: "Market Lane" }),
  ];

  it("roasterKey ignores case, whitespace and trailing Coffee/Roasters words", () => {
    expect(roasterKey("Five Senses Coffee")).toBe("five senses");
    expect(roasterKey("  five   senses ")).toBe("five senses");
    expect(roasterKey("Proud Mary Roasters")).toBe("proud mary");
    expect(roasterKey("ONA Coffee Co.")).toBe("ona");
  });

  it("distinctRoasters collapses variants to the most-used spelling", () => {
    const distinct = distinctRoasters(shelf);
    expect(distinct).toContain("Five Senses Coffee");
    expect(distinct).toContain("Market Lane");
    expect(distinct).toHaveLength(2);
  });

  it("canonicalRoaster resolves a variant to the canonical spelling", () => {
    expect(canonicalRoaster("five senses", shelf)).toBe("Five Senses Coffee");
    expect(canonicalRoaster("FIVE SENSES ROASTERS", shelf)).toBe("Five Senses Coffee");
    expect(canonicalRoaster("Brand New Roaster", shelf)).toBe("Brand New Roaster");
    expect(canonicalRoaster("  ", shelf)).toBe("");
  });

  it("roasterSuggestions surfaces partial matches but not exact ones", () => {
    expect(roasterSuggestions("five", shelf)).toEqual(["Five Senses Coffee"]);
    expect(roasterSuggestions("Five Senses Coffee", shelf)).toEqual([]);
    expect(roasterSuggestions("zzz", shelf)).toEqual([]);
  });
});

describe("bagAvgRating", () => {
  const brews = [
    makeBrew({ id: "a", coffee_id: "c9", stars: 4, started_at: "1000" }),
    makeBrew({ id: "b", coffee_id: "c9", stars: 3, stars2: 5, started_at: "2000" }), // brewRating 4
    makeBrew({ id: "c", coffee_id: "c9", stars: null, pending: true, rated_at: null, started_at: "3000" }),
    makeBrew({ id: "d", coffee_id: "other", stars: 1, started_at: "4000" }),
    makeBrew({ id: "s1", coffee_id: "c9", stars: 5, session_id: "s", started_at: "5000" }),
    makeBrew({ id: "s2", coffee_id: "c9", stars: 2, session_id: "s", started_at: "5000" }),
  ];

  it("averages rated brews only, counting split halves separately", () => {
    // (4 + 4 + 5 + 2) / 4 = 3.75
    expect(bagAvgRating("c9", brews)).toBeCloseTo(3.75);
  });

  it("returns null with no rated brews", () => {
    expect(bagAvgRating("none", brews)).toBeNull();
  });
});

describe("sessionDeleteIds — session-sibling grouping for delete", () => {
  const brews = [
    makeBrew({ id: "solo", session_id: null }),
    makeBrew({ id: "s1", session_id: "sess-a" }),
    makeBrew({ id: "s2", session_id: "sess-a" }),
    makeBrew({ id: "other", session_id: "sess-b" }),
  ];

  it("groups every row sharing the target's session_id", () => {
    expect(sessionDeleteIds(brews, "s1")).toEqual(new Set(["s1", "s2"]));
    expect(sessionDeleteIds(brews, "s2")).toEqual(new Set(["s1", "s2"]));
  });

  it("falls back to just the target id for a solo (non-session) brew", () => {
    expect(sessionDeleteIds(brews, "solo")).toEqual(new Set(["solo"]));
  });

  it("falls back to just the target id when the id isn't found", () => {
    expect(sessionDeleteIds(brews, "missing")).toEqual(new Set(["missing"]));
  });

  it("doesn't pull in an unrelated session", () => {
    const ids = sessionDeleteIds(brews, "s1");
    expect(ids.has("other")).toBe(false);
  });
});

describe("shouldUnarchiveAfterDelete — auto-restore an archived bag (Bug 1c)", () => {
  it("restores when the coffee was archived and the delete leaves active grams", () => {
    const coffee = makeCoffee({ archived: true, grams: 200, frozen_grams: 0 });
    // No brews left consuming grams → activeGrams is the bag's full weight.
    expect(shouldUnarchiveAfterDelete(coffee, [])).toBe(true);
  });

  it("does not restore an already-unarchived coffee", () => {
    const coffee = makeCoffee({ archived: false, grams: 200 });
    expect(shouldUnarchiveAfterDelete(coffee, [])).toBe(false);
  });

  it("does not restore an archived coffee that still has no active grams left", () => {
    // All 200g consumed by remaining brews → activeGrams is 0 even after the delete.
    const coffee = makeCoffee({ id: "c9", archived: true, grams: 200 });
    const remaining = [makeBrew({ coffee_id: "c9", dose: 200, pending: false })];
    expect(shouldUnarchiveAfterDelete(coffee, remaining)).toBe(false);
  });

  it("returns false when there's no coffee (anchor brew's coffee not found)", () => {
    expect(shouldUnarchiveAfterDelete(undefined, [])).toBe(false);
  });
});

describe("shouldUnarchiveAfterEdit — auto-restore a finished bag when weight is edited up", () => {
  it("restores when the coffee was archived and the edit leaves active grams", () => {
    const coffee = makeCoffee({ archived: true, grams: 200, frozen_grams: 0 });
    expect(shouldUnarchiveAfterEdit(coffee, 25)).toBe(true);
  });

  it("does not restore when the edited remaining is 0", () => {
    const coffee = makeCoffee({ archived: true, grams: 200, frozen_grams: 0 });
    expect(shouldUnarchiveAfterEdit(coffee, 0)).toBe(false);
  });

  it("does not touch an unarchived coffee", () => {
    const coffee = makeCoffee({ archived: false, grams: 200, frozen_grams: 0 });
    expect(shouldUnarchiveAfterEdit(coffee, 25)).toBe(false);
  });

  it("does not restore when the new remaining is entirely frozen (no active grams)", () => {
    const coffee = makeCoffee({ archived: true, grams: 200, frozen_grams: 25 });
    expect(shouldUnarchiveAfterEdit(coffee, 25)).toBe(false);
  });

  it("restores when the new remaining exceeds the frozen portion", () => {
    const coffee = makeCoffee({ archived: true, grams: 200, frozen_grams: 25 });
    expect(shouldUnarchiveAfterEdit(coffee, 40)).toBe(true);
  });
});

describe("recipeRatio", () => {
  it("divides total water by dose", () => {
    expect(recipeRatio({ dose: 15, water: 240, bypass: 0 })).toBeCloseTo(16);
  });

  it("counts post-brew bypass toward the total", () => {
    expect(recipeRatio({ dose: 20, water: 200, bypass: 100 })).toBeCloseTo(15);
  });

  it("returns 0 rather than Infinity for a zero dose", () => {
    expect(recipeRatio({ dose: 0, water: 240, bypass: 0 })).toBe(0);
  });
});

describe("brewEditPatch", () => {
  const NOW = new Date(2026, 7, 5, 9, 0, 0).getTime();
  const START_ISO = "2026-08-01";
  const START_MS = new Date(2026, 7, 1).getTime();
  const RATED_MS = START_MS + 3_600_000;   // rated an hour after the pour

  function makeForm(overrides: Partial<BrewEditForm> = {}): BrewEditForm {
    return {
      date: START_ISO,
      dose: 15, water: 240, bypass: 0, temp: 96, grind: 22,
      water_type: "Filtered",
      stars: 4, stars2: 0, taster2: "",
      acidity: 3, sweetness: 3, body: 3, clarity: 4, note: "",
      ...overrides,
    };
  }

  function makeTarget(overrides: Partial<Brew> = {}): Brew {
    return makeBrew({ started_at: String(START_MS), rated_at: String(RATED_MS), ...overrides });
  }

  const run = (target: Brew, form: BrewEditForm, siblings?: Brew[]) =>
    brewEditPatch({ target, siblings: siblings ?? [target], form, meName: "Min", nowMs: NOW });

  it("recomputes ratio from the edited dose rather than echoing the stored one", () => {
    // The stored ratio (16) is deliberately inconsistent with dose 20 — the old
    // edit sheet carried it through untouched.
    const [{ patch }] = run(makeTarget({ ratio: 16 }), makeForm({ dose: 20, water: 240 }));
    expect(patch.ratio).toBeCloseTo(12);
  });

  it("includes bypass in both the patch and the ratio", () => {
    const [{ patch }] = run(makeTarget(), makeForm({ dose: 20, water: 200, bypass: 100 }));
    expect(patch.bypass).toBe(100);
    expect(patch.ratio).toBeCloseTo(15);
  });

  it("writes the water type exactly as drafted, with no household default", () => {
    // Regression: the draft used to be seeded with config.default_water, so a
    // brew with a blank water type silently acquired one on any save.
    const [{ patch }] = run(makeTarget({ water_type: "" }), makeForm({ water_type: "" }));
    expect(patch.water_type).toBe("");
  });

  it("keeps rated_at when a rated brew's stars are cleared to 0", () => {
    // rated_at set + stars null is the legitimate "resolved as not rated" state;
    // clearing it would push the brew back into the pending queue.
    const [{ patch }] = run(makeTarget(), makeForm({ stars: 0 }));
    expect(patch.stars).toBeNull();
    expect(patch.rated_at).toBe(String(RATED_MS));
  });

  it("rates a never-rated brew: sets rated_at to now and records taster1", () => {
    const target = makeTarget({ rated_at: null, stars: null, taster1: null, pending: true });
    const [{ patch }] = run(target, makeForm({ stars: 3.5 }));
    expect(patch.stars).toBe(3.5);
    expect(patch.rated_at).toBe(String(NOW));
    expect(patch.taster1).toBe("Min");
  });

  it("leaves an unrated brew pending when it is saved with no stars", () => {
    const target = makeTarget({ rated_at: null, stars: null, taster1: null, pending: true });
    const [{ patch }] = run(target, makeForm({ stars: 0 }));
    expect(patch.rated_at).toBeNull();
    expect(patch.stars).toBeNull();
    expect(patch.taster1).toBeUndefined();
  });

  it("never overwrites an existing taster1", () => {
    const [{ patch }] = run(makeTarget({ taster1: "Kris" }), makeForm({ stars: 5 }));
    expect(patch.taster1).toBeUndefined();
  });

  it("maps unset sensory scales and an empty note to null", () => {
    const [{ patch }] = run(makeTarget(), makeForm({ acidity: 0, sweetness: 2, body: 0, clarity: 0, note: "" }));
    expect(patch.acidity).toBeNull();
    expect(patch.sweetness).toBe(2);
    expect(patch.body).toBeNull();
    expect(patch.clarity).toBeNull();
    expect(patch.note).toBeNull();
  });

  it("nulls the second taster's name when their stars are cleared", () => {
    const [{ patch }] = run(makeTarget({ stars2: 4, taster2: "Kris" }), makeForm({ stars2: 0, taster2: "Kris" }));
    expect(patch.stars2).toBeNull();
    expect(patch.taster2).toBeNull();
  });

  it("moves every session row's date and shifts each one's own rated_at by the same delta", () => {
    const a = makeTarget({ id: "a", session_id: "s1", rate_for: null });
    const b = makeTarget({ id: "b", session_id: "s1", rate_for: "kris", rated_at: String(RATED_MS + 7_200_000) });
    const newISO = "2026-08-03";
    const newMs = new Date(2026, 7, 3).getTime();
    const delta = newMs - START_MS;

    const out = brewEditPatch({ target: a, siblings: [a, b], form: makeForm({ date: newISO }), meName: "Min", nowMs: NOW });

    expect(out.map((o) => o.id)).toEqual(["a", "b"]);
    expect(out[0].patch.started_at).toBe(String(newMs));
    expect(out[1].patch.started_at).toBe(String(newMs));
    expect(out[0].patch.rated_at).toBe(String(RATED_MS + delta));
    expect(out[1].patch.rated_at).toBe(String(RATED_MS + 7_200_000 + delta));
  });

  it("applies the rating to the targeted row only, leaving the sibling's untouched", () => {
    const a = makeTarget({ id: "a", session_id: "s1", stars: 4 });
    const b = makeTarget({ id: "b", session_id: "s1", stars: 2 });

    const out = brewEditPatch({ target: b, siblings: [a, b], form: makeForm({ stars: 5 }), meName: "Min", nowMs: NOW });

    expect(out[0].id).toBe("b");
    expect(out[0].patch.stars).toBe(5);
    expect(out[1].id).toBe("a");
    expect(out[1].patch).not.toHaveProperty("stars");
    // The pour itself is shared, so the recipe still fans out.
    expect(out[1].patch.dose).toBe(15);
  });

  it("re-derives rest_days only when the date actually moved", () => {
    const coffee = makeCoffee({ roasted_at: "2026-07-20", grams: 250 });
    const target = makeTarget({ rest_days: 12 });

    const unmoved = brewEditPatch({ target, siblings: [target], form: makeForm(), meName: "Min", nowMs: NOW, coffee, brews: [] });
    expect(unmoved[0].patch).not.toHaveProperty("rest_days");

    const moved = brewEditPatch({ target, siblings: [target], form: makeForm({ date: "2026-08-04" }), meName: "Min", nowMs: NOW, coffee, brews: [] });
    expect(moved[0].patch.rest_days).toBe(15);   // 20 Jul → 4 Aug
  });
});

import { describe, it, expect } from "vitest";
import {
  coffeeStatus, remainingGrams, frozenGramsOf, activeGrams, gramsUsed,
  setRestWindow, setPeakWindow, getRestWindow, getPeakWindow, todayMidnightMs,
  setRoasterWindows,
} from "@/lib/domain";
import { buildCoffeeStats } from "@/lib/domain/derive";
import type { Coffee, Brew } from "@/lib/types";

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

/**
 * The whole point of buildCoffeeStats is that it must be indistinguishable from the
 * per-coffee primitives it replaces. It shares statusFrom with coffeeStatus, so the
 * freshness branch is structurally guaranteed — these tests pin the bean arithmetic
 * and the single-pass session dedup, which are genuinely reimplemented.
 */
function expectParity(coffees: Coffee[], brews: Brew[], label: string) {
  const stats = buildCoffeeStats(coffees, brews, todayMidnightMs());
  expect(stats.size, `${label}: one entry per coffee`).toBe(coffees.length);
  for (const c of coffees) {
    const s = stats.get(c.id)!;
    expect(s, `${label}: ${c.id} present`).toBeDefined();
    expect(s.used, `${label}: ${c.id} used`).toBe(gramsUsed(c.id, brews));
    expect(s.remaining, `${label}: ${c.id} remaining`).toBe(remainingGrams(c, brews));
    expect(s.frozen, `${label}: ${c.id} frozen`).toBe(frozenGramsOf(c, brews));
    expect(s.active, `${label}: ${c.id} active`).toBe(activeGrams(c, brews));
    expect(s.status, `${label}: ${c.id} status`).toEqual(coffeeStatus(c, brews));
  }
}

describe("buildCoffeeStats — parity with the per-coffee primitives", () => {
  it("no brews at all", () => {
    expectParity([makeCoffee({ id: "a" }), makeCoffee({ id: "b" })], [], "empty");
  });

  it("coffee with no matching brews", () => {
    const coffees = [makeCoffee({ id: "a" }), makeCoffee({ id: "b" })];
    expectParity(coffees, [makeBrew({ id: "x", coffee_id: "a", dose: 18 })], "unmatched");
  });

  it("multiple coffees interleaved in one brew list", () => {
    const coffees = [
      makeCoffee({ id: "a", roasted_at: daysAgoDate(10) }),
      makeCoffee({ id: "b", roasted_at: daysAgoDate(40) }),
      makeCoffee({ id: "c", roasted_at: daysAgoDate(70) }),
    ];
    const brews = [
      makeBrew({ id: "1", coffee_id: "a", dose: 15 }),
      makeBrew({ id: "2", coffee_id: "c", dose: 20 }),
      makeBrew({ id: "3", coffee_id: "b", dose: 17 }),
      makeBrew({ id: "4", coffee_id: "a", dose: 16 }),
      makeBrew({ id: "5", coffee_id: "c", dose: 12 }),
    ];
    expectParity(coffees, brews, "interleaved");
  });

  it("split sessions count the dose once, per coffee", () => {
    const coffees = [makeCoffee({ id: "a" }), makeCoffee({ id: "b" })];
    const brews = [
      // Same session, two rows — one physical dose.
      makeBrew({ id: "1", coffee_id: "a", dose: 30, session_id: "s1" }),
      makeBrew({ id: "2", coffee_id: "a", dose: 30, session_id: "s1" }),
      // A different session on the same coffee still counts.
      makeBrew({ id: "3", coffee_id: "a", dose: 22, session_id: "s2" }),
      // Same session id on a *different* coffee must not be swallowed by a's set.
      makeBrew({ id: "4", coffee_id: "b", dose: 19, session_id: "s1" }),
      makeBrew({ id: "5", coffee_id: "b", dose: 19, session_id: "s1" }),
      // Null session ids are always counted individually.
      makeBrew({ id: "6", coffee_id: "b", dose: 14, session_id: null }),
      makeBrew({ id: "7", coffee_id: "b", dose: 14, session_id: null }),
    ];
    expectParity(coffees, brews, "sessions");

    const stats = buildCoffeeStats(coffees, brews, todayMidnightMs());
    expect(stats.get("a")!.used).toBe(52);       // 30 (once) + 22
    expect(stats.get("b")!.used).toBe(19 + 28);  // 19 (once) + 14 + 14
  });

  it("over-consumed bag floors at zero rather than going negative", () => {
    const c = makeCoffee({ id: "a", grams: 50 });
    const brews = [
      makeBrew({ id: "1", coffee_id: "a", dose: 30 }),
      makeBrew({ id: "2", coffee_id: "a", dose: 40 }),
    ];
    expectParity([c], brews, "over-consumed");
    expect(buildCoffeeStats([c], brews, todayMidnightMs()).get("a")!.remaining).toBe(0);
  });

  it("frozen grams are clamped to what is actually left", () => {
    // 250g bag, 200g nominally frozen, but 100g already brewed → only 150g remains,
    // so frozen must clamp to 150 and active to 0.
    const c = makeCoffee({ id: "a", grams: 250, frozen_grams: 200, frozen_at: daysAgoDate(20) });
    const brews = [makeBrew({ id: "1", coffee_id: "a", dose: 100 })];
    expectParity([c], brews, "clamped");
    const s = buildCoffeeStats([c], brews, todayMidnightMs()).get("a")!;
    expect(s.remaining).toBe(150);
    expect(s.frozen).toBe(150);
    expect(s.active).toBe(0);
  });

  it("missing bag size falls back to the 250g default", () => {
    const c = makeCoffee({ id: "a", grams: 0 });
    expectParity([c], [makeBrew({ id: "1", coffee_id: "a", dose: 25 })], "default-grams");
    expect(buildCoffeeStats([c], [], todayMidnightMs()).get("a")!.remaining).toBe(250);
  });

  it("covers every freshness state, frozen and unfrozen", () => {
    const coffees = [
      makeCoffee({ id: "resting", roasted_at: daysAgoDate(10) }),
      makeCoffee({ id: "peak", roasted_at: daysAgoDate(34) }),
      makeCoffee({ id: "past", roasted_at: daysAgoDate(90) }),
      // Fully frozen: nothing active, so the "frozen" branch with restLeft.
      makeCoffee({ id: "frozen-resting", roasted_at: daysAgoDate(50), grams: 100, frozen_grams: 100, frozen_at: daysAgoDate(45) }),
      makeCoffee({ id: "frozen-ready", roasted_at: daysAgoDate(60), grams: 100, frozen_grams: 100, frozen_at: daysAgoDate(20) }),
      // Partially frozen: active > 0 and frozen > 0, so calendar age drives the clock.
      makeCoffee({ id: "part-frozen", roasted_at: daysAgoDate(40), grams: 250, frozen_grams: 100, frozen_at: daysAgoDate(30) }),
      // Thawed: frozen span subtracted, nothing in the freezer now.
      makeCoffee({ id: "thawed", roasted_at: daysAgoDate(60), frozen_at: daysAgoDate(50), thawed_at: daysAgoDate(20), frozen_grams: 0 }),
      // Out of beans entirely.
      makeCoffee({ id: "empty", roasted_at: daysAgoDate(30), grams: 20 }),
    ];
    const brews = [makeBrew({ id: "1", coffee_id: "empty", dose: 20 })];

    expectParity(coffees, brews, "states");

    // Guard against the fixtures silently collapsing to one state.
    const seen = new Set(
      [...buildCoffeeStats(coffees, brews, todayMidnightMs()).values()].map((s) => s.status.state),
    );
    expect(seen).toEqual(new Set(["resting", "peak", "past", "frozen"]));
  });

  it("respects non-default rest/peak windows", () => {
    const rest = getRestWindow(), peak = getPeakWindow();
    try {
      setRestWindow(7);
      setPeakWindow(14);
      const coffees = [
        makeCoffee({ id: "a", roasted_at: daysAgoDate(3) }),
        makeCoffee({ id: "b", roasted_at: daysAgoDate(10) }),
        makeCoffee({ id: "c", roasted_at: daysAgoDate(30) }),
      ];
      expectParity(coffees, [], "windows");
    } finally {
      setRestWindow(rest);
      setPeakWindow(peak);
    }
  });

  it("applies per-roaster windows within a single pass", () => {
    const coffees = [
      makeCoffee({ id: "fast", roaster: "Five Senses Coffee", roasted_at: daysAgoDate(16) }),
      makeCoffee({ id: "slow", roaster: "Some Other Roasters", roasted_at: daysAgoDate(16) }),
    ];
    const byRoaster = { "five senses": { name: "Five Senses", rest_days: 14, peak_days: 42 } };
    const stats = buildCoffeeStats(coffees, [], todayMidnightMs(), 28, 56, byRoaster);

    // Same roast date, different verdicts — the override only touches its own roaster.
    expect(stats.get("fast")!.status.state).toBe("peak");
    expect(stats.get("fast")!.status.label).toBe("26d left");
    expect(stats.get("slow")!.status.state).toBe("resting");
    expect(stats.get("slow")!.status.label).toBe("Ready in 12d");

    // And it stays in step with coffeeStatus, which reads the module-level map.
    try {
      setRoasterWindows(byRoaster);
      expectParity(coffees, [], "per-roaster");
    } finally {
      setRoasterWindows({});
    }
  });

  it("holds across a pseudo-random spread of shelves", () => {
    // Deterministic LCG — reproducible, but wide enough to catch arithmetic that
    // happens to agree on the hand-written cases above.
    let seed = 20260728;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];

    for (let trial = 0; trial < 40; trial++) {
      const coffees: Coffee[] = [];
      for (let i = 0; i < 1 + Math.floor(rnd() * 6); i++) {
        const frozenAt = rnd() < 0.4 ? daysAgoDate(Math.floor(rnd() * 60)) : null;
        coffees.push(makeCoffee({
          id: `c${i}`,
          roasted_at: daysAgoDate(Math.floor(rnd() * 120)),
          grams: pick([0, 50, 100, 250, 340, 1000]),
          frozen_grams: pick([0, 0, 50, 100, 250]),
          frozen_at: frozenAt,
          thawed_at: frozenAt && rnd() < 0.5 ? daysAgoDate(Math.floor(rnd() * 20)) : null,
          archived: rnd() < 0.2,
        }));
      }
      const brews: Brew[] = [];
      for (let j = 0; j < Math.floor(rnd() * 25); j++) {
        brews.push(makeBrew({
          id: `b${j}`,
          coffee_id: pick(coffees).id,
          dose: pick([0, 12, 15, 18, 22, 30]),
          session_id: rnd() < 0.3 ? pick(["s1", "s2", "s3"]) : null,
        }));
      }
      expectParity(coffees, brews, `trial ${trial}`);
    }
  });
});

describe("buildCoffeeStats — complexity", () => {
  it("scans the brew list once regardless of coffee count", () => {
    // Guards the actual point of this module. A regression to the nested primitives
    // would touch each brew once per coffee, so the access count would scale with C.
    const coffees = Array.from({ length: 50 }, (_, i) => makeCoffee({ id: `c${i}` }));
    const brews = Array.from({ length: 500 }, (_, i) =>
      makeBrew({ id: `b${i}`, coffee_id: `c${i % 50}` }));

    let reads = 0;
    const counted = brews.map((b) => new Proxy(b, {
      get(t, k, r) { if (k === "coffee_id") reads++; return Reflect.get(t, k, r); },
    }));

    buildCoffeeStats(coffees, counted, todayMidnightMs());
    // One read per brew (plus the session branch, which these fixtures don't take).
    expect(reads).toBe(brews.length);
  });
});

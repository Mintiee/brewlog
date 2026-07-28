import type { Coffee, Brew, FreshStatus } from "@/lib/types";
import { statusFrom, todayMidnightMs, getRestWindow, getPeakWindow } from "@/lib/domain";

/**
 * Per-coffee bean weights and freshness, computed once for a whole list.
 *
 * Why this exists
 * ---------------
 * The single-coffee primitives in lib/domain/index.ts each scan the entire `brews`
 * array, and they nest:
 *
 *   coffeeStatus  -> frozenGramsOf + activeGrams
 *   activeGrams   -> remainingGrams + frozenGramsOf
 *   frozenGramsOf -> remainingGrams
 *   remainingGrams-> gramsUsed        (the actual O(brews) scan)
 *
 * so one coffeeStatus call is three full passes over every brew ever logged. Shelf
 * called that per coffee, again per row, and again twice per comparison inside a sort
 * comparator — against a 2000-row brew fetch, that's on the order of a million array
 * iterations for a single render of the tab.
 *
 * buildCoffeeStats does one pass over `brews` and one over `coffees` instead: O(B + C).
 * The freshness calculation itself is not reimplemented here — it calls the same
 * `statusFrom` that `coffeeStatus` calls, so the two cannot drift.
 */
export interface CoffeeStat {
  /** Grams consumed by logged brews (split sessions counted once). */
  used: number;
  /** Bag size minus used, floored at 0. */
  remaining: number;
  /** Of the remaining, how much is in the freezer. */
  frozen: number;
  /** Of the remaining, how much is drinkable now. */
  active: number;
  status: FreshStatus;
}

/** An empty stat, for coffees absent from a map (defensive; callers shouldn't need it). */
export const EMPTY_STAT: CoffeeStat = {
  used: 0, remaining: 0, frozen: 0, active: 0,
  status: { state: "resting", label: "", day: 0, ready: false, pct: 0 },
};

/**
 * Grams used per coffee, in a single pass.
 *
 * Mirrors `gramsUsed` exactly, including its split-session rule: when several brew
 * rows share a session_id the dose is physical and must be counted once, while cups
 * and ratings stay per-row. The seen-set is kept per coffee, as in the original.
 */
function gramsUsedByCoffee(brews: Brew[]): Map<string, number> {
  const used = new Map<string, number>();
  const seenSessions = new Map<string, Set<string>>();

  for (const b of brews) {
    const id = b.coffee_id;
    const session = b.session_id;
    if (session) {
      let seen = seenSessions.get(id);
      if (!seen) { seen = new Set(); seenSessions.set(id, seen); }
      if (seen.has(session)) continue;
      seen.add(session);
    }
    used.set(id, (used.get(id) ?? 0) + (b.dose || 0));
  }
  return used;
}

/**
 * Most recent non-pending brew per coffee, in a single pass.
 *
 * Equivalent to calling `lastBrewOf` for each coffee, which filters and sorts the whole
 * brew list every time — once per row in the brew picker. Ties resolve to the earlier
 * entry, matching the stable descending sort in `lastBrewOf`.
 */
export function lastBrewByCoffee(brews: Brew[]): Map<string, Brew> {
  const best = new Map<string, Brew>();
  const bestTs = new Map<string, number>();

  for (const b of brews) {
    if (b.pending) continue;
    const id = b.coffee_id;
    const ts = typeof b.started_at === "number" ? b.started_at : parseInt(b.started_at, 10);
    const prev = bestTs.get(id);
    if (prev === undefined || ts > prev) {
      bestTs.set(id, ts);
      best.set(id, b);
    }
  }
  return best;
}

/**
 * Weights + freshness for every coffee, keyed by id.
 *
 * `todayMs` is passed in rather than read from the clock so the result is a pure
 * function of its inputs and therefore safely memoisable — callers should use
 * useCoffeeStats (lib/hooks/useCoffeeStats.ts), which re-derives only when the data
 * changes or the local day rolls over.
 */
export function buildCoffeeStats(
  coffees: Coffee[],
  brews: Brew[],
  todayMs: number = todayMidnightMs(),
  rest: number = getRestWindow(),
  peak: number = getPeakWindow(),
): Map<string, CoffeeStat> {
  const used = gramsUsedByCoffee(brews);
  const stats = new Map<string, CoffeeStat>();

  for (const c of coffees) {
    const u = used.get(c.id) ?? 0;
    // Same arithmetic as remainingGrams / frozenGramsOf / activeGrams, minus the scans.
    const remaining = Math.max(0, (c.grams || 250) - u);
    const frozen = Math.max(0, Math.min(c.frozen_grams || 0, remaining));
    const active = Math.max(0, remaining - frozen);
    stats.set(c.id, {
      used: u,
      remaining,
      frozen,
      active,
      status: statusFrom(c, frozen, active, todayMs, rest, peak),
    });
  }
  return stats;
}

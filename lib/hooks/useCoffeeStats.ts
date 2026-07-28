"use client";
import { useMemo } from "react";
import { buildCoffeeStats, type CoffeeStat } from "@/lib/domain/derive";
import { todayMidnightMs, getRestWindow, getPeakWindow } from "@/lib/domain";
import type { Coffee, Brew } from "@/lib/types";

/**
 * Memoised per-coffee weights + freshness for a whole list. See buildCoffeeStats.
 *
 * The memo key includes today's local midnight rather than the current time, so the
 * result is reused for the whole day and recomputed when the date rolls over — a
 * coffee's `day` count and resting/peak/past state only change at midnight anyway.
 * Computing that key costs one Date allocation per render, which is far cheaper than
 * the scans it avoids.
 *
 * The freshness windows are read explicitly instead of being left to buildCoffeeStats'
 * defaults: they live in module-level state in lib/domain (set from config on load),
 * so reading them here is what makes a Settings change actually invalidate the memo.
 */
export function useCoffeeStats(coffees: Coffee[], brews: Brew[]): Map<string, CoffeeStat> {
  const today = todayMidnightMs();
  const rest = getRestWindow();
  const peak = getPeakWindow();
  return useMemo(
    () => buildCoffeeStats(coffees, brews, today, rest, peak),
    [coffees, brews, today, rest, peak],
  );
}

/**
 * Converts an ImportedCoffee into a full Coffee domain object.
 * Replicates the logic in AddCoffee.commit() so imports are consistent with
 * manually-added coffees (canonicalRoaster, coffeeColor, originCode, defaults).
 */
import type { Coffee, Roast } from "@/lib/types";
import { canonicalRoaster, originCode, todayISO } from "@/lib/domain";
import { coffeeColor } from "@/lib/flavour";
import type { ImportedCoffee } from "./types";

const ROAST_ENUM: Roast[] = ["light", "medium-light", "medium", "medium-dark", "dark"];

/** Normalize any roast string to our Roast enum, falling back to "light". */
export function normalizeRoast(raw: string | undefined): Roast {
  if (!raw) return "light";
  const s = raw.toLowerCase().trim();
  // Exact enum matches
  if (ROAST_ENUM.includes(s as Roast)) return s as Roast;
  // Common aliases / partial matches
  if (s.includes("dark")) return "dark";
  if (s.includes("medium-dark") || s.includes("medium dark") || s.includes("vien")) return "medium-dark";
  if (s.includes("full city")) return "medium";
  if (s.includes("city+") || s.includes("city plus")) return "medium";
  if (s.includes("medium-light") || s.includes("moderate-light") || s.includes("city roast")) return "medium-light";
  if (s.includes("medium")) return "medium";
  if (s.includes("cinnamon") || s.includes("american") || s.includes("new england") || s.includes("half city")) return "light";
  if (s.includes("light")) return "light";
  return "light";
}

/**
 * Turn an ImportedCoffee into a Coffee ready for addCoffee / insertCoffees.
 * @param imported  The normalized row from a parser.
 * @param existing  The current household shelf — used for roaster canonicalization.
 */
export function toCoffee(imported: ImportedCoffee, existing: Coffee[]): Coffee {
  const notes = (imported.notes ?? []).filter(Boolean);
  const origin = imported.origin?.trim() || "—";
  const roasted_at = imported.roasted_at?.trim() || todayISO();

  return {
    id: crypto.randomUUID(),
    // No household_id here — AppContext.importCoffees() injects it (like addCoffee does).
    roaster: canonicalRoaster(imported.roaster || "Unknown", existing) || "Unknown",
    name: imported.name?.trim() || "Untitled",
    origin,
    region: imported.region?.trim() || origin,
    varietal: imported.varietal?.trim() || "—",
    process: imported.process?.trim() || "Washed",
    roast: normalizeRoast(imported.roast),
    roasted_at,
    rest_days: 28,
    peak_days: 56,
    grams: imported.grams != null && imported.grams > 0 ? imported.grams : 250,
    frozen_grams: 0,
    frozen_at: null,
    thawed_at: null,
    archived: imported.archived ?? false,
    notes,
    color: coffeeColor(notes),
    cc: originCode(imported.origin ?? null),
  };
}

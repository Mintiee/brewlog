/**
 * Duplicate detection for imported coffees.
 * Matches on roasterKey + normalized name, plus roasted_at when present on both.
 * Uses the same roasterKey logic as AddCoffee.commit() (canonicalRoaster).
 */
import type { Coffee } from "@/lib/types";
import { roasterKey } from "@/lib/domain";
import type { ImportedCoffee, ReviewCoffee } from "./types";

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Mark each imported row as duplicate if a coffee with the same
 * roasterKey + normalized name (and matching roasted_at when both present)
 * already exists on the shelf.
 */
export function markDuplicates(imported: ImportedCoffee[], existing: Coffee[]): ReviewCoffee[] {
  return imported.map((ic) => {
    const rk = roasterKey(ic.roaster || "");
    const nm = normalizeName(ic.name || "");

    const isDuplicate = existing.some((c) => {
      if (roasterKey(c.roaster) !== rk) return false;
      if (normalizeName(c.name) !== nm) return false;
      // When the import has a roasted_at date, also require a date match.
      if (ic.roasted_at && c.roasted_at) return ic.roasted_at === c.roasted_at;
      return true;
    });

    return { ...ic, isDuplicate };
  });
}

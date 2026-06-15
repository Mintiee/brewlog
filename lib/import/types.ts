/**
 * Shared types for the import pipeline.
 * Parsers (beanconqueror.ts, csv.ts, LLM route) all emit ImportedCoffee[].
 * materialize.ts converts these to full Coffee objects; dedup.ts flags dupes.
 */

export interface ImportedCoffee {
  roaster: string;
  name: string;
  origin?: string;
  region?: string;
  varietal?: string;
  process?: string;
  /** Free text or our enum value — normalized to Roast in materialize.ts */
  roast?: string;
  /** ISO yyyy-mm-dd; defaults to today when absent */
  roasted_at?: string;
  grams?: number;
  notes?: string[];
  /** true = finished/archived bag (maps from BC "finished") */
  archived?: boolean;
}

/** Parsed result from any source adapter. */
export interface ParseResult {
  coffees: ImportedCoffee[];
  /** Human-readable descriptions of rows/fields that were skipped or corrected. */
  warnings: string[];
}

/** An ImportedCoffee with a duplicate-detection flag added by markDuplicates(). */
export interface ReviewCoffee extends ImportedCoffee {
  /** True if a coffee with the same roaster+name (+roasted_at when present) already
   *  exists on the household shelf. Default-excluded in the review UI. */
  isDuplicate: boolean;
}

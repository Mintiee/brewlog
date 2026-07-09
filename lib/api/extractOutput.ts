/**
 * Validate/coerce the LLM's parsed JSON for /api/extract into the shape the
 * client expects, regardless of what the model actually returned.
 */
import { parseVarietals } from "@/lib/varietal";

export type Roast = "light" | "medium" | "dark";
const ROASTS = new Set<string>(["light", "medium", "dark"]);

export interface ExtractedCoffee {
  roaster: string;
  name: string;
  origin: string;
  region: string;
  varietals: string[];
  process: string;
  roast: Roast | null;
  roastDaysAgo: number | null;
  notes: string[];
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Tolerant coercion: unrecognised/malformed fields fall back to their safe default rather than propagating. */
export function sanitizeExtractOutput(data: unknown): ExtractedCoffee {
  const rec = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;

  const roast = typeof rec.roast === "string" && ROASTS.has(rec.roast) ? (rec.roast as Roast) : null;
  const roastDaysAgo =
    typeof rec.roastDaysAgo === "number" && Number.isInteger(rec.roastDaysAgo) ? rec.roastDaysAgo : null;
  const notes = Array.isArray(rec.notes) ? rec.notes.filter((n): n is string => typeof n === "string") : [];
  // Accept the array shape; tolerate a legacy/old-model single string by splitting it.
  const varietals = Array.isArray(rec.varietals)
    ? rec.varietals.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean)
    : parseVarietals(str(rec.varietal));

  return {
    roaster: str(rec.roaster),
    name: str(rec.name),
    origin: str(rec.origin),
    region: str(rec.region),
    varietals,
    process: str(rec.process),
    roast,
    roastDaysAgo,
    notes,
  };
}

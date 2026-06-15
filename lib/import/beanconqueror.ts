/**
 * Bean Conqueror .json import adapter.
 *
 * BC's export format (from the Ionic app's backup) is a JSON object with top-level
 * keys BEANS, BREWS, PREPARATION, MILL. v1 reads BEANS only.
 *
 * Bean fields used (from src/classes/bean/bean.ts + src/interfaces/bean/iBeanInformation.ts):
 *   name, roaster, roastingDate, roast (ROASTS_ENUM), weight, finished, note,
 *   aromatics, bean_information[].{ country, region, variety, processing }
 *
 * ROASTS_ENUM → our Roast enum mapping (from src/enums/beans/roasts.ts):
 *   light:        Cinnamon Roast, American Roast, New England Roast, Half City Roast
 *   medium-light: Moderate-Light Roast, City roast
 *   medium:       City+ Roast, Full City Roast
 *   medium-dark:  Full City + Roast, Vienna Roast
 *   dark:         French Roast, Italian Roast
 *   fallback:     light (Unknown, Custom, anything else)
 */
import type { ParseResult } from "./types";

/** Map a Bean Conqueror ROASTS_ENUM string to our roast value. */
function bcRoastToOurs(bcRoast: string | undefined): string {
  switch (bcRoast) {
    case "Cinnamon Roast":
    case "American Roast":
    case "New England Roast":
    case "Half City Roast":
      return "light";
    case "Moderate-Light Roast":
    case "City roast":
      return "medium-light";
    case "City+ Roast":
    case "Full City Roast":
      return "medium";
    case "Full City + Roast":
    case "Vienna Roast":
      return "medium-dark";
    case "French Roast":
    case "Italian Roast":
      return "dark";
    default:
      return "light";
  }
}

/** Parse an ISO or datetime string to a YYYY-MM-DD date. Returns undefined on failure. */
function parseDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  // Handle full ISO datetime ("2025-01-15T00:00:00.000Z") and plain date ("2025-01-15")
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  // Epoch ms number stored as string
  const ms = Number(raw);
  if (!isNaN(ms) && ms > 0) {
    const d = new Date(ms);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  return undefined;
}

/**
 * Parse a Bean Conqueror .json export.
 * @param json The parsed JSON object (already JSON.parse'd) or raw string.
 */
export function parseBeanConqueror(json: unknown): ParseResult {
  const warnings: string[] = [];

  // Accept either a raw JSON string or an already-parsed object
  let data: unknown = json;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return { coffees: [], warnings: ["Could not parse file as JSON."] };
    }
  }

  if (!data || typeof data !== "object") {
    return { coffees: [], warnings: ["File does not contain a JSON object."] };
  }

  const root = data as Record<string, unknown>;

  // Support both BEANS (uppercase) and beans (lowercase) keys
  const rawBeans = root["BEANS"] ?? root["beans"];
  if (!Array.isArray(rawBeans)) {
    return { coffees: [], warnings: ["File does not contain a BEANS array. Is this a Bean Conqueror backup file?"] };
  }

  if (rawBeans.length === 0) {
    return { coffees: [], warnings: ["The BEANS array is empty — nothing to import."] };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const coffees = rawBeans.map((bean: any, idx: number): import("./types").ImportedCoffee | null => {
    if (!bean || typeof bean !== "object") {
      warnings.push(`Row ${idx + 1}: skipped (not an object)`);
      return null;
    }

    const name: string = (bean.name ?? "").trim();
    const roaster: string = (bean.roaster ?? "").trim();

    if (!name && !roaster) {
      warnings.push(`Row ${idx + 1}: skipped (no name or roaster)`);
      return null;
    }

    // Pull origin/region/varietal/process from the first bean_information entry
    const infos = Array.isArray(bean.bean_information) ? bean.bean_information : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const info: any = infos[0] ?? {};

    // Notes: combine aromatics + cupped_flavor predefined/custom flavors
    const noteParts: string[] = [];
    if (bean.aromatics && typeof bean.aromatics === "string") {
      // aromatics is a comma-separated string in BC
      noteParts.push(...bean.aromatics.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean));
    }
    // cupped_flavor may have predefined_flavors[] or custom_flavors[]
    if (bean.cupped_flavor && typeof bean.cupped_flavor === "object") {
      const cf = bean.cupped_flavor as Record<string, unknown>;
      for (const key of ["predefined_flavors", "custom_flavors"]) {
        if (Array.isArray(cf[key])) {
          noteParts.push(...(cf[key] as unknown[]).map((f) => (typeof f === "string" ? f : "")).filter(Boolean));
        }
      }
    }

    return {
      name: name || "Untitled",
      roaster: roaster || "Unknown",
      origin: (info.country ?? "").trim() || undefined,
      region: (info.region ?? "").trim() || undefined,
      varietal: (info.variety ?? "").trim() || undefined,
      process: (info.processing ?? "").trim() || undefined,
      roast: bcRoastToOurs(bean.roast),
      roasted_at: parseDate(bean.roastingDate),
      grams: bean.weight > 0 ? Number(bean.weight) : undefined,
      notes: [...new Set(noteParts)],  // deduplicate
      archived: bean.finished === true,
    };
  }).filter((c): c is NonNullable<typeof c> => c !== null);

  return { coffees, warnings };
}

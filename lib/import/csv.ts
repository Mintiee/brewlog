/**
 * Generic CSV import adapter (for LLM-generated CSV from prompt.ts).
 * Uses papaparse for robust parsing. Headers are case/whitespace-insensitive.
 *
 * Canonical columns (in order for the template):
 *   roaster, name, origin, region, varietal, process, roast, roasted_at, grams, notes
 *
 * `notes` is semicolon-separated (e.g. "cherry;chocolate;caramel") to avoid
 * conflicts with CSV commas.
 */
import Papa from "papaparse";
import type { ParseResult, ImportedCoffee } from "./types";

export const CSV_HEADERS = ["roaster", "name", "origin", "region", "varietal", "process", "roast", "roasted_at", "grams", "notes"] as const;

export const CSV_EXAMPLE_ROW =
  "Five Senses,Ethiopia Kochere,Ethiopia,Yirgacheffe,Heirloom,Washed,light,2025-10-01,250,cherry;jasmine;chocolate";

/** Normalize a CSV header to a canonical key (lowercase, no spaces/underscores). */
function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[\s_-]+/g, "");
}

/** Map a normalized header to our canonical field name, or null if unrecognized. */
function mapHeader(normalized: string): typeof CSV_HEADERS[number] | null {
  const MAP: Record<string, typeof CSV_HEADERS[number]> = {
    roaster: "roaster",
    name: "name",
    coffeename: "name",
    origin: "origin",
    country: "origin",
    region: "region",
    varietal: "varietal",
    variety: "varietal",
    process: "process",
    processing: "process",
    roast: "roast",
    roastlevel: "roast",
    roasteddate: "roasted_at",
    roastedat: "roasted_at",
    roastdate: "roasted_at",
    grams: "grams",
    weight: "grams",
    notes: "notes",
    tastenotices: "notes",
    flavors: "notes",
    flavours: "notes",
  };
  return MAP[normalized] ?? null;
}

export function parseCsv(text: string): ParseResult {
  const warnings: string[] = [];

  const result = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (result.errors.length) {
    const fatalErrors = result.errors.filter((e) => e.type === "FieldMismatch" || e.type === "Delimiter");
    if (fatalErrors.length > 3) {
      return { coffees: [], warnings: [`CSV parse failed: ${fatalErrors[0].message}`] };
    }
    fatalErrors.forEach((e) => warnings.push(`Row ${(e.row ?? 0) + 2}: ${e.message}`));
  }

  if (!result.data.length) {
    return { coffees: [], warnings: ["CSV file is empty or has no data rows."] };
  }

  // Build header map: original header → canonical field
  const rawHeaders = Object.keys(result.data[0] ?? {});
  const headerMap = new Map<string, typeof CSV_HEADERS[number]>();
  const unrecognized: string[] = [];

  rawHeaders.forEach((h) => {
    const mapped = mapHeader(normalizeHeader(h));
    if (mapped) {
      if (!headerMap.has(mapped)) headerMap.set(mapped, mapped);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (headerMap as any).__rawMap = (headerMap as any).__rawMap ?? {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (headerMap as any).__rawMap[h] = mapped;
    } else {
      unrecognized.push(h);
    }
  });

  // Build a simpler lookup: raw header name → canonical field
  const rawToCanon = new Map<string, typeof CSV_HEADERS[number]>();
  rawHeaders.forEach((h) => {
    const mapped = mapHeader(normalizeHeader(h));
    if (mapped) rawToCanon.set(h, mapped);
  });

  if (unrecognized.length) {
    warnings.push(`Unrecognized columns (ignored): ${unrecognized.join(", ")}`);
  }

  const hasName = [...rawToCanon.values()].includes("name");
  const hasRoaster = [...rawToCanon.values()].includes("roaster");
  if (!hasName || !hasRoaster) {
    return { coffees: [], warnings: [`CSV must have at least a "name" and "roaster" column. Found: ${rawHeaders.join(", ")}`] };
  }

  const coffees: ImportedCoffee[] = [];

  result.data.forEach((row, rowIdx) => {
    // Map raw column names to canonical fields
    const canon: Partial<Record<typeof CSV_HEADERS[number], string>> = {};
    for (const [raw, field] of rawToCanon) {
      const v = (row[raw] ?? "").trim();
      if (v) canon[field] = v;
    }

    const name = canon.name ?? "";
    const roaster = canon.roaster ?? "";

    if (!name && !roaster) {
      warnings.push(`Row ${rowIdx + 2}: skipped (no name or roaster)`);
      return;
    }

    // Parse grams
    let grams: number | undefined;
    if (canon.grams) {
      const g = parseFloat(canon.grams.replace(/[^0-9.]/g, ""));
      if (!isNaN(g) && g > 0) grams = g;
    }

    // Parse roasted_at — accept YYYY-MM-DD or flexible dates
    let roasted_at: string | undefined;
    if (canon.roasted_at) {
      const m = canon.roasted_at.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (m) {
        roasted_at = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
      } else {
        warnings.push(`Row ${rowIdx + 2}: unrecognized roasted_at format "${canon.roasted_at}" (skipped date)`);
      }
    }

    // Parse notes (semicolon-separated)
    const notes = canon.notes
      ? canon.notes.split(/[;,]/).map((s) => s.trim()).filter(Boolean)
      : [];

    coffees.push({
      roaster: roaster || "Unknown",
      name: name || "Untitled",
      origin: canon.origin || undefined,
      region: canon.region || undefined,
      varietal: canon.varietal || undefined,
      process: canon.process || undefined,
      roast: canon.roast || undefined,
      roasted_at,
      grams,
      notes,
    });
  });

  return { coffees, warnings };
}

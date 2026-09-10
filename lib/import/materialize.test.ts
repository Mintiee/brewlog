import { describe, it, expect } from "vitest";
import { toCoffee, normalizeRoast, ROAST_ENUM } from "./materialize";
import { todayISO } from "@/lib/domain";
import type { Coffee } from "@/lib/types";
import type { ImportedCoffee } from "./types";

function makeCoffee(overrides: Partial<Coffee> = {}): Coffee {
  return {
    id: "c1", household_id: "h1", roaster: "Five Senses", name: "Ethiopia Kochere",
    origin: "Ethiopia", region: "Yirgacheffe", varietals: ["Heirloom"], process: "Washed",
    roast: "light", roasted_at: "2025-10-01",
    rest_days: 28, peak_days: 56, grams: 250, frozen_grams: 0,
    frozen_at: null, thawed_at: null, archived: false,
    notes: [], cc: "et",
    ...overrides,
  };
}

function makeImported(overrides: Partial<ImportedCoffee> = {}): ImportedCoffee {
  return {
    roaster: "Acme Roasters",
    name: "Test Coffee",
    ...overrides,
  };
}

describe("normalizeRoast", () => {
  it("passes through exact enum values (case/whitespace-insensitive)", () => {
    for (const r of ROAST_ENUM) {
      expect(normalizeRoast(r)).toBe(r);
      expect(normalizeRoast(` ${r.toUpperCase()} `)).toBe(r);
    }
  });

  const aliasCases: [string | undefined, string][] = [
    ["City+ Roast", "medium"],
    ["Vienna Roast", "medium-dark"],
  ];
  it.each(aliasCases)("normalizes alias %s to %s", (raw, expected) => {
    expect(normalizeRoast(raw)).toBe(expected);
  });

  it("falls back to light for undefined or unknown input", () => {
    expect(normalizeRoast(undefined)).toBe("light");
    expect(normalizeRoast("Some Unknown Roast Style")).toBe("light");
    expect(normalizeRoast("")).toBe("light");
  });

  // Regression guards for the alias ordering. A compound level must win over the
  // single word inside it, and "Full City" must not be read as "City roast".
  const orderingCases: [string, string][] = [
    ["Medium Dark Roast", "medium-dark"],
    ["medium dark", "medium-dark"],
    ["Full City + Roast", "medium-dark"],
    ["Full City Roast", "medium"],
    ["City roast", "medium-light"],
    ["Medium Light Roast", "medium-light"],
    ["Moderate-Light Roast", "medium-light"],
    ["French Roast", "dark"],
    ["Italian Roast", "dark"],
    ["Cinnamon Roast", "light"],
  ];
  it.each(orderingCases)("normalizes %s to %s without an earlier branch stealing it", (raw, expected) => {
    expect(normalizeRoast(raw)).toBe(expected);
  });
});

describe("toCoffee — bag size (grams)", () => {
  it("honours a positive grams value", () => {
    const c = toCoffee(makeImported({ grams: 340 }), []);
    expect(c.grams).toBe(340);
  });

  it("falls back to 250 when grams is absent", () => {
    const c = toCoffee(makeImported({ grams: undefined }), []);
    expect(c.grams).toBe(250);
  });

  it("falls back to 250 when grams is zero", () => {
    const c = toCoffee(makeImported({ grams: 0 }), []);
    expect(c.grams).toBe(250);
  });

  it("falls back to 250 when grams is negative", () => {
    const c = toCoffee(makeImported({ grams: -50 }), []);
    expect(c.grams).toBe(250);
  });
});

describe("toCoffee — roast normalization", () => {
  it("normalizes the imported roast string through normalizeRoast", () => {
    const c = toCoffee(makeImported({ roast: "City+ Roast" }), []);
    expect(c.roast).toBe("medium");
  });

  it("defaults to light when roast is missing", () => {
    const c = toCoffee(makeImported({ roast: undefined }), []);
    expect(c.roast).toBe("light");
  });
});

describe("toCoffee — field defaults", () => {
  it("defaults a missing name to Untitled", () => {
    const c = toCoffee(makeImported({ name: undefined as unknown as string }), []);
    expect(c.name).toBe("Untitled");
  });

  it("defaults a blank (whitespace-only) name to Untitled", () => {
    const c = toCoffee(makeImported({ name: "   " }), []);
    expect(c.name).toBe("Untitled");
  });

  it("defaults a missing roaster to Unknown", () => {
    const c = toCoffee(makeImported({ roaster: undefined as unknown as string }), []);
    expect(c.roaster).toBe("Unknown");
  });

  it("defaults a blank (whitespace-only) roaster to Unknown", () => {
    const c = toCoffee(makeImported({ roaster: "  " }), []);
    expect(c.roaster).toBe("Unknown");
  });

  it("defaults a missing origin to the em dash placeholder", () => {
    const c = toCoffee(makeImported({ origin: undefined }), []);
    expect(c.origin).toBe("—");
  });

  it("falls back region to origin when region is missing", () => {
    const c = toCoffee(makeImported({ origin: "Kenya", region: undefined }), []);
    expect(c.region).toBe("Kenya");
  });

  it("falls back region to the placeholder when both origin and region are missing", () => {
    const c = toCoffee(makeImported({ origin: undefined, region: undefined }), []);
    expect(c.region).toBe("—");
  });

  it("defaults a missing process to Washed", () => {
    const c = toCoffee(makeImported({ process: undefined }), []);
    expect(c.process).toBe("Washed");
  });

  it("defaults a missing roasted_at to today's ISO date", () => {
    const c = toCoffee(makeImported({ roasted_at: undefined }), []);
    expect(c.roasted_at).toBe(todayISO());
  });

  it("always sets rest_days/peak_days to 28/56", () => {
    const c = toCoffee(makeImported(), []);
    expect(c.rest_days).toBe(28);
    expect(c.peak_days).toBe(56);
  });

  it("defaults archived to false", () => {
    const c = toCoffee(makeImported({ archived: undefined }), []);
    expect(c.archived).toBe(false);
  });

  it("honours archived: true", () => {
    const c = toCoffee(makeImported({ archived: true }), []);
    expect(c.archived).toBe(true);
  });
});

describe("toCoffee — varietals", () => {
  it("splits a single varietal string into a one-element array", () => {
    const c = toCoffee(makeImported({ varietal: "Heirloom" }), []);
    expect(c.varietals).toEqual(["Heirloom"]);
  });

  it("splits a multi-varietal cell on the shared separators (slash)", () => {
    const c = toCoffee(makeImported({ varietal: "SL28/SL34" }), []);
    expect(c.varietals).toEqual(["SL28", "SL34"]);
  });

  it("produces an empty array when varietal is missing", () => {
    const c = toCoffee(makeImported({ varietal: undefined }), []);
    expect(c.varietals).toEqual([]);
  });
});

describe("toCoffee — canonicalRoaster", () => {
  it("adopts the shelf's canonical spelling for a case/whitespace variant", () => {
    const existing = [makeCoffee({ roaster: "Five Senses Coffee" })];
    const c = toCoffee(makeImported({ roaster: "five senses" }), existing);
    expect(c.roaster).toBe("Five Senses Coffee");
  });

  it("keeps a genuinely new roaster's spelling as typed", () => {
    const existing = [makeCoffee({ roaster: "Five Senses Coffee" })];
    const c = toCoffee(makeImported({ roaster: "Brand New Roaster" }), existing);
    expect(c.roaster).toBe("Brand New Roaster");
  });
});

describe("toCoffee — cc (country code)", () => {
  it("derives cc from a recognized origin", () => {
    const c = toCoffee(makeImported({ origin: "Ethiopia" }), []);
    expect(c.cc).toBe("et");
  });

  it("is null when origin is missing or unrecognized", () => {
    expect(toCoffee(makeImported({ origin: undefined }), []).cc).toBeNull();
    expect(toCoffee(makeImported({ origin: "Nowhereland" }), []).cc).toBeNull();
  });
});

describe("toCoffee — id", () => {
  it("assigns a distinct id on every call", () => {
    const a = toCoffee(makeImported(), []);
    const b = toCoffee(makeImported(), []);
    expect(a.id).not.toBe(b.id);
    expect(a.id).toBeTruthy();
    expect(b.id).toBeTruthy();
  });
});

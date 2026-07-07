import { describe, it, expect } from "vitest";
import { markDuplicates } from "./dedup";
import type { Coffee } from "@/lib/types";
import type { ImportedCoffee } from "./types";

function makeCoffee(overrides: Partial<Coffee> = {}): Coffee {
  return {
    id: "c1", household_id: "h1", roaster: "Five Senses", name: "Ethiopia Kochere",
    origin: "Ethiopia", region: "Yirgacheffe", varietal: "Heirloom", process: "Washed",
    roast: "light", roasted_at: "2025-10-01",
    rest_days: 28, peak_days: 56, grams: 250, frozen_grams: 0,
    frozen_at: null, thawed_at: null, archived: false,
    notes: [], cc: "et",
    ...overrides,
  };
}

function makeImported(overrides: Partial<ImportedCoffee> = {}): ImportedCoffee {
  return {
    roaster: "Five Senses",
    name: "Ethiopia Kochere",
    ...overrides,
  };
}

describe("markDuplicates — happy path", () => {
  it("flags an exact roaster+name+date match as a duplicate", () => {
    const existing = [makeCoffee()];
    const [result] = markDuplicates([makeImported({ roasted_at: "2025-10-01" })], existing);
    expect(result.isDuplicate).toBe(true);
  });

  it("flags roaster+name match as duplicate even without a date on either side", () => {
    const existing = [makeCoffee({ roasted_at: "2025-10-01" })];
    const [result] = markDuplicates([makeImported()], existing); // no roasted_at on import
    expect(result.isDuplicate).toBe(true);
  });

  it("does not flag when the date differs and both sides have one", () => {
    const existing = [makeCoffee({ roasted_at: "2025-10-01" })];
    const [result] = markDuplicates([makeImported({ roasted_at: "2025-11-15" })], existing);
    expect(result.isDuplicate).toBe(false);
  });

  it("matches roaster names case/whitespace-insensitively via roasterKey", () => {
    const existing = [makeCoffee({ roaster: "Five Senses" })];
    const [result] = markDuplicates([makeImported({ roaster: "  five   senses  " })], existing);
    expect(result.isDuplicate).toBe(true);
  });

  it("matches coffee names case/whitespace-insensitively", () => {
    const existing = [makeCoffee({ name: "Ethiopia Kochere" })];
    const [result] = markDuplicates([makeImported({ name: "ethiopia   kochere" })], existing);
    expect(result.isDuplicate).toBe(true);
  });

  it("does not flag a different coffee from the same roaster", () => {
    const existing = [makeCoffee({ name: "Kochere" })];
    const [result] = markDuplicates([makeImported({ name: "Guji" })], existing);
    expect(result.isDuplicate).toBe(false);
  });

  it("preserves every ImportedCoffee field alongside the new isDuplicate flag", () => {
    const imported = makeImported({ origin: "Ethiopia", grams: 250, notes: ["floral"] });
    const [result] = markDuplicates([imported], []);
    expect(result).toEqual({ ...imported, isDuplicate: false });
  });
});

describe("markDuplicates — malformed / edge-case input", () => {
  it("returns an empty array for an empty import list", () => {
    expect(markDuplicates([], [makeCoffee()])).toEqual([]);
  });

  it("flags nothing as duplicate when the shelf is empty", () => {
    const [result] = markDuplicates([makeImported()], []);
    expect(result.isDuplicate).toBe(false);
  });

  it("treats a missing/empty roaster or name as its own comparable value, not a crash", () => {
    const existing = [makeCoffee({ roaster: "", name: "" })];
    const [result] = markDuplicates([makeImported({ roaster: "", name: "" })], existing);
    expect(result.isDuplicate).toBe(true);
  });

  it("handles multiple imported rows independently", () => {
    const existing = [makeCoffee({ name: "Kochere" })];
    const results = markDuplicates(
      [makeImported({ name: "Kochere" }), makeImported({ name: "Guji" })],
      existing,
    );
    expect(results.map((r) => r.isDuplicate)).toEqual([true, false]);
  });
});

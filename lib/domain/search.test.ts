import { describe, it, expect } from "vitest";
import {
  normalizeText, coffeeHaystack, searchTokens, matchesTokens, filterCoffees, isFilterActive,
  roasterFacets, originFacets, producerKey, producerLabel, relatedByProducer,
} from "@/lib/domain/search";
import type { Coffee } from "@/lib/types";

function makeCoffee(overrides: Partial<Coffee> = {}): Coffee {
  return {
    id: "c1", roaster: "Sey", name: "Hamasho", origin: "Ethiopia", region: "Sidama, Bensa",
    varietals: ["Heirloom"], process: "Washed", roast: "light", roasted_at: "2026-05-01",
    rest_days: 28, peak_days: 56, grams: 250, frozen_grams: 0, frozen_at: null, thawed_at: null,
    archived: false, notes: ["Jasmine", "Bergamot"], cc: "ET",
    ...overrides,
  };
}

const NONE = { query: "", origin: null, roaster: null };

describe("normalizeText", () => {
  it("strips accents, case and extra whitespace", () => {
    expect(normalizeText("  Café   Paraíso ")).toBe("cafe paraiso");
    expect(normalizeText("Tarrazú")).toBe("tarrazu");
  });
});

describe("search matching", () => {
  it("matches accent-insensitively across fields", () => {
    const hay = coffeeHaystack(makeCoffee({ region: "Tarrazú" }));
    expect(matchesTokens(hay, searchTokens("tarrazu"))).toBe(true);
    expect(matchesTokens(hay, searchTokens("JASMINE"))).toBe(true);
    expect(matchesTokens(hay, searchTokens("heirloom"))).toBe(true);
  });

  it("requires every token (AND)", () => {
    const hay = coffeeHaystack(makeCoffee());
    expect(matchesTokens(hay, searchTokens("sey ethiopia"))).toBe(true);
    expect(matchesTokens(hay, searchTokens("sey panama"))).toBe(false);
  });

  it("searches the producer override", () => {
    const hay = coffeeHaystack(makeCoffee({ producer: "Daye Bensa" }));
    expect(matchesTokens(hay, searchTokens("daye"))).toBe(true);
  });
});

describe("filterCoffees", () => {
  const shelf = [
    makeCoffee({ id: "a", roaster: "Sey", origin: "Ethiopia" }),
    makeCoffee({ id: "b", roaster: "Sey Coffee", origin: "Colombia", name: "El Desarrollo" }),
    makeCoffee({ id: "c", roaster: "Onyx", origin: "Colombia", name: "Las Brisas", archived: true }),
  ];

  it("returns everything with no filter, finished bags included", () => {
    expect(filterCoffees(shelf, NONE).map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(isFilterActive(NONE)).toBe(false);
    expect(isFilterActive({ ...NONE, query: "  " })).toBe(false);
  });

  it("filters by origin and roaster key, combined with the query", () => {
    expect(filterCoffees(shelf, { ...NONE, origin: "colombia" }).map((c) => c.id)).toEqual(["b", "c"]);
    expect(filterCoffees(shelf, { ...NONE, roaster: "sey" }).map((c) => c.id)).toEqual(["a", "b"]);
    expect(filterCoffees(shelf, { query: "brisas", origin: "colombia", roaster: null }).map((c) => c.id)).toEqual(["c"]);
  });

  it("uses precomputed haystacks when given", () => {
    const hay = new Map([["a", "zzz"]]);
    expect(filterCoffees([shelf[0]], { ...NONE, query: "zzz" }, hay)).toHaveLength(1);
  });
});

describe("facets", () => {
  it("counts roasters under one canonical spelling, most bags first", () => {
    const shelf = [
      makeCoffee({ id: "1", roaster: "Onyx" }),
      makeCoffee({ id: "2", roaster: "Sey" }),
      makeCoffee({ id: "3", roaster: "Sey Coffee" }),
      makeCoffee({ id: "4", roaster: "Sey" }),
    ];
    expect(roasterFacets(shelf)).toEqual([
      { key: "sey", name: "Sey", count: 3 },
      { key: "onyx", name: "Onyx", count: 1 },
    ]);
  });

  it("counts origins and drops blanks and placeholders", () => {
    const shelf = [
      makeCoffee({ id: "1", origin: "Kenya" }),
      makeCoffee({ id: "2", origin: "kenya" }),
      makeCoffee({ id: "3", origin: "" }),
      makeCoffee({ id: "4", origin: "—" }),
    ];
    expect(originFacets(shelf)).toEqual([{ key: "kenya", name: "Kenya", count: 2 }]);
  });
});

describe("producerKey", () => {
  it("drops farm prefixes so roasters' spellings line up", () => {
    const a = makeCoffee({ name: "Hacienda La Esmeralda", origin: "Panama", region: "Boquete", varietals: ["Gesha"] });
    const b = makeCoffee({ name: "La Esmeralda Gesha", origin: "Panama", region: "Boquete", varietals: ["Gesha"] });
    expect(producerKey(a)).toBe("la esmeralda");
    expect(producerKey(b)).toBe("la esmeralda");
  });

  it("drops lot suffixes, varietal and process words", () => {
    const lot = makeCoffee({ name: "El Desarrollo · Lot 14", origin: "Colombia", region: "Cundinamarca", varietals: ["Castillo"] });
    const nat = makeCoffee({ name: "Finca El Desarrollo Pink Bourbon Natural", origin: "Colombia", region: "", varietals: ["Pink Bourbon"], process: "Natural" });
    expect(producerKey(lot)).toBe("el desarrollo");
    expect(producerKey(nat)).toBe("el desarrollo");
  });

  it("is accent-insensitive", () => {
    expect(producerKey(makeCoffee({ name: "El Paraíso" }))).toBe(producerKey(makeCoffee({ name: "Finca El Paraiso" })));
  });

  it("returns null for region-style names", () => {
    const guji = makeCoffee({ name: "Ethiopia Guji", origin: "Ethiopia", region: "Guji, Hambela" });
    const kenya = makeCoffee({ name: "Kenya AA", origin: "Kenya", region: "Nyeri" });
    expect(producerKey(guji)).toBeNull();
    expect(producerKey(kenya)).toBeNull();
    expect(producerLabel(guji)).toBeNull();
  });

  it("prefers the override", () => {
    const c = makeCoffee({ name: "Ethiopia Guji", origin: "Ethiopia", region: "Guji", producer: "Finca Guji Highlands" });
    expect(producerKey(c)).toBe("guji highlands");
    expect(producerLabel(c)).toBe("Finca Guji Highlands");
  });

  it("labels with the cleaned name segment in its original casing", () => {
    expect(producerLabel(makeCoffee({ name: "El Desarrollo · Lot 14", origin: "Colombia" }))).toBe("El Desarrollo");
    expect(producerLabel(makeCoffee({ name: "Finca El Desarrollo Castillo", origin: "Colombia", varietals: ["Castillo"] }))).toBe("El Desarrollo");
  });
});

describe("relatedByProducer", () => {
  it("links other bags from the same producer, newest first", () => {
    const base = { origin: "Colombia", region: "Cundinamarca", varietals: ["Castillo"] };
    const me = makeCoffee({ id: "me", name: "El Desarrollo · Lot 14", ...base });
    const older = makeCoffee({ id: "old", roaster: "Onyx", name: "Finca El Desarrollo", roasted_at: "2025-01-01", ...base });
    const newer = makeCoffee({ id: "new", name: "El Desarrollo Castillo", roasted_at: "2026-02-01", ...base });
    const other = makeCoffee({ id: "x", name: "Las Brisas", ...base });
    expect(relatedByProducer(me, [me, older, other, newer]).map((c) => c.id)).toEqual(["new", "old"]);
  });

  it("returns nothing when the coffee has no producer", () => {
    const guji = makeCoffee({ id: "g", name: "Ethiopia Guji", origin: "Ethiopia", region: "Guji" });
    expect(relatedByProducer(guji, [guji, { ...guji, id: "g2" }])).toEqual([]);
  });
});

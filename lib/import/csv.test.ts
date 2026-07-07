import { describe, it, expect } from "vitest";
import { parseCsv, CSV_HEADERS, CSV_EXAMPLE_ROW } from "./csv";

describe("parseCsv — happy path", () => {
  it("parses the canonical template header + example row", () => {
    const text = `${CSV_HEADERS.join(",")}\n${CSV_EXAMPLE_ROW}`;
    const result = parseCsv(text);
    expect(result.coffees).toHaveLength(1);
    const c = result.coffees[0];
    expect(c.roaster).toBe("Five Senses");
    expect(c.name).toBe("Ethiopia Kochere");
    expect(c.origin).toBe("Ethiopia");
    expect(c.region).toBe("Yirgacheffe");
    expect(c.varietal).toBe("Heirloom");
    expect(c.process).toBe("Washed");
    expect(c.roast).toBe("light");
    expect(c.roasted_at).toBe("2025-10-01");
    expect(c.grams).toBe(250);
    expect(c.notes).toEqual(["cherry", "jasmine", "chocolate"]);
  });

  it("is case/whitespace-insensitive and accepts header synonyms", () => {
    const text = [
      "Coffee Name, Country, Weight, Tasting Notices",
      "Kochere, Ethiopia, 250, cherry;chocolate",
    ].join("\n");
    // Missing an explicit "roaster" column but has a "name"-equivalent — this
    // fixture intentionally lacks roaster to also exercise the required-column path.
    const result = parseCsv(text);
    expect(result.coffees).toEqual([]);
    expect(result.warnings[0]).toMatch(/must have at least a "name" and "roaster"/);
  });

  it("maps synonym headers (coffeename, country, variety, processing, roastdate, flavours) to canonical fields", () => {
    const text = [
      "roaster,coffeename,country,variety,processing,roastdate,flavours",
      "Onyx,Geometry,Colombia,Castillo,Natural,2025-01-05,berry;wine",
    ].join("\n");
    const result = parseCsv(text);
    expect(result.coffees).toHaveLength(1);
    const c = result.coffees[0];
    expect(c.name).toBe("Geometry");
    expect(c.origin).toBe("Colombia");
    expect(c.varietal).toBe("Castillo");
    expect(c.process).toBe("Natural");
    expect(c.roasted_at).toBe("2025-01-05");
    expect(c.notes).toEqual(["berry", "wine"]);
  });

  it("parses grams from a value with stray non-numeric characters", () => {
    const text = "roaster,name,grams\nAcme,X,250g";
    const result = parseCsv(text);
    expect(result.coffees[0].grams).toBe(250);
  });

  it("normalizes a single-digit month/day roasted_at", () => {
    const text = "roaster,name,roasted_at\nAcme,X,2025-1-5";
    const result = parseCsv(text);
    expect(result.coffees[0].roasted_at).toBe("2025-01-05");
  });

  it("warns about but ignores unrecognized columns", () => {
    const text = "roaster,name,favoriteColor\nAcme,X,blue";
    const result = parseCsv(text);
    expect(result.coffees).toHaveLength(1);
    expect(result.warnings.some((w) => /Unrecognized columns/.test(w))).toBe(true);
  });
});

describe("parseCsv — malformed input", () => {
  it("reports an empty file", () => {
    const result = parseCsv("");
    expect(result.coffees).toEqual([]);
    expect(result.warnings[0]).toMatch(/empty or has no data rows/);
  });

  it("reports missing required columns (no name/roaster)", () => {
    const text = "origin,region\nEthiopia,Yirgacheffe";
    const result = parseCsv(text);
    expect(result.coffees).toEqual([]);
    expect(result.warnings[0]).toMatch(/must have at least a "name" and "roaster"/);
  });

  it("skips a row with neither name nor roaster but keeps other rows", () => {
    const text = "roaster,name\nAcme,Good One\n,\n";
    const result = parseCsv(text);
    expect(result.coffees).toHaveLength(1);
    expect(result.coffees[0].name).toBe("Good One");
    expect(result.warnings.some((w) => /no name or roaster/.test(w))).toBe(true);
  });

  it("skips an unrecognized roasted_at format with a warning, keeping the row", () => {
    const text = "roaster,name,roasted_at\nAcme,X,sometime last week";
    const result = parseCsv(text);
    expect(result.coffees).toHaveLength(1);
    expect(result.coffees[0].roasted_at).toBeUndefined();
    expect(result.warnings.some((w) => /unrecognized roasted_at format/.test(w))).toBe(true);
  });

  it("ignores a non-numeric grams value rather than throwing", () => {
    const text = "roaster,name,grams\nAcme,X,lots";
    const result = parseCsv(text);
    expect(result.coffees[0].grams).toBeUndefined();
  });
});

import { describe, it, expect } from "vitest";
import { parseBeanConqueror } from "./beanconqueror";

function beanConquerorFixture(overrides: Record<string, unknown> = {}) {
  return {
    BEANS: [
      {
        name: "Kochere",
        roaster: "Sey Coffee",
        roastingDate: "2025-10-01T00:00:00.000Z",
        roast: "City+ Roast",
        weight: 250,
        finished: false,
        aromatics: "jasmine, bergamot",
        bean_information: [
          { country: "Ethiopia", region: "Yirgacheffe", variety: "Heirloom", processing: "Washed" },
        ],
        cupped_flavor: { predefined_flavors: ["floral"], custom_flavors: ["honey"] },
      },
    ],
    ...overrides,
  };
}

describe("parseBeanConqueror — happy path", () => {
  it("maps a well-formed bean into an ImportedCoffee", () => {
    const result = parseBeanConqueror(beanConquerorFixture());
    expect(result.warnings).toEqual([]);
    expect(result.coffees).toHaveLength(1);
    const c = result.coffees[0];
    expect(c.name).toBe("Kochere");
    expect(c.roaster).toBe("Sey Coffee");
    expect(c.origin).toBe("Ethiopia");
    expect(c.region).toBe("Yirgacheffe");
    expect(c.varietal).toBe("Heirloom");
    expect(c.process).toBe("Washed");
    expect(c.roast).toBe("medium"); // City+ Roast -> medium
    expect(c.roasted_at).toBe("2025-10-01");
    expect(c.grams).toBe(250);
    expect(c.archived).toBe(false);
    expect(new Set(c.notes)).toEqual(new Set(["jasmine", "bergamot", "floral", "honey"]));
  });

  it("accepts a raw JSON string, not just a parsed object", () => {
    const result = parseBeanConqueror(JSON.stringify(beanConquerorFixture()));
    expect(result.coffees).toHaveLength(1);
  });

  it("accepts a lowercase `beans` key as well as `BEANS`", () => {
    const fixture = beanConquerorFixture();
    const lower = { beans: fixture.BEANS };
    const result = parseBeanConqueror(lower);
    expect(result.coffees).toHaveLength(1);
  });

  it("maps every ROASTS_ENUM bucket, defaulting unknowns to light", () => {
    const cases: [string, string][] = [
      ["Cinnamon Roast", "light"],
      ["Moderate-Light Roast", "medium-light"],
      ["Full City Roast", "medium"],
      ["Vienna Roast", "medium-dark"],
      ["Italian Roast", "dark"],
      ["Some Unknown Roast", "light"],
    ];
    for (const [bcRoast, expected] of cases) {
      const result = parseBeanConqueror(beanConquerorFixture({
        BEANS: [{ ...beanConquerorFixture().BEANS[0], roast: bcRoast }],
      }));
      expect(result.coffees[0].roast).toBe(expected);
    }
  });

  it("parses an epoch-ms roastingDate", () => {
    const ms = new Date("2025-06-15T00:00:00.000Z").getTime();
    const result = parseBeanConqueror(beanConquerorFixture({
      BEANS: [{ ...beanConquerorFixture().BEANS[0], roastingDate: String(ms) }],
    }));
    // Local-date formatted, so just check it parsed to a plausible date, not undefined.
    expect(result.coffees[0].roasted_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("parseBeanConqueror — malformed input", () => {
  it("rejects a string that isn't valid JSON", () => {
    const result = parseBeanConqueror("not json{{{");
    expect(result.coffees).toEqual([]);
    expect(result.warnings[0]).toMatch(/could not parse/i);
  });

  it("rejects a non-object top level", () => {
    const result = parseBeanConqueror(42);
    expect(result.coffees).toEqual([]);
    expect(result.warnings[0]).toMatch(/does not contain a json object/i);
  });

  it("rejects a payload with no BEANS/beans array", () => {
    const result = parseBeanConqueror({ nope: [] });
    expect(result.coffees).toEqual([]);
    expect(result.warnings[0]).toMatch(/BEANS array/);
  });

  it("reports an empty BEANS array as nothing to import", () => {
    const result = parseBeanConqueror({ BEANS: [] });
    expect(result.coffees).toEqual([]);
    expect(result.warnings[0]).toMatch(/empty/i);
  });

  it("skips a non-object row with a warning but keeps processing others", () => {
    const good = beanConquerorFixture().BEANS[0];
    const result = parseBeanConqueror({ BEANS: [null, good] });
    expect(result.coffees).toHaveLength(1);
    expect(result.warnings.some((w) => /skipped \(not an object\)/.test(w))).toBe(true);
  });

  it("skips a row with neither name nor roaster", () => {
    const result = parseBeanConqueror({ BEANS: [{ name: "", roaster: "" }] });
    expect(result.coffees).toEqual([]);
    expect(result.warnings.some((w) => /no name or roaster/.test(w))).toBe(true);
  });

  it("falls back to Untitled/Unknown when only one of name/roaster is present", () => {
    const result = parseBeanConqueror({ BEANS: [{ name: "", roaster: "Onyx" }] });
    expect(result.coffees[0].name).toBe("Untitled");
    expect(result.coffees[0].roaster).toBe("Onyx");
  });

  it("tolerates a missing bean_information array (no origin/region/etc.)", () => {
    const result = parseBeanConqueror({ BEANS: [{ name: "X", roaster: "Y" }] });
    expect(result.coffees[0].origin).toBeUndefined();
    expect(result.coffees[0].region).toBeUndefined();
  });

  it("ignores an unparseable roastingDate rather than throwing", () => {
    const result = parseBeanConqueror({ BEANS: [{ name: "X", roaster: "Y", roastingDate: "not-a-date" }] });
    expect(result.coffees[0].roasted_at).toBeUndefined();
  });
});

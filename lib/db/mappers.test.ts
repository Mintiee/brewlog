import { describe, it, expect } from "vitest";
import { rowToBrew, brewToRow, brewPatchToRow, rowToSavedRecipe, savedRecipeToRow, rowToConfig } from "@/lib/db/mappers";
import type { Tables } from "@/lib/db/database.types";
import type { Brew, SavedRecipe } from "@/lib/types";
import { SEED_BREWERS } from "@/lib/domain/seed";

/** Fill in the DB-side columns an insert payload doesn't carry. */
function asRow(partial: object): Tables<"brews"> {
  return { household_id: "h1", created_at: "2026-01-01T00:00:00Z", ...partial } as Tables<"brews">;
}

function makeBrew(overrides: Partial<Brew> = {}): Brew {
  return {
    id: "b1",
    household_id: "h1",
    coffee_id: "c1",
    brewer_id: "v60",
    dose: 15, water: 250, bypass: 0, temp: 92,
    grind: 24, ratio: 16.7, water_type: "Third Wave",
    started_at: "1750000000000",
    rest_days: 14,
    rated_at: "1750000600000",
    logged_by: "p1",
    pending: false,
    rate_for: null,
    session_id: null,
    guest: false,
    stars: 4, stars2: 3.5,
    taster1: "Min", taster2: "Kris",
    acidity: 3, sweetness: 4, body: 2, clarity: 5,
    note: "juicy",
    ...overrides,
  };
}

describe("brewToRow / rowToBrew round-trip", () => {
  it("preserves all fields through row and back", () => {
    const brew = makeBrew();
    const row = brewToRow(brew);
    const back = rowToBrew(asRow({ ...row, id: brew.id }));
    expect(back).toEqual(brew);
  });

  it("converts ms-string timestamps to ISO and back", () => {
    const brew = makeBrew();
    const row = brewToRow(brew);
    expect(row.started_at).toBe(new Date(1750000000000).toISOString());
    expect(row.rated_at).toBe(new Date(1750000600000).toISOString());
    const back = rowToBrew(asRow({ ...row, id: brew.id }));
    expect(back.started_at).toBe("1750000000000");
    expect(back.rated_at).toBe("1750000600000");
  });

  it("derives pending from rated_at", () => {
    const row = brewToRow(makeBrew({ rated_at: null, pending: true, stars: null }));
    expect(rowToBrew(asRow({ ...row, id: "b1" })).pending).toBe(true);
  });

  it("maps zero scale values to null on write (1–5 DB check)", () => {
    const row = brewToRow(makeBrew({ acidity: 0 as unknown as number }));
    expect(row.acidity).toBeNull();
  });
});

describe("brewPatchToRow — partial updates must not clobber absent columns", () => {
  it("a rate_for-only patch emits no rating or score columns (regression: brews resurrected as pending)", () => {
    const row = brewPatchToRow({ rate_for: "p2" });
    expect(row).toEqual({ rate_for: "p2" });
    expect("rated_at" in row).toBe(false);
    expect("acidity" in row).toBe(false);
    expect("stars" in row).toBe(false);
  });

  it("a BrewDetail-shaped edit patch keeps rated_at but emits no score columns (regression: edits wiped taste scores)", () => {
    const patch: Partial<Brew> = {
      dose: 16, water: 260, temp: 94, grind: 22,
      started_at: "1750000000000", rated_at: "1750000600000",
    };
    const row = brewPatchToRow(patch);
    expect(row.rated_at).toBe(new Date(1750000600000).toISOString());
    expect(row.started_at).toBe(new Date(1750000000000).toISOString());
    expect(row.dose).toBe(16);
    for (const k of ["acidity", "sweetness", "body", "clarity", "stars", "stars2", "note"]) {
      expect(k in row, `${k} should be absent`).toBe(false);
    }
  });

  it("a rating patch writes scores, timestamps, and clears rate_for — but never emits pending", () => {
    const patch: Partial<Brew> = {
      stars: 4.5, acidity: 3, sweetness: 0, body: 4, clarity: 2,
      note: "floral", taster1: "Min",
      pending: false, rated_at: "1750000600000", rate_for: null,
    };
    const row = brewPatchToRow(patch);
    expect(row.stars).toBe(4.5);
    expect(row.sweetness).toBeNull();      // 0 = "not set" → null for the DB check
    expect(row.rate_for).toBeNull();        // explicit null writes through
    expect(row.rated_at).toBe(new Date(1750000600000).toISOString());
    expect("pending" in row).toBe(false);   // derived — never a column
    expect("id" in row).toBe(false);
  });

  it("an explicit rated_at: null writes null (un-rating)", () => {
    const row = brewPatchToRow({ rated_at: null });
    expect(row).toEqual({ rated_at: null });
  });

  it("never nulls identity columns from a patch", () => {
    const row = brewPatchToRow({ household_id: undefined, logged_by: undefined, dose: 15 });
    expect("household_id" in row).toBe(false);
    expect("logged_by" in row).toBe(false);
  });
});

describe("savedRecipeToRow / rowToSavedRecipe round-trip", () => {
  function makeRecipe(overrides: Partial<SavedRecipe> = {}): SavedRecipe {
    return {
      id: "r1",
      household_id: "h1",
      name: "V60 bright",
      dose: 15, water: 250, bypass: 0, temp: 93,
      grind: 20, ratio: 16.7, water_type: "Third Wave",
      brewer_id: "v60",
      created_at: "2026-01-01T00:00:00Z",
      ...overrides,
    };
  }

  it("preserves all fields through row and back", () => {
    const recipe = makeRecipe();
    const row = savedRecipeToRow(recipe);
    const back = rowToSavedRecipe({ ...row, id: recipe.id, created_at: recipe.created_at! } as Tables<"recipes">);
    expect(back).toEqual(recipe);
  });

  it("emits id/household_id only when present (client insert omits them)", () => {
    const { id: _id, household_id: _hh, created_at: _ca, ...rest } = makeRecipe();
    void _id; void _hh; void _ca;
    const row = savedRecipeToRow(rest);
    expect("id" in row).toBe(false);
    expect("household_id" in row).toBe(false);
  });

  it("coerces numeric strings from PostgREST and preserves a null brewer_id", () => {
    const back = rowToSavedRecipe({
      id: "r2", household_id: "h1", name: "no brewer",
      dose: "15" as unknown as number, water: "250" as unknown as number,
      bypass: "0" as unknown as number, temp: "93" as unknown as number,
      grind: "20" as unknown as number, ratio: "16.7" as unknown as number,
      water_type: "", brewer_id: null, created_at: "2026-01-01T00:00:00Z",
    } as Tables<"recipes">);
    expect(back.dose).toBe(15);
    expect(back.ratio).toBe(16.7);
    expect(back.brewer_id).toBeNull();
  });
});

describe("rowToConfig — backfill defaults for rows stored before newer fields existed", () => {
  /** Minimal config row; overrides layer on top. */
  function asConfigRow(overrides: Partial<Tables<"config">> = {}): Tables<"config"> {
    return {
      household_id: "h1",
      grinder: { name: "Comandante C40", unit: "clicks", grind_min: 0, grind_max: 50, grind_step: 1 },
      brewers: SEED_BREWERS,
      waters: ["Third Wave", "Filtered"],
      default_water: "Third Wave",
      taster2: "Kris",
      random_greeting: true,
      rest_days: 28,
      serving_grams: 12.5,
      peak_days: 56,
      ...overrides,
    } as Tables<"config">;
  }

  it("passes through a fully-populated row unchanged", () => {
    const row = asConfigRow();
    const config = rowToConfig(row);
    expect(config.grinder).toEqual(row.grinder);
    expect(config.brewers).toEqual(row.brewers);
    expect(config.rest_days).toBe(28);
    expect(config.peak_days).toBe(56);
    expect(config.serving_grams).toBe(12.5);
  });

  it("backfills brewer `water` from dose*ratio when a stored brewer predates the field", () => {
    const legacyBrewer = { id: "v60", name: "V60", short: "V60", dose: 15, ratio: 16 };
    const row = asConfigRow({ brewers: [legacyBrewer] as unknown as Tables<"config">["brewers"] });
    const config = rowToConfig(row);
    expect(config.brewers[0].water).toBe(240); // 15 * 16
  });

  it("leaves an existing brewer `water` value alone", () => {
    const brewer = { id: "v60", name: "V60", short: "V60", dose: 15, ratio: 16, water: 999 };
    const row = asConfigRow({ brewers: [brewer] as unknown as Tables<"config">["brewers"] });
    const config = rowToConfig(row);
    expect(config.brewers[0].water).toBe(999);
  });

  it("falls back to SEED_BREWERS when brewers is missing or empty", () => {
    const empty = rowToConfig(asConfigRow({ brewers: [] }));
    expect(empty.brewers.length).toBe(SEED_BREWERS.length);
    const missing = rowToConfig(asConfigRow({ brewers: null as unknown as Tables<"config">["brewers"] }));
    expect(missing.brewers.length).toBe(SEED_BREWERS.length);
  });

  it("backfills grinder range/step defaults when a stored grinder predates those fields", () => {
    const row = asConfigRow({ grinder: { name: "Old Grinder", unit: "numbers" } as unknown as Tables<"config">["grinder"] });
    const config = rowToConfig(row);
    expect(config.grinder.name).toBe("Old Grinder");   // preserved
    expect(config.grinder.unit).toBe("numbers");        // preserved
    expect(config.grinder.grind_min).toBe(0);           // backfilled default
    expect(config.grinder.grind_max).toBe(50);          // backfilled default
    expect(config.grinder.grind_step).toBe(1);          // backfilled default
  });

  it("falls back to the default grinder entirely when grinder is null/malformed", () => {
    const config = rowToConfig(asConfigRow({ grinder: null as unknown as Tables<"config">["grinder"] }));
    expect(config.grinder.name).toBe("Comandante C40");
    expect(config.grinder.grind_max).toBe(50);
  });

  it("backfills waters/default_water/taster2/random_greeting/rest_days/peak_days/serving_grams when absent", () => {
    const row = asConfigRow({
      waters: null as unknown as string[],
      default_water: null as unknown as string,
      taster2: null as unknown as string,
      random_greeting: null as unknown as boolean,
      rest_days: null as unknown as number,
      peak_days: null as unknown as number,
      serving_grams: null as unknown as number,
    });
    const config = rowToConfig(row);
    expect(config.waters).toEqual(["Third Wave", "Filtered", "Volvic", "Tap"]);
    expect(config.default_water).toBe("Third Wave");
    expect(config.taster2).toBe("Kris");
    expect(config.random_greeting).toBe(true);
    expect(config.rest_days).toBe(28);
    expect(config.peak_days).toBe(56);
    expect(config.serving_grams).toBe(12.5);
  });

  it("coerces a numeric-string serving_grams from PostgREST", () => {
    const config = rowToConfig(asConfigRow({ serving_grams: "18" as unknown as number }));
    expect(config.serving_grams).toBe(18);
  });

  it("random_greeting is only false when explicitly false (not merely falsy/absent)", () => {
    expect(rowToConfig(asConfigRow({ random_greeting: false })).random_greeting).toBe(false);
    expect(rowToConfig(asConfigRow({ random_greeting: undefined as unknown as boolean })).random_greeting).toBe(true);
  });

  // roaster_rest (migration 020) — a malformed window would otherwise feed NaN into
  // the freshness maths for every coffee from that roaster.
  const roasterRest = (v: unknown) =>
    rowToConfig(asConfigRow({ roaster_rest: v as Tables<"config">["roaster_rest"] })).roaster_rest;

  it("passes through well-formed roaster windows", () => {
    const stored = { "five senses": { name: "Five Senses", rest_days: 14, peak_days: 42 } };
    expect(roasterRest(stored)).toEqual(stored);
  });

  it("defaults roaster_rest to {} when null, absent or not an object", () => {
    expect(roasterRest(null)).toEqual({});
    expect(roasterRest(undefined)).toEqual({});
    expect(roasterRest([])).toEqual({});
    expect(roasterRest("nope")).toEqual({});
  });

  it("drops malformed roaster windows and keeps the good ones", () => {
    const out = roasterRest({
      "": { name: "Blank key", rest_days: 14, peak_days: 42 },
      nullish: null,
      arr: [14, 42],
      norest: { name: "No rest", peak_days: 42 },
      zero: { name: "Zero", rest_days: 0, peak_days: 42 },
      text: { name: "Text", rest_days: "soon", peak_days: 42 },
      good: { name: "Good", rest_days: 14, peak_days: 42 },
    });
    expect(Object.keys(out)).toEqual(["good"]);
  });

  it("normalises keys through roasterKey so Settings and the domain agree", () => {
    const out = roasterRest({ "Five Senses Coffee": { name: "Five Senses", rest_days: 14, peak_days: 42 } });
    expect(Object.keys(out)).toEqual(["five senses"]);
  });

  it("rounds day counts, coerces numeric strings, and names an unnamed entry by its key", () => {
    const out = roasterRest({ ona: { rest_days: "21", peak_days: 48.6 } });
    expect(out.ona).toEqual({ name: "ona", rest_days: 21, peak_days: 49 });
  });

  it("floors peak at rest + 1 so the drink window can never invert", () => {
    const out = roasterRest({ ona: { name: "ONA", rest_days: 30, peak_days: 10 } });
    expect(out.ona.peak_days).toBe(31);
  });
});

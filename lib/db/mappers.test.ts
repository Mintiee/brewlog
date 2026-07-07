import { describe, it, expect } from "vitest";
import { rowToBrew, brewToRow, brewPatchToRow, rowToSavedRecipe, savedRecipeToRow } from "@/lib/db/mappers";
import type { Tables } from "@/lib/db/database.types";
import type { Brew, SavedRecipe } from "@/lib/types";

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

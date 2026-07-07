import { describe, it, expect } from "vitest";
import { sanitizeExtractOutput } from "./extractOutput";

describe("sanitizeExtractOutput", () => {
  it("passes through a well-formed response", () => {
    const out = sanitizeExtractOutput({
      roaster: "Proud Mary",
      name: "Ethiopia Chelbesa",
      origin: "Ethiopia",
      region: "Yirgacheffe",
      varietal: "Heirloom",
      process: "Washed",
      roast: "light",
      roastDaysAgo: 12,
      notes: ["jasmine", "bergamot"],
    });
    expect(out).toEqual({
      roaster: "Proud Mary",
      name: "Ethiopia Chelbesa",
      origin: "Ethiopia",
      region: "Yirgacheffe",
      varietal: "Heirloom",
      process: "Washed",
      roast: "light",
      roastDaysAgo: 12,
      notes: ["jasmine", "bergamot"],
    });
  });

  it("nulls an invalid roast value", () => {
    expect(sanitizeExtractOutput({ roast: "extra-dark" }).roast).toBeNull();
  });

  it("nulls a non-integer roastDaysAgo", () => {
    expect(sanitizeExtractOutput({ roastDaysAgo: 3.5 }).roastDaysAgo).toBeNull();
    expect(sanitizeExtractOutput({ roastDaysAgo: "12" }).roastDaysAgo).toBeNull();
  });

  it("keeps a valid integer roastDaysAgo", () => {
    expect(sanitizeExtractOutput({ roastDaysAgo: 0 }).roastDaysAgo).toBe(0);
  });

  it("strips non-string entries out of notes", () => {
    expect(sanitizeExtractOutput({ notes: ["ok", 5, null, "also ok"] }).notes).toEqual(["ok", "also ok"]);
  });

  it("coerces missing/non-string text fields to empty strings", () => {
    const out = sanitizeExtractOutput({ roaster: 42, name: null });
    expect(out.roaster).toBe("");
    expect(out.name).toBe("");
  });

  it("handles non-object input without throwing", () => {
    expect(sanitizeExtractOutput(null)).toMatchObject({ roast: null, roastDaysAgo: null, notes: [] });
    expect(sanitizeExtractOutput("garbage")).toMatchObject({ roast: null, roastDaysAgo: null, notes: [] });
  });
});

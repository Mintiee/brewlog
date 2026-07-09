import { describe, it, expect } from "vitest";
import {
  parseVarietals,
  canonicalVarietal,
  isBlendLabel,
  varietalGroup,
  setLearnedVarietals,
  unknownVarietals,
} from "./index";

describe("parseVarietals", () => {
  it("splits on commas, middots, slashes, plus, ampersand and semicolons", () => {
    expect(parseVarietals("SL28, SL34, Ruiru 11")).toEqual(["SL28", "SL34", "Ruiru 11"]);
    expect(parseVarietals("Caturra · Heirloom")).toEqual(["Caturra", "Heirloom"]);
    expect(parseVarietals("SL28/SL34")).toEqual(["SL28", "SL34"]);
    expect(parseVarietals("Caturra + Castillo & Typica; Bourbon")).toEqual([
      "Caturra", "Castillo", "Typica", "Bourbon",
    ]);
  });

  it("drops empties and the legacy em-dash sentinel", () => {
    expect(parseVarietals("")).toEqual([]);
    expect(parseVarietals("—")).toEqual([]);
    expect(parseVarietals("SL28, , —")).toEqual(["SL28"]);
  });

  it("dedupes on normalised key, preserving order and first spelling", () => {
    expect(parseVarietals("SL28, sl-28, SL 28")).toEqual(["SL28"]);
    expect(parseVarietals("Gesha, Caturra, gesha")).toEqual(["Gesha", "Caturra"]);
  });
});

describe("canonicalVarietal", () => {
  it("canonicalises via the static alias map (space/hyphen/case-insensitive)", () => {
    expect(canonicalVarietal("sl-28")).toBe("SL28");
    expect(canonicalVarietal("Geisha")).toBe("Gesha");
    expect(canonicalVarietal("ethiopian heirloom")).toBe("Heirloom");
    expect(canonicalVarietal("bourbon rosado")).toBe("Pink Bourbon");
  });

  it("preserves meaningful qualifiers as distinct canonicals", () => {
    expect(canonicalVarietal("Pink Bourbon")).toBe("Pink Bourbon");
    expect(canonicalVarietal("Bourbon")).toBe("Bourbon");
  });

  it("title-cases unmapped tokens verbatim", () => {
    expect(canonicalVarietal("bernardina")).toBe("Bernardina");
    expect(canonicalVarietal("MONTE CRISTO")).toBe("Monte Cristo");
  });
});

describe("isBlendLabel", () => {
  it("flags catch-all mix terms, not specific cultivars", () => {
    expect(isBlendLabel("Heirloom")).toBe(true);
    expect(isBlendLabel("Ethiopian Heirloom")).toBe(true);
    expect(isBlendLabel("Landrace")).toBe(true);
    expect(isBlendLabel("Field Blend")).toBe(true);
    expect(isBlendLabel("SL28")).toBe(false);
    expect(isBlendLabel("Gesha")).toBe(false);
  });
});

describe("varietalGroup", () => {
  const coffee = (varietals: string[], origin: string, region = "") => ({ varietals, origin, region });

  it("returns null for empty varietals", () => {
    expect(varietalGroup(coffee([], "Kenya"))).toBeNull();
  });

  it("groups multi-origin bags by their countries from region", () => {
    expect(varietalGroup(coffee(["Caturra", "Heirloom"], "Blend", "Colombia · Ethiopia")))
      .toBe("Colombia/Ethiopia blend");
    expect(varietalGroup(coffee(["Caturra"], "Blend", ""))).toBe("Blend");
  });

  it("groups 2+ varietals as {origin} field blend", () => {
    expect(varietalGroup(coffee(["SL28", "SL34", "Ruiru 11"], "Kenya"))).toBe("Kenya field blend");
    expect(varietalGroup(coffee(["Caturra", "Castillo"], "Guatemala"))).toBe("Guatemala field blend");
    expect(varietalGroup(coffee(["Caturra", "Castillo"], ""))).toBe("Field blend");
  });

  it("groups a single blend label as {origin} field blend", () => {
    expect(varietalGroup(coffee(["Heirloom"], "Ethiopia"))).toBe("Ethiopia field blend");
  });

  it("groups a single specific varietal by canonical name", () => {
    expect(varietalGroup(coffee(["Castillo"], "Colombia"))).toBe("Castillo");
    expect(varietalGroup(coffee(["geisha"], "Panama"))).toBe("Gesha");
  });
});

// Learned-cache tests last — setLearnedVarietals mutates module state.
describe("learned cache", () => {
  it("reports unknown tokens, then honours learned entries", () => {
    expect(unknownVarietals(["SL28", "Bernardina"])).toEqual(["bernardina"]);
    setLearnedVarietals({ bernardina: { canonical: "Bernardina", is_blend_label: false } });
    expect(unknownVarietals(["Bernardina"])).toEqual([]);
    expect(canonicalVarietal("bernardina")).toBe("Bernardina");
  });

  it("uses learned blend flags in grouping", () => {
    setLearnedVarietals({ "local varieties": { canonical: "Local Varieties", is_blend_label: true } });
    expect(varietalGroup({ varietals: ["Local Varieties"], origin: "Peru", region: "" }))
      .toBe("Peru field blend");
  });
});

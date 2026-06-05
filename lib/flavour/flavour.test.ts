import { describe, it, expect } from "vitest";
import { noteIcon, coffeeColor, NOTE_COLORS, processCategory } from "./index";

// ---- Lexicon spot-checks ----

describe("noteIcon — wheel-aligned taxonomy", () => {
  it("maps lemon → citrus", () => expect(noteIcon("lemon")).toBe("citrus"));
  it("maps orange → citrus", () => expect(noteIcon("orange")).toBe("citrus"));
  it("maps peach → yellowfruit", () => expect(noteIcon("peach")).toBe("yellowfruit"));
  it("maps mango → yellowfruit", () => expect(noteIcon("mango")).toBe("yellowfruit"));
  it("maps tropical → yellowfruit", () => expect(noteIcon("tropical")).toBe("yellowfruit"));
  it("maps apple → yellowfruit", () => expect(noteIcon("apple")).toBe("yellowfruit"));
  it("maps cherry → redfruit", () => expect(noteIcon("cherry")).toBe("redfruit"));
  it("maps strawberry → redfruit", () => expect(noteIcon("strawberry")).toBe("redfruit"));
  it("maps raspberry → redfruit", () => expect(noteIcon("raspberry")).toBe("redfruit"));
  it("maps red fruit → redfruit", () => expect(noteIcon("red fruit")).toBe("redfruit"));
  it("maps plum → redfruit", () => expect(noteIcon("plum")).toBe("redfruit"));
  it("maps blueberry → berry (dark fruit)", () => expect(noteIcon("blueberry")).toBe("berry"));
  it("maps blackberry → berry (dark fruit)", () => expect(noteIcon("blackberry")).toBe("berry"));
  it("maps dark fruit → berry", () => expect(noteIcon("blackcurrant")).toBe("berry"));
  it("maps chocolate → choco", () => expect(noteIcon("chocolate")).toBe("choco"));
  it("maps cocoa → choco", () => expect(noteIcon("cocoa")).toBe("choco"));
  it("maps smoke → roast", () => expect(noteIcon("smoke")).toBe("roast"));
  it("maps roasted → roast", () => expect(noteIcon("roasted")).toBe("roast"));
  it("maps burnt → roast", () => expect(noteIcon("burnt")).toBe("roast"));
  it("maps hazelnut → nut", () => expect(noteIcon("hazelnut")).toBe("nut"));
  it("maps caramel → sugar", () => expect(noteIcon("caramel")).toBe("sugar"));
  it("maps honey → sugar", () => expect(noteIcon("honey")).toBe("sugar"));
  it("maps cinnamon → spice", () => expect(noteIcon("cinnamon")).toBe("spice"));
  it("maps cardamom → spice", () => expect(noteIcon("cardamom")).toBe("spice"));
  it("maps wine → wine", () => expect(noteIcon("wine")).toBe("wine"));
  it("maps fermented → wine", () => expect(noteIcon("fermented")).toBe("wine"));
  it("maps herbal → leaf", () => expect(noteIcon("herbal")).toBe("leaf"));
  it("maps mint → leaf", () => expect(noteIcon("mint")).toBe("leaf"));
  it("maps woody → leaf", () => expect(noteIcon("woody")).toBe("leaf"));
  it("maps floral → flower", () => expect(noteIcon("floral")).toBe("flower"));
  it("maps unknown → drop", () => expect(noteIcon("xyzzy")).toBe("drop"));

  // Disambiguation: roast should NOT hit choco
  it("roast stays in roast, not choco", () => expect(noteIcon("roast")).toBe("roast"));
  // spice words should NOT hit sugar
  it("cinnamon stays in spice, not sugar", () => expect(noteIcon("cinnamon")).toBe("spice"));
  // pineapple should hit yellowfruit, not citrus
  it("pineapple → yellowfruit, not citrus", () => expect(noteIcon("pineapple")).toBe("yellowfruit"));
});

// ---- Non-flavour descriptors map to sensible families (no longer grey) ----

describe("noteIcon — acidity / body / texture descriptors", () => {
  // acidity / effervescence → citrus
  it("sparkly → citrus", () => expect(noteIcon("sparkly")).toBe("citrus"));
  it("bright → citrus", () => expect(noteIcon("bright")).toBe("citrus"));
  it("juicy → citrus", () => expect(noteIcon("juicy")).toBe("citrus"));
  it("zesty → citrus", () => expect(noteIcon("zesty")).toBe("citrus"));
  it("crisp → citrus", () => expect(noteIcon("crisp")).toBe("citrus"));
  it("clean → citrus", () => expect(noteIcon("clean")).toBe("citrus"));

  // body / sweetness texture → sugar
  it("silky → sugar", () => expect(noteIcon("silky")).toBe("sugar"));
  it("syrupy → sugar", () => expect(noteIcon("syrupy")).toBe("sugar"));
  it("velvety → sugar", () => expect(noteIcon("velvety")).toBe("sugar"));

  // dairy / creamy texture → nut
  it("creamy → nut", () => expect(noteIcon("creamy")).toBe("nut"));
  it("buttery → nut", () => expect(noteIcon("buttery")).toBe("nut"));

  // descriptor must not override a specific fruit family in a multi-word note
  it("'juicy strawberry' still → redfruit", () => expect(noteIcon("juicy strawberry")).toBe("redfruit"));

  // genuinely family-less words remain unknown (handed to the LLM / default)
  it("complex → drop", () => expect(noteIcon("complex")).toBe("drop"));
  it("balanced → drop", () => expect(noteIcon("balanced")).toBe("drop"));
});

// ---- processCategory ----

describe("processCategory", () => {
  it("Washed → washed", () => expect(processCategory("Washed")).toBe("washed"));
  it("lowercase washed → washed", () => expect(processCategory("washed")).toBe("washed"));
  it("Natural → natural", () => expect(processCategory("Natural")).toBe("natural"));
  it("Dry → natural", () => expect(processCategory("Dry")).toBe("natural"));
  it("Honey → honey", () => expect(processCategory("Honey")).toBe("honey"));
  it("Anaerobic Honey → honey (honey wins)", () => expect(processCategory("Anaerobic Honey")).toBe("honey"));
  it("Carbonic Maceration → other", () => expect(processCategory("Carbonic Maceration")).toBe("other"));
  it("empty → other", () => expect(processCategory("")).toBe("other"));
});

// ---- coffeeColor ----

describe("coffeeColor", () => {
  it("single known note → exact family colour", () => {
    expect(coffeeColor(["blueberry"])).toBe(NOTE_COLORS.berry);
    expect(coffeeColor(["lemon"])).toBe(NOTE_COLORS.citrus);
  });

  it("all unknown notes → default colour #cf9a5a", () => {
    expect(coffeeColor(["xyzzy", "foobar"])).toBe("#cf9a5a");
  });

  it("empty notes → default colour #cf9a5a", () => {
    expect(coffeeColor([])).toBe("#cf9a5a");
  });

  it("mix of known and unknown → ignores unknowns, blends knowns", () => {
    const withUnknown = coffeeColor(["cherry", "xyzzy"]);
    const withoutUnknown = coffeeColor(["cherry"]);
    expect(withUnknown).toBe(withoutUnknown);
  });

  it("result is order-independent", () => {
    const ab = coffeeColor(["blueberry", "lemon"]);
    const ba = coffeeColor(["lemon", "blueberry"]);
    expect(ab).toBe(ba);
  });

  it("hue-diverse blend stays saturated (anti-mud test)", () => {
    // blueberry (purple) + lemon (yellow) — opposing hues on the wheel
    // Should NOT collapse to grey/brown. Check that result differs from grey.
    const result = coffeeColor(["blueberry", "lemon"]);
    // Parse result and grey to compare chroma (distance from grey axis)
    const hex = (h: string) => [
      parseInt(h.slice(1, 3), 16),
      parseInt(h.slice(3, 5), 16),
      parseInt(h.slice(5, 7), 16),
    ];
    const [r, g, b] = hex(result);
    const mid = (r + g + b) / 3;
    const chroma = Math.sqrt([(r - mid) ** 2, (g - mid) ** 2, (b - mid) ** 2].reduce((a, x) => a + x, 0));
    // A saturated colour has chroma > ~15 in 0-255 space
    expect(chroma).toBeGreaterThan(15);
  });

  it("dominant family pulls the result toward its hue", () => {
    // 3× redfruit + 1× choco — should be more red than brown
    const redDom = coffeeColor(["cherry", "cherry", "cherry", "chocolate"]);
    const brownDom = coffeeColor(["chocolate", "chocolate", "chocolate", "cherry"]);
    // red = high R; brown = lower R, more neutral. Dominant-red result should have higher R.
    const rRed = parseInt(redDom.slice(1, 3), 16);
    const rBrown = parseInt(brownDom.slice(1, 3), 16);
    expect(rRed).toBeGreaterThan(rBrown);
  });
});

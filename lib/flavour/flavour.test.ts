import { describe, it, expect } from "vitest";
import { noteIcon, coffeeColor, NOTE_COLORS } from "./index";

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

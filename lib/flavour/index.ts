// Flavour-note categorisation — 3-tier: lexicon → learned cache → "other"

// ---- Colour-space helpers (no external deps) ----

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

function hexToLinear(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    srgbToLinear(parseInt(h.slice(0, 2), 16) / 255),
    srgbToLinear(parseInt(h.slice(2, 4), 16) / 255),
    srgbToLinear(parseInt(h.slice(4, 6), 16) / 255),
  ];
}

// Björn Ottosson's OKLab — linear sRGB ↔ perceptual Lab
function linearToOklab(r: number, g: number, b: number): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

function oklabToLinear(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
     4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

function linearToHex(r: number, g: number, b: number): string {
  const ch = (v: number) =>
    Math.round(Math.max(0, Math.min(1, linearToSrgb(v))) * 255)
      .toString(16)
      .padStart(2, "0");
  return "#" + ch(r) + ch(g) + ch(b);
}

// ---- Taxonomy (aligned to the coffee tasting wheel) ----

export type FlavourFamily =
  | "flower" | "citrus" | "yellowfruit" | "redfruit" | "berry"
  | "choco" | "roast" | "nut" | "sugar" | "spice" | "wine" | "leaf" | "drop";

// First-match lexicon — order matters; more-specific families listed before general ones.
// "redfruit" before "berry" so strawberry/raspberry hit redfruit; roast before leaf for smoke/ash.
const NOTE_ICONS: Array<[RegExp, FlavourFamily]> = [
  [/jasmine|floral|flower|honeysuckle|rose|lavender|blossom|elderflower|chamomile|hibiscus|geranium|violet|lilac|orange ?blossom|perfum|potpourri/, "flower"],
  [/\bcitrus|lemon|lime|\borange|grapefruit|bergamot|mandarin|tangerine|clementine|yuzu|pomelo|kumquat|zest/, "citrus"],
  [/peach|apricot|nectarine|mango|pineapple|papaya|passion|banana|melon|lychee|coconut|\bapple|\bpear|guava|tropical|stone ?fruit/, "yellowfruit"],
  [/cherry|strawberr|raspberry|redcurrant|cranberry|pomegranate|red ?fruit|\bplum|jammy/, "redfruit"],
  [/blueberry|blackberry|blackcurrant|\bcurrant|\bgrape|\bfig|\bdate|raisin|prune|sultana|mulberry|boysenberry|gooseberry|acai|elderberry|dried ?fruit|\bberry|\bberries/, "berry"],
  [/chocolate|cocoa|cacao|fudge|mocha|brownie|truffle|cocoa ?nib/, "choco"],
  [/\broast|toast|smoke|smoky|burnt|\bash\b|char/, "roast"],
  [/almond|walnut|hazelnut|peanut|pecan|cashew|macadamia|marzipan|praline|\bnut|nutty|malt|biscuit|bread|cereal|graham|cracker|granola|\boat|shortbread|digestive/, "nut"],
  [/caramel|brown ?sugar|cane ?sugar|\bsugar|honey|candied|syrup|toffee|molasses|maple|vanilla|butterscotch|nougat|panela|sweet/, "sugar"],
  [/cinnamon|clove|nutmeg|cardamom|ginger|baking|anise|\bspice/, "spice"],
  [/wine|winey|boozy|\brum|ferment|funky|brandy|\bport\b|whisk|champagne|cognac|liqueur|sherry|booze/, "wine"],
  [/\btea|herbal|\bherb|mint|grass|grassy|green|vegetal|vegetable|tomato|tobacco|\bhay|savory|savoury|thyme|basil|sage|eucalyptus|cedar|pine|earth|leather|mushroom|woody|\bwood/, "leaf"],
];

// App-harmonised palette — warm, mid-luminance, readable on near-black --surface #1a1816.
export const NOTE_COLORS: Record<FlavourFamily, string> = {
  flower:     "#d98fb0", // dusty pink
  citrus:     "#e0c14e", // warm lemon
  yellowfruit:"#e0954e", // warm peach-orange
  redfruit:   "#d76a58", // warm red
  berry:      "#a886c4", // muted purple
  choco:      "#a06a47", // medium brown
  roast:      "#8a7060", // warm charcoal
  nut:        "#cda877", // tan/caramel
  sugar:      "#e0a55f", // amber
  spice:      "#c77b4a", // terracotta
  wine:       "#c06b7d", // wine/magenta
  leaf:       "#93ad6d", // sage green
  drop:       "#9c9385", // neutral grey
};

export const FAMILY_LABEL: Record<FlavourFamily, string> = {
  flower:     "Floral",
  citrus:     "Citrus",
  yellowfruit:"Yellow fruit",
  redfruit:   "Red fruit",
  berry:      "Dark fruit",
  choco:      "Chocolate",
  roast:      "Roasty",
  nut:        "Nutty & malt",
  sugar:      "Sweet",
  spice:      "Spice",
  wine:       "Winey & fermented",
  leaf:       "Herbal & green",
  drop:       "Other",
};

// In-memory learned cache (populated from DB on mount, shared across the session)
let learnedNotes: Record<string, FlavourFamily> = {};

export function setLearnedNotes(map: Record<string, FlavourFamily>) {
  learnedNotes = { ...learnedNotes, ...map };
}

// ---- Classification ----

export function noteIcon(note: string): FlavourFamily {
  const n = (note || "").toLowerCase().trim();
  for (const [re, fam] of NOTE_ICONS) if (re.test(n)) return fam;
  if (learnedNotes[n]) return learnedNotes[n];
  return "drop";
}

export function noteColor(note: string): string {
  return NOTE_COLORS[noteIcon(note)] ?? NOTE_COLORS.drop;
}

export function familyColor(fam: FlavourFamily | string): string {
  return NOTE_COLORS[fam as FlavourFamily] ?? NOTE_COLORS.drop;
}

export function familyLabel(fam: FlavourFamily | string): string {
  return FAMILY_LABEL[fam as FlavourFamily] ?? "Other";
}

export function isNoteKnown(note: string): boolean {
  const n = note.toLowerCase().trim();
  for (const [re] of NOTE_ICONS) if (re.test(n)) return true;
  return !!learnedNotes[n];
}

export function unknownNotes(notes: string[]): string[] {
  return [...new Set(notes.map((n) => n.toLowerCase().trim()).filter(Boolean))].filter(
    (n) => !isNoteKnown(n)
  );
}

// ---- Multi-note blend ----
// Derives a single colour for a coffee from all its tasting notes using a
// frequency-weighted OKLCH blend. Mean chroma is preserved (no collapse to grey);
// hue is the weighted vector sum of each family's hue, with a dominant-family
// fallback when hues cancel. Order-independent.

const DEFAULT_COLOR = "#cf9a5a";
const HUE_CANCEL_EPS = 0.002; // OKLCH chroma units — threshold for near-zero vector sum

export function coffeeColor(notes: string[]): string {
  // Map to families, strip unknowns/grey
  const families = notes.map(noteIcon).filter((f) => f !== "drop");
  if (families.length === 0) return DEFAULT_COLOR;

  // Frequency tally — dominant family pulls the hue hardest
  const counts: Partial<Record<FlavourFamily, number>> = {};
  for (const f of families) counts[f] = (counts[f] ?? 0) + 1;
  const total = families.length;

  let Lout = 0, Cout = 0, aVec = 0, bVec = 0;
  let domFam: FlavourFamily = families[0];
  let domWeight = 0;

  for (const [fam, count] of Object.entries(counts) as [FlavourFamily, number][]) {
    const w = count / total;
    if (w > domWeight) { domWeight = w; domFam = fam; }

    const [lr, lg, lb] = hexToLinear(NOTE_COLORS[fam]);
    const [L, a, b] = linearToOklab(lr, lg, lb);
    const C = Math.sqrt(a * a + b * b);
    const h = Math.atan2(b, a);

    Lout += w * L;
    Cout += w * C;               // mean chroma — never collapses
    aVec += w * C * Math.cos(h); // weighted vector for hue direction
    bVec += w * C * Math.sin(h);
  }

  // Determine output hue
  let aOut: number, bOut: number;
  if (Math.sqrt(aVec * aVec + bVec * bVec) < HUE_CANCEL_EPS) {
    // Hues cancel (e.g. berry + citrus at equal weight) — fall back to dominant family's hue
    const [lr, lg, lb] = hexToLinear(NOTE_COLORS[domFam]);
    const [, da, db] = linearToOklab(lr, lg, lb);
    const dh = Math.atan2(db, da);
    aOut = Cout * Math.cos(dh);
    bOut = Cout * Math.sin(dh);
  } else {
    const hOut = Math.atan2(bVec, aVec);
    aOut = Cout * Math.cos(hOut);
    bOut = Cout * Math.sin(hOut);
  }

  const [r, g, b] = oklabToLinear(Lout, aOut, bOut);
  return linearToHex(r, g, b);
}

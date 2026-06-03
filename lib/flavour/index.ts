// Flavour-note categorisation — 3-tier: lexicon → learned cache → "other"

export type FlavourFamily =
  | "flower" | "citrus" | "berry" | "cherry" | "choco"
  | "nut" | "sugar" | "wine" | "leaf" | "drop";

const NOTE_ICONS: Array<[RegExp, FlavourFamily]> = [
  [/jasmine|floral|flower|honeysuckle|rose|lavender|blossom|elderflower|chamomile|hibiscus|geranium|violet|lilac|orange ?blossom|perfum|potpourri/, "flower"],
  [/citrus|lemon|lime|orange|grapefruit|bergamot|mandarin|tangerine|clementine|yuzu|pomelo|kumquat|zest|tropical|mango|pineapple|papaya|passion|guava|banana|melon|kiwi|lychee|coconut/, "citrus"],
  [/berry|berries|blueberry|blackberry|raspberry|strawberr|blackcurrant|currant|cranberry|boysenberry|mulberry|gooseberry|acai|elderberry/, "berry"],
  [/cherry|plum|peach|apricot|nectarine|apple|pear|grape|fig|date|raisin|prune|pomegranate|red ?fruit|stone ?fruit|dried ?fruit|jammy|sultana/, "cherry"],
  [/chocolate|cocoa|cacao|fudge|mocha|brownie|truffle|cocoa ?nib|roast|toast|smoke|smoky|burnt/, "choco"],
  [/almond|walnut|hazelnut|peanut|pecan|cashew|macadamia|marzipan|praline|\bnut|nutty|malt|biscuit|bread|cereal|graham|cracker|granola|\boat|shortbread|digestive/, "nut"],
  [/caramel|brown ?sugar|cane ?sugar|\bsugar|honey|candied|syrup|toffee|molasses|maple|vanilla|butterscotch|nougat|panela|sweet|cinnamon|clove|nutmeg|cardamom|ginger|spice|baking|anise/, "sugar"],
  [/wine|winey|boozy|\brum|ferment|funky|brandy|\bport\b|whisk|champagne|cognac|liqueur|sherry|booze/, "wine"],
  [/\btea|herbal|\bherb|mint|grass|grassy|green|vegetal|vegetable|tomato|tobacco|\bhay|savory|savoury|thyme|basil|sage|eucalyptus|cedar|pine|earth|leather|mushroom|woody|\bwood/, "leaf"],
];

export const NOTE_COLORS: Record<FlavourFamily, string> = {
  flower: "#d98fb0", citrus: "#e3b552", berry: "#a886c4", cherry: "#d97a6a",
  choco: "#b07d52", nut: "#cda877", sugar: "#e0a55f", wine: "#c06b7d",
  leaf: "#93ad6d", drop: "#9c9385",
};

export const FAMILY_LABEL: Record<FlavourFamily, string> = {
  flower: "Floral", citrus: "Citrus & tropical", berry: "Berry", cherry: "Orchard fruit",
  choco: "Chocolate & roast", nut: "Nutty & malt", sugar: "Sweet & spice", wine: "Winey & fermented",
  leaf: "Herbal & green", drop: "Other",
};

// In-memory learned cache (populated from DB on mount, shared across the session)
let learnedNotes: Record<string, FlavourFamily> = {};

export function setLearnedNotes(map: Record<string, FlavourFamily>) {
  learnedNotes = { ...learnedNotes, ...map };
}

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

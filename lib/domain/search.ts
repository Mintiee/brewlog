/**
 * Shelf search, filter facets and producer linking. Pure functions over the
 * in-memory shelf — every coffee (finished ones included) is already on the
 * client, so there's no index: a substring scan over a few hundred
 * pre-normalised strings is well under a millisecond per keystroke.
 */
import type { Coffee } from "@/lib/types";
import { roasterKey, distinctRoasters } from "@/lib/domain";

/** Lowercase, accent-free, single-spaced — so "Café Paraíso" matches "cafe paraiso". */
export function normalizeText(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Everything a query can hit, joined and normalised once per coffee. */
export function coffeeHaystack(c: Coffee): string {
  return normalizeText([
    c.roaster, c.name, c.producer ?? "", c.origin, c.region,
    ...c.varietals, c.process, ...c.notes,
  ].join(" "));
}

export function searchTokens(query: string): string[] {
  return normalizeText(query).split(" ").filter(Boolean);
}

/** Every token must appear somewhere (AND), so "gesha panama" narrows. */
export function matchesTokens(haystack: string, tokens: string[]): boolean {
  return tokens.every((t) => haystack.includes(t));
}

export interface ShelfFilter {
  query: string;
  /** normalizeText(origin) of the selected origin chip, or null. */
  origin: string | null;
  /** roasterKey of the selected roaster, or null. */
  roaster: string | null;
}

export function isFilterActive(f: ShelfFilter): boolean {
  return searchTokens(f.query).length > 0 || f.origin != null || f.roaster != null;
}

/**
 * Coffees matching the filter. `haystacks` lets the caller build the strings
 * once per shelf change rather than once per keystroke; any coffee missing
 * from it is normalised on the fly.
 */
export function filterCoffees(coffees: Coffee[], f: ShelfFilter, haystacks?: Map<string, string>): Coffee[] {
  const tokens = searchTokens(f.query);
  return coffees.filter((c) => {
    if (f.origin != null && normalizeText(c.origin) !== f.origin) return false;
    if (f.roaster != null && roasterKey(c.roaster || "") !== f.roaster) return false;
    if (!tokens.length) return true;
    return matchesTokens(haystacks?.get(c.id) ?? coffeeHaystack(c), tokens);
  });
}

export interface Facet {
  key: string;
  name: string;
  count: number;
}

const byCountThenName = (a: Facet, b: Facet) => b.count - a.count || a.name.localeCompare(b.name);

/** Roasters by bag count, one canonical spelling each (see distinctRoasters). */
export function roasterFacets(coffees: Coffee[]): Facet[] {
  const counts = new Map<string, number>();
  for (const c of coffees) {
    const k = roasterKey(c.roaster || "");
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return distinctRoasters(coffees)
    .map((name) => { const key = roasterKey(name); return { key, name, count: counts.get(key) ?? 0 }; })
    .sort(byCountThenName);
}

/** Origins by bag count; the spelling shown is the first one seen. */
export function originFacets(coffees: Coffee[]): Facet[] {
  const byKey = new Map<string, Facet>();
  for (const c of coffees) {
    const name = (c.origin || "").trim();
    const key = normalizeText(name);
    if (!key || key === "—") continue;
    const f = byKey.get(key);
    if (f) f.count++;
    else byKey.set(key, { key, name, count: 1 });
  }
  return [...byKey.values()].sort(byCountThenName);
}

// ---------- Producer linking ----------
//
// Bag names are meant to identify the farm/producer ("Hacienda La Esmeralda",
// "El Desarrollo · Lot 14"), so the producer is guessed from the name unless the
// coffee carries an explicit `producer` override.

/** Lot/separator suffixes — only the first segment names the producer. */
const SEGMENT_SPLIT = /\s*(?:·|\||\/|\(|,|\s-\s|\s–\s|\s—\s)\s*/;

/** Farm-type words that vary between roasters printing the same farm. */
const FARM_PREFIX = /^(?:finca|hacienda|fazenda|granja|farm|estate|sitio|quinta|beneficio|cafe)\s+/;
const FARM_SUFFIX = /\s+(?:farm|estate|washing station|station|ws|cooperative|coop|co-op)$/;

/** Words that describe the lot, not who grew it. */
const LOT_WORDS = new Set([
  "lot", "no", "nr", "aa", "ab", "pb", "aaa", "grade", "g1", "g2", "decaf", "microlot", "nano", "nanolot",
  "washed", "natural", "honey", "anaerobic", "carbonic", "maceration", "fermented", "wet", "hulled",
  "pulped", "semi", "red", "yellow", "black", "white", "double", "experimental", "process",
  "light", "medium", "dark", "roast", "espresso", "filter", "omni",
]);

function stripLotWords(seg: string, own: Set<string>): string {
  return seg
    .split(" ")
    .filter((w) => w && !LOT_WORDS.has(w) && !own.has(w) && !/^#?\d+[a-z]?$/.test(w))
    .join(" ");
}

/** Words this coffee already spends on origin/region/varietal/process. */
function ownWords(c: Coffee): Set<string> {
  const words = [c.origin, c.region, c.process, ...c.varietals]
    .flatMap((s) => normalizeText(s || "").split(/[\s,·]+/))
    .filter((w) => w.length > 1);
  return new Set(words);
}

/** First name segment with lot/process/origin words removed, original casing kept. */
function cleanedNameSegment(c: Coffee): string {
  const seg = (c.name || "").split(SEGMENT_SPLIT)[0] ?? "";
  const own = ownWords(c);
  return seg
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => {
      const n = normalizeText(w);
      return n && !LOT_WORDS.has(n) && !own.has(n) && !/^#?\d+[a-z]?$/.test(n);
    })
    .join(" ");
}

function keyOf(s: string, own: Set<string>): string | null {
  let k = normalizeText(s).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  k = stripLotWords(k, own);
  // Strip once, then again: "Finca La Hacienda Estate" style stacks are rare but cheap.
  for (let i = 0; i < 2; i++) k = k.replace(FARM_PREFIX, "").replace(FARM_SUFFIX, "").trim();
  return k.replace(/\s+/g, "").length >= 3 ? k : null;
}

/**
 * Matching key for a coffee's producer, or null when the name doesn't look like
 * one (region-style names such as "Ethiopia Guji" strip down to nothing).
 * An explicit override is keyed the same way but without dropping this coffee's
 * own origin/region words — you typed it, so it's taken at face value.
 */
export function producerKey(c: Coffee): string | null {
  const override = (c.producer || "").trim();
  if (override) return keyOf(override, new Set());
  return keyOf(cleanedNameSegment(c), ownWords(c));
}

/**
 * Display form of the producer: the override as typed, else the cleaned name
 * segment minus farm-type words, so linked bags share one heading ("El Desarrollo"
 * whether the bag said "Finca El Desarrollo" or "El Desarrollo · Lot 9").
 */
export function producerLabel(c: Coffee): string | null {
  const override = (c.producer || "").trim();
  if (override) return override;
  if (!producerKey(c)) return null;
  let label = cleanedNameSegment(c);
  for (let i = 0; i < 2; i++) {
    label = label.replace(new RegExp(FARM_PREFIX.source, "i"), "").replace(new RegExp(FARM_SUFFIX.source, "i"), "").trim();
  }
  return label;
}

/** Other bags from the same producer, newest roast first. */
export function relatedByProducer(coffee: Coffee, coffees: Coffee[]): Coffee[] {
  const key = producerKey(coffee);
  if (!key) return [];
  return coffees
    .filter((c) => c.id !== coffee.id && producerKey(c) === key)
    .sort((a, b) => (b.roasted_at || "").localeCompare(a.roasted_at || ""));
}

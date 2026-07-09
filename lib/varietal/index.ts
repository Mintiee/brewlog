// Varietal parsing, canonicalisation and stats grouping — 3-tier like flavour
// notes: static alias map → learned cache (LLM-validated) → title-cased verbatim.

import type { Coffee } from "@/lib/types";

export interface LearnedVarietal {
  canonical: string;
  is_blend_label: boolean;
}

// ---- Parsing ----

// Bags separate varietals with commas, middots, slashes, semicolons, plus or
// ampersand. "—" is the legacy empty-varietal sentinel from the string era.
const SEPARATORS = /[,·;/+&]/;

export function parseVarietals(raw: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of (raw || "").split(SEPARATORS)) {
    const tok = part.trim();
    if (!tok || tok === "—") continue;
    const key = normKey(tok);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tok);
  }
  return out;
}

// ---- Canonicalisation ----

// Lookup key: lowercase with spaces/hyphens collapsed so "SL-28", "sl 28" and
// "SL28" all hit one alias entry.
function normKey(token: string): string {
  return token.toLowerCase().replace(/[\s-]+/g, "");
}

// Learned-table keys are stored lowercased + trimmed (like learned_notes), NOT
// space-collapsed — this matches what /api/classify-varietals normalises to.
function learnedKey(token: string): string {
  return token.toLowerCase().trim();
}

interface AliasEntry {
  canonical: string;
  blend?: true;
}

// Static alias map — common cultivars and their spelling variants. Blend labels
// are terms that denote an unspecified mix of varieties (Ethiopian landrace
// catch-alls, "field blend", "various") rather than one cultivar.
const ALIASES: Record<string, AliasEntry> = {};
function alias(canonical: string, variants: string[] = [], blend?: true) {
  for (const v of [canonical, ...variants]) {
    ALIASES[normKey(v)] = blend ? { canonical, blend } : { canonical };
  }
}

// Kenyan
alias("SL28");
alias("SL34");
alias("Ruiru 11", ["ruiru11", "ruiru"]);
alias("Batian");
alias("K7");
// Ethiopian specific cultivars (JARC selections keep their numbers)
alias("74110", ["jarc 74110"]);
alias("74158", ["jarc 74158"]);
alias("74112", ["jarc 74112"]);
alias("Kurume");
alias("Wolisho", ["welicho"]);
alias("Dega");
alias("Wush Wush", ["wushwush"]);
// Ethiopian catch-alls — blend labels
alias("Heirloom", ["ethiopian heirloom", "ethiopia heirloom", "heirlooms", "ethiopian landrace", "landrace", "landraces", "local landraces", "indigenous heirloom"], true);
// Generic blend labels
alias("Field Blend", ["fieldblend"], true);
alias("Various", ["various varieties", "varied", "assorted"], true);
alias("Mixed", ["mixed varieties", "mix"], true);
// Bourbon family — qualifiers are meaningful, so each is its own canonical
alias("Bourbon", ["bourbón", "burbon"]);
alias("Pink Bourbon", ["bourbon rosado"]);
alias("Yellow Bourbon", ["bourbon amarelo"]);
alias("Red Bourbon", ["bourbon vermelho"]);
// Latin American workhorses
alias("Caturra");
alias("Castillo");
alias("Typica");
alias("Catuai", ["catuaí", "yellow catuai", "red catuai"]);
alias("Pacamara");
alias("Pacas");
alias("Maragogipe", ["maragogype"]);
alias("Mundo Novo");
alias("Colombia", ["variedad colombia"]);
alias("Tabi");
alias("Anacafe 14", ["anacafe14", "anacafé 14"]);
alias("Parainema");
alias("Sidra");
alias("Chiroso", ["caturra chiroso"]);
alias("Cenicafe 1", ["cenicafé 1"]);
alias("Catimor");
alias("Sarchimor");
alias("Villa Sarchi", ["villasarchi", "villa sarchí"]);
alias("Gesha", ["geisha", "panama geisha", "panamanian geisha"]);
alias("Java");
alias("Kent");
alias("SL9");
alias("Marsellesa");
alias("Obata", ["obatã"]);
alias("Mokka", ["mocca", "moka"]);
alias("Laurina");

// ---- Learned cache (populated from DB on mount, shared across the session) ----

let learnedVarietals: Record<string, LearnedVarietal> = {};

export function setLearnedVarietals(map: Record<string, LearnedVarietal>) {
  learnedVarietals = { ...learnedVarietals, ...map };
}

export function isVarietalKnown(token: string): boolean {
  return !!ALIASES[normKey(token)] || !!learnedVarietals[learnedKey(token)];
}

/** Tokens (lowercased/trimmed, deduped) not covered by the alias map or the
 *  learned cache — candidates for LLM classification. */
export function unknownVarietals(tokens: string[]): string[] {
  return [...new Set(tokens.map((t) => learnedKey(t)).filter(Boolean))].filter(
    (t) => !isVarietalKnown(t)
  );
}

function titleCase(token: string): string {
  return token.replace(/\p{L}+/gu, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

export function canonicalVarietal(token: string): string {
  const a = ALIASES[normKey(token)];
  if (a) return a.canonical;
  const l = learnedVarietals[learnedKey(token)];
  if (l) return l.canonical;
  return titleCase(token.trim());
}

export function isBlendLabel(token: string): boolean {
  const a = ALIASES[normKey(token)];
  if (a) return !!a.blend;
  const l = learnedVarietals[learnedKey(token)];
  if (l) return l.is_blend_label;
  return false;
}

// ---- Stats grouping ----

/**
 * Derives the stats bucket for a coffee's varietals. Proportions within a bag
 * are unknown, so mixes are grouped by origin rather than split:
 *  - no varietals            → null (excluded from the varietal card)
 *  - multi-origin bag        → "Colombia/Ethiopia blend" (countries from region)
 *  - 2+ varietals, or a single blend label (Heirloom…) → "{Origin} field blend"
 *  - one specific varietal   → its canonical name
 */
export function varietalGroup(coffee: Pick<Coffee, "varietals" | "origin" | "region">): string | null {
  const varietals = coffee.varietals ?? [];
  if (varietals.length === 0) return null;

  const origin = (coffee.origin || "").trim();
  if (origin.toLowerCase() === "blend") {
    const countries = (coffee.region || "").split(/[·,/]/).map((c) => c.trim()).filter(Boolean);
    return countries.length ? `${countries.join("/")} blend` : "Blend";
  }

  if (varietals.length >= 2 || isBlendLabel(varietals[0])) {
    return origin ? `${origin} field blend` : "Field blend";
  }

  return canonicalVarietal(varietals[0]);
}

// Unified Palate stats: one descriptor shape for every bar-style card, so the
// Stats view can order them by how strongly they discriminate and optionally
// hide flat ones. Bespoke cards (insight, tips, trend, face-off) live elsewhere.
import type { Brew, Coffee, Config } from "@/lib/types";
import { brewRating } from "@/lib/domain";
import { noteIcon, familyColor, familyLabel } from "@/lib/flavour";

export interface StatRow {
  key: string;
  label: string;
  barFrac: number;        // 0–1 bar fill
  right: string;          // right-aligned readout (e.g. "4.2★" or "12")
  color?: string;         // bar/label colour override (flavour families)
  icon?: string;          // leading icon (flavour families)
}

export interface StatCard {
  id: string;
  title: string;
  rows: StatRow[];
  spread: number;         // discrimination magnitude (★ range, or top volume share)
  score: number;          // ordering weight (spread × √n)
  notable: boolean;       // clears the "notable" threshold for its kind
}

const RATING_SPREAD_MIN = 0.6;   // ★ range to count as a notable rating split
const VOLUME_SHARE_MIN = 0.4;    // top entry's share of cups to count as notable

const coffeeMapOf = (coffees: Coffee[]) => new Map(coffees.map((c) => [c.id, c] as const));

function toCalendarDay(started_at: string | number): string {
  const d = new Date(typeof started_at === "string" ? Number(started_at) : started_at);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Assigns a synthetic session_id to groups of un-tagged brews that share the
 *  same coffee, brewer, dose, and calendar day — treating them as implicit shared brews. */
export function inferSharedSessions(brews: Brew[]): Brew[] {
  const keyCount = new Map<string, number>();
  for (const b of brews) {
    if (b.session_id) continue;
    const key = `${b.coffee_id}|${b.brewer_id}|${b.dose}|${toCalendarDay(b.started_at)}`;
    keyCount.set(key, (keyCount.get(key) ?? 0) + 1);
  }
  const keyToSession = new Map<string, string>();
  keyCount.forEach((count, key) => { if (count >= 2) keyToSession.set(key, `inferred:${key}`); });
  if (!keyToSession.size) return brews;
  return brews.map((b) => {
    if (b.session_id) return b;
    const key = `${b.coffee_id}|${b.brewer_id}|${b.dose}|${toCalendarDay(b.started_at)}`;
    const sid = keyToSession.get(key);
    return sid ? { ...b, session_id: sid } : b;
  });
}

function deduplicateSessions(brews: Brew[]): Brew[] {
  const seen = new Set<string>();
  return brews.filter((b) => {
    if (!b.session_id) return true;
    if (seen.has(b.session_id)) return false;
    seen.add(b.session_id);
    return true;
  });
}

// Raw process name, anaerobic/anoxic variants lumped (matches the texture-free
// stats grouping used elsewhere).
function processLabel(raw: string): string | null {
  const p = (raw || "").trim();
  if (!p) return null;
  return /anaerobic|anoxic/i.test(p) ? "Anaerobic" : p;
}

// ---------- rating rankings (rated brews) ----------

interface RateAgg { sum: number; n: number; label: string; color?: string; icon?: string }

function ratingCard(
  id: string,
  title: string,
  rated: Brew[],
  keyer: (b: Brew) => { key: string; label: string; color?: string; icon?: string } | null,
): StatCard | null {
  const acc: Record<string, RateAgg> = {};
  rated.forEach((b) => {
    const k = keyer(b);
    if (!k) return;
    const o = acc[k.key] = acc[k.key] || { sum: 0, n: 0, label: k.label, color: k.color, icon: k.icon };
    o.sum += brewRating(b);
    o.n += 1;
  });
  const ranked = Object.entries(acc)
    .map(([key, o]) => ({ key, label: o.label, avg: o.sum / o.n, n: o.n, color: o.color, icon: o.icon }))
    .filter((x) => x.n >= 2)
    .sort((a, b) => b.avg - a.avg);
  if (ranked.length < 2) return null;

  const avgs = ranked.map((r) => r.avg);
  const spread = Math.max(...avgs) - Math.min(...avgs);
  const totalN = ranked.reduce((s, r) => s + r.n, 0);
  const rows: StatRow[] = ranked.map((r) => ({
    key: r.key, label: r.label, barFrac: r.avg / 5, right: `${r.avg.toFixed(1)}★`, color: r.color, icon: r.icon,
  }));
  return { id, title, rows, spread, score: spread * Math.sqrt(totalN), notable: spread >= RATING_SPREAD_MIN };
}

// Flavour is special: one brew contributes to every flavour family in its notes.
function flavourCard(rated: Brew[], cm: Map<string, Coffee>): StatCard | null {
  const acc: Record<string, { sum: number; n: number }> = {};
  rated.forEach((b) => {
    const c = cm.get(b.coffee_id);
    if (!c) return;
    [...new Set((c.notes || []).map((n) => noteIcon(n)))].forEach((f) => {
      const o = acc[f] = acc[f] || { sum: 0, n: 0 };
      o.sum += brewRating(b);
      o.n += 1;
    });
  });
  const ranked = Object.entries(acc)
    .map(([fam, o]) => ({ fam, avg: o.sum / o.n, n: o.n }))
    .filter((x) => x.n >= 2)
    .sort((a, b) => b.avg - a.avg);
  if (ranked.length < 2) return null;

  const avgs = ranked.map((r) => r.avg);
  const spread = Math.max(...avgs) - Math.min(...avgs);
  const totalN = ranked.reduce((s, r) => s + r.n, 0);
  const rows: StatRow[] = ranked.map((r) => ({
    key: r.fam, label: familyLabel(r.fam), barFrac: r.avg / 5, right: `${r.avg.toFixed(1)}★`, color: familyColor(r.fam), icon: r.fam,
  }));
  return { id: "flavour", title: "Flavours you're enjoying", rows, spread, score: spread * Math.sqrt(totalN), notable: spread >= RATING_SPREAD_MIN };
}

// Ratings by rest time — kept in brew (bucket) order to read as a freshness trend.
const REST_BUCKET = 5;
const REST_LABELS = ["0–4d", "5–9d", "10–14d", "15–19d", "20–24d", "25–29d", "30–34d", "35–39d", "40d+"];
function restCard(rated: Brew[]): StatCard | null {
  const acc: Record<number, { sum: number; n: number }> = {};
  rated.filter((b) => b.rest_days != null).forEach((b) => {
    const idx = Math.min(Math.floor(b.rest_days! / REST_BUCKET), REST_LABELS.length - 1);
    const o = acc[idx] = acc[idx] || { sum: 0, n: 0 };
    o.sum += brewRating(b);
    o.n += 1;
  });
  const buckets = Object.entries(acc)
    .map(([idx, o]) => ({ idx: Number(idx), avg: o.sum / o.n, n: o.n }))
    .sort((a, b) => a.idx - b.idx);
  if (buckets.length < 2) return null;

  const avgs = buckets.map((r) => r.avg);
  const spread = Math.max(...avgs) - Math.min(...avgs);
  const totalN = buckets.reduce((s, r) => s + r.n, 0);
  const rows: StatRow[] = buckets.map((r) => ({
    key: String(r.idx), label: REST_LABELS[r.idx], barFrac: r.avg / 5, right: `${r.avg.toFixed(1)}★`,
  }));
  return { id: "rest", title: "Ratings by rest time", rows, spread, score: spread * Math.sqrt(totalN), notable: spread >= RATING_SPREAD_MIN };
}

// ---------- volume (all brews) ----------

function volumeCard(
  id: string,
  title: string,
  brews: Brew[],
  keyer: (b: Brew) => { key: string; label: string } | null,
): StatCard | null {
  const acc: Record<string, { label: string; n: number }> = {};
  brews.forEach((b) => {
    const k = keyer(b);
    if (!k) return;
    const o = acc[k.key] = acc[k.key] || { label: k.label, n: 0 };
    o.n += 1;
  });
  const ranked = Object.entries(acc)
    .map(([key, o]) => ({ key, label: o.label, n: o.n }))
    .sort((a, b) => b.n - a.n);
  if (ranked.length < 2) return null;

  const total = ranked.reduce((s, r) => s + r.n, 0);
  const max = ranked[0].n || 1;
  const topShare = ranked[0].n / total;
  const rows: StatRow[] = ranked.map((r) => ({ key: r.key, label: r.label, barFrac: r.n / max, right: String(r.n) }));
  return { id, title, rows, spread: topShare, score: topShare * Math.sqrt(total), notable: topShare >= VOLUME_SHARE_MIN };
}

// ---------- assembly ----------

export interface PalateStats {
  trends: StatCard[];   // rest (paired with the bespoke RatingTrend in the view)
  love: StatCard[];     // rating rankings, score desc
  drink: StatCard[];    // volume, score desc
}

export function buildPalateStats(rated: Brew[], allBrews: Brew[], coffees: Coffee[], config: Config): PalateStats {
  const cm = coffeeMapOf(coffees);
  const byScore = (a: StatCard, b: StatCard) => b.score - a.score;

  // Deduplicate implicit shared brews for volume counts — each shared session counts once.
  const volumeBrews = deduplicateSessions(inferSharedSessions(allBrews));

  const love = [
    flavourCard(rated, cm),
    ratingCard("roaster", "Roasters you're enjoying", rated, (b) => {
      const r = cm.get(b.coffee_id)?.roaster?.trim();
      return r ? { key: r, label: r } : null;
    }),
    ratingCard("origin", "Origins you're enjoying", rated, (b) => {
      const o = cm.get(b.coffee_id)?.origin?.trim();
      return o ? { key: o, label: o } : null;
    }),
    ratingCard("varietal", "Varietals you're enjoying", rated, (b) => {
      const v = cm.get(b.coffee_id)?.varietal?.trim();
      return v ? { key: v, label: v } : null;
    }),
    ratingCard("process", "Processes you're enjoying", rated, (b) => {
      const p = processLabel(cm.get(b.coffee_id)?.process || "");
      return p ? { key: p, label: p } : null;
    }),
    ratingCard("brewer", "Brewers you're enjoying", rated, (b) => {
      const name = (config.brewers.find((x) => x.id === b.brewer_id)?.short || b.brewer_id || "").trim();
      return name ? { key: name, label: name } : null;
    }),
  ].filter((c): c is StatCard => c != null).sort(byScore);

  const drink = [
    volumeCard("vol-origin", "Cups by origin", volumeBrews, (b) => {
      const o = cm.get(b.coffee_id)?.origin?.trim();
      return o ? { key: o, label: o } : null;
    }),
    volumeCard("vol-roaster", "Cups by roaster", volumeBrews, (b) => {
      const r = cm.get(b.coffee_id)?.roaster?.trim();
      return r ? { key: r, label: r } : null;
    }),
    volumeCard("vol-process", "Cups by process", volumeBrews, (b) => {
      const p = processLabel(cm.get(b.coffee_id)?.process || "");
      return p ? { key: p, label: p } : null;
    }),
  ].filter((c): c is StatCard => c != null).sort(byScore);

  const rest = restCard(rated);
  return { trends: rest ? [rest] : [], love, drink };
}

"use client";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui";
import { brewRating, roastedDaysAgo } from "@/lib/domain";
import type { Brew, Coffee, Config } from "@/lib/types";

interface BrewingTipsProps {
  brews: Brew[];
  coffees: Coffee[];
  config: Config;
  llmEnabled: boolean;
}

interface Tip {
  icon: string;
  text: string;
}

// ---------- Heuristic tips (fallback when AI is off or the LLM path fails) ----------

function buildTips(brews: Brew[], coffees: Coffee[], config: Config): Tip[] {
  const tips: Tip[] = [];
  const rated = brews.filter((b) => b.stars != null);
  if (!rated.length) return tips;

  const avgOf = (arr: Brew[]) =>
    arr.length ? arr.reduce((s, b) => s + brewRating(b), 0) / arr.length : 0;

  // 1) Best brewer vs. worst
  const byBrewer: Record<string, Brew[]> = {};
  rated.forEach((b) => {
    (byBrewer[b.brewer_id] = byBrewer[b.brewer_id] || []).push(b);
  });
  const brewerRows = Object.entries(byBrewer)
    .map(([id, a]) => ({ id, avg: avgOf(a), n: a.length }))
    .filter((x) => x.n >= 2)
    .sort((a, b) => b.avg - a.avg);

  if (brewerRows.length >= 2) {
    const best = brewerRows[0];
    const worst = brewerRows[brewerRows.length - 1];
    if (best.avg - worst.avg >= 0.3) {
      const bestBrewer = config.brewers.find((br) => br.id === best.id);
      const worstBrewer = config.brewers.find((br) => br.id === worst.id);
      if (bestBrewer && worstBrewer) {
        tips.push({
          icon: "brew",
          text: `Your cups land ${(best.avg - worst.avg).toFixed(1)}★ higher on the ${bestBrewer.short} than the ${worstBrewer.short} — reach for it when it matters.`,
        });
      }
    }
  }

  // 2) Acidity / sweetness lean of favourites vs. lower-rated
  const hi = rated.filter((b) => brewRating(b) >= 4);
  const lo = rated.filter((b) => brewRating(b) <= 3);

  if (hi.length >= 2 && lo.length >= 2) {
    const acidHi = hi.filter((b) => b.acidity != null).reduce((s, b) => s + b.acidity!, 0) / hi.filter((b) => b.acidity != null).length;
    const acidLo = lo.filter((b) => b.acidity != null).reduce((s, b) => s + b.acidity!, 0) / lo.filter((b) => b.acidity != null).length;
    const sweetHi = hi.filter((b) => b.sweetness != null).reduce((s, b) => s + b.sweetness!, 0) / hi.filter((b) => b.sweetness != null).length;
    const sweetLo = lo.filter((b) => b.sweetness != null).reduce((s, b) => s + b.sweetness!, 0) / lo.filter((b) => b.sweetness != null).length;

    if (!isNaN(acidHi) && !isNaN(acidLo) && acidHi - acidLo >= 0.5) {
      tips.push({ icon: "citrus", text: "Your favourites skew brighter — grind a touch finer or go a degree hotter to chase acidity." });
    } else if (!isNaN(sweetHi) && !isNaN(sweetLo) && sweetHi - sweetLo >= 0.5) {
      tips.push({ icon: "sugar", text: "You rate sweeter cups higher — try a slightly finer grind or a touch more contact time to build sweetness." });
    }
  }

  // 3) Best process
  const byProc: Record<string, Brew[]> = {};
  rated.forEach((b) => {
    const c = coffees.find((x) => x.id === b.coffee_id);
    if (!c) return;
    (byProc[c.process] = byProc[c.process] || []).push(b);
  });
  const procRows = Object.entries(byProc)
    .map(([p, a]) => ({ p, avg: avgOf(a), n: a.length }))
    .filter((x) => x.n >= 2)
    .sort((a, b) => b.avg - a.avg);

  if (procRows.length >= 2 && procRows[0].avg - procRows[procRows.length - 1].avg >= 0.3) {
    tips.push({
      icon: "drop",
      text: `${procRows[0].p} coffees are landing best for you right now (${procRows[0].avg.toFixed(1)}★).`,
    });
  }

  return tips.slice(0, 3);
}

// ---------- Compact stats + rich digest for the LLM ----------

function avgRating(arr: Brew[]): number {
  return arr.length ? arr.reduce((s, b) => s + brewRating(b), 0) / arr.length : 0;
}

function meanAttr(arr: Brew[], k: "acidity" | "sweetness" | "body" | "clarity"): number | null {
  const v = arr.filter((b) => b[k] != null);
  return v.length ? v.reduce((s, b) => s + (b[k] as number), 0) / v.length : null;
}

/** A small authoritative stats block — enough to ground tips, not a full report. */
function buildStats(rated: Brew[], coffees: Coffee[], config: Config): string {
  const lines: string[] = [];
  lines.push(`${rated.length} rated brews, overall average ${avgRating(rated).toFixed(1)}/5.`);

  const g = config.grinder;
  lines.push(`Grinder: ${g.name} (${g.unit}, grind range ${g.grind_min}–${g.grind_max}, step ${g.grind_step}).`);

  // Per-brewer averages (only where there's enough signal)
  const byBrewer: Record<string, Brew[]> = {};
  rated.forEach((b) => { (byBrewer[b.brewer_id] = byBrewer[b.brewer_id] || []).push(b); });
  const brewerRows = Object.entries(byBrewer)
    .map(([id, a]) => {
      const br = config.brewers.find((x) => x.id === id);
      return { short: br?.short ?? id, avg: avgRating(a), n: a.length };
    })
    .filter((x) => x.n >= 2)
    .sort((a, b) => b.avg - a.avg);
  if (brewerRows.length) {
    lines.push("By brewer (avg★, n): " + brewerRows.map((r) => `${r.short} ${r.avg.toFixed(1)} (${r.n})`).join(", ") + ".");
  }

  // Per-process averages
  const byProc: Record<string, Brew[]> = {};
  rated.forEach((b) => {
    const c = coffees.find((x) => x.id === b.coffee_id);
    if (c) (byProc[c.process] = byProc[c.process] || []).push(b);
  });
  const procRows = Object.entries(byProc)
    .map(([p, a]) => ({ p, avg: avgRating(a), n: a.length }))
    .filter((x) => x.n >= 2)
    .sort((a, b) => b.avg - a.avg);
  if (procRows.length) {
    lines.push("By process (avg★, n): " + procRows.map((r) => `${r.p} ${r.avg.toFixed(1)} (${r.n})`).join(", ") + ".");
  }

  // Flavour lean of favourites vs lower-rated
  const hi = rated.filter((b) => brewRating(b) >= 4);
  const lo = rated.filter((b) => brewRating(b) <= 3);
  if (hi.length >= 2 && lo.length >= 2) {
    const parts: string[] = [];
    (["acidity", "sweetness", "body", "clarity"] as const).forEach((k) => {
      const h = meanAttr(hi, k);
      const l = meanAttr(lo, k);
      if (h != null && l != null) {
        const d = h - l;
        if (Math.abs(d) >= 0.4) parts.push(`${k} ${d > 0 ? "+" : ""}${d.toFixed(1)}`);
      }
    });
    if (parts.length) {
      lines.push(`Favourites (≥4★) vs lower (≤3★) flavour deltas: ${parts.join(", ")}.`);
    }
  }

  return lines.join("\n");
}

/** Rich per-brew lines: coffee, freshness, gear, full recipe, scores, note. */
function buildDigest(rated: Brew[], coffees: Coffee[], config: Config): string[] {
  return rated.slice(0, 16).map((b) => {
    const c = coffees.find((x) => x.id === b.coffee_id);
    const br = config.brewers.find((x) => x.id === b.brewer_id);
    const coffeeLabel = c ? `${c.roaster} ${c.name} — ${c.origin || "?"}, ${c.process}, ${c.roast}` : b.coffee_id;
    const age = c ? `${roastedDaysAgo(c)}d post-roast` : "age ?";
    const brewer = br?.short ?? b.brewer_id;
    const ratio = b.ratio ? `1:${b.ratio.toFixed(1)}` : "ratio ?";
    const recipe = `${b.dose}g→${b.water}mL, ${b.temp}°, grind ${b.grind}, ${ratio}${b.bypass ? `, bypass ${b.bypass}mL` : ""}${b.water_type ? `, ${b.water_type}` : ""}`;
    const scores = `acidity ${b.acidity ?? "-"}, sweetness ${b.sweetness ?? "-"}, body ${b.body ?? "-"}, clarity ${b.clarity ?? "-"}`;
    const note = b.note ? ` — note: "${b.note}"` : "";
    return `${coffeeLabel} (${age}) on ${brewer}: ${recipe} → rated ${brewRating(b).toFixed(1)}/5 (${scores})${note}`;
  });
}

export function BrewingTips({ brews, coffees, config, llmEnabled }: BrewingTipsProps) {
  // Heuristic tips render immediately — they're the fallback and the placeholder.
  const heuristic = useMemo(() => buildTips(brews, coffees, config), [brews, coffees, config]);
  const [llmTips, setLlmTips] = useState<Tip[] | null>(null);

  useEffect(() => {
    if (!llmEnabled) return;
    let cancelled = false;

    const LS_KEY = "brew_tips_v1";
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const MIN_BREWS = 5;

    const rated = brews
      .filter((b) => b.stars != null)
      .sort((a, b) => Number(b.started_at) - Number(a.started_at));
    if (rated.length < MIN_BREWS) return; // too little signal — keep heuristic

    // Weekly local cache: skip the network round-trip if we refreshed in the last 7 days.
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const c = JSON.parse(raw) as { ts: number; tips: Tip[] };
        if (c.ts && Date.now() - c.ts < WEEK_MS && Array.isArray(c.tips) && c.tips.length) {
          setLlmTips(c.tips);
          return;
        }
      }
    } catch { /* ignore malformed cache */ }

    const stats = buildStats(rated.slice(0, 40), coffees, config);
    const digest = buildDigest(rated, coffees, config);

    (async () => {
      try {
        const res = await fetch("/api/tips", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stats, brews: digest }),
        });
        // 204 / error → keep the heuristic tips already on screen.
        if (res.status === 204 || !res.ok) return;
        const data = await res.json();
        const tips: Tip[] = Array.isArray(data.tips)
          ? data.tips
              .filter((t: unknown): t is Tip =>
                !!t && typeof t === "object" && typeof (t as Tip).text === "string" && (t as Tip).text.trim().length > 0)
              .slice(0, 3)
          : [];
        if (!cancelled && tips.length) {
          setLlmTips(tips);
          try { localStorage.setItem(LS_KEY, JSON.stringify({ ts: Date.now(), tips })); } catch { /* ignore */ }
        }
      } catch { /* keep heuristic */ }
    })();

    return () => { cancelled = true; };
  }, [brews, coffees, config, llmEnabled]);

  const tips = llmTips ?? heuristic;
  if (!tips.length) return null;

  return (
    <>
    <div className="label" style={{ margin: "6px 2px -2px" }}>Brewing tips</div>
    <div className="card" style={{ padding: "6px 18px" }}>
      {tips.map((t, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
            padding: "14px 0",
            borderBottom: i < tips.length - 1 ? "1px solid var(--line)" : "none",
          }}
        >
          <span style={{ color: "var(--accent)", flexShrink: 0, marginTop: 1 }}>
            <Icon name={t.icon} size={18} stroke={1.7} />
          </span>
          <span style={{ fontSize: 13.5, lineHeight: 1.45, color: "var(--ink)", textWrap: "pretty" } as React.CSSProperties}>
            {t.text}
          </span>
        </div>
      ))}
    </div>
    </>
  );
}

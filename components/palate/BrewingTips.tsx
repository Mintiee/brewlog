"use client";
import { useMemo } from "react";
import { Icon } from "@/components/ui";
import { brewRating } from "@/lib/domain";
import type { Brew, Coffee, Config } from "@/lib/types";

interface BrewingTipsProps {
  brews: Brew[];
  coffees: Coffee[];
  config: Config;
}

interface Tip {
  icon: string;
  text: string;
}

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

export function BrewingTips({ brews, coffees, config }: BrewingTipsProps) {
  const tips = useMemo(() => buildTips(brews, coffees, config), [brews, coffees, config]);

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

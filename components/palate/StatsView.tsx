"use client";
import { useMemo, useState } from "react";
import { InsightCard } from "./InsightCard";
import { BrewingTips } from "./BrewingTips";
import { RatingTrend } from "./RatingTrend";
import { TasterFaceoff } from "./TasterFaceoff";
import { BarCard } from "./BarCard";
import { buildPalateStats, inferSharedSessions } from "@/lib/palate/stats";
import type { Brew, Coffee, Config } from "@/lib/types";

interface StatsViewProps {
  rated: Brew[];      // non-pending brews (rankings, insight, tips, trend, face-off)
  allBrews: Brew[];   // every brew (volume)
  coffees: Coffee[];
  config: Config;
  llmEnabled: boolean;
}

const LS_NOTABLE = "brew_stats_notable";
const sectionHdr: React.CSSProperties = { margin: "8px 2px -2px" };

export function StatsView({ rated, allBrews, coffees, config, llmEnabled }: StatsViewProps) {
  const [notable, setNotable] = useState<boolean>(() => {
    try { return localStorage.getItem(LS_NOTABLE) === "1"; } catch { return false; }
  });
  const toggle = () => setNotable((v) => {
    const next = !v;
    try { localStorage.setItem(LS_NOTABLE, next ? "1" : "0"); } catch { /* ignore */ }
    return next;
  });

  const stats = useMemo(() => buildPalateStats(rated, allBrews, coffees, config), [rated, allBrews, coffees, config]);
  const inferredRated = useMemo(() => inferSharedSessions(rated), [rated]);

  // Bespoke-card visibility (so empty section headers never show).
  const showTrend = rated.length >= 4;
  const hasFaceoff = useMemo(() => {
    const names = new Set<string>();
    inferredRated.forEach((b) => {
      if (b.stars != null) names.add((b.taster1 || "You").trim());
      if (b.stars2 != null) names.add((b.taster2 || config.taster2 || "Partner").trim());
    });
    return names.size >= 2;
  }, [inferredRated, config]);

  const keep = (cards: typeof stats.love) => (notable ? cards.filter((c) => c.notable) : cards);
  const trendCards = keep(stats.trends);
  const love = keep(stats.love);
  const drink = keep(stats.drink);
  const trendsVisible = showTrend || trendCards.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <InsightCard brews={rated} coffees={coffees} config={config} llmEnabled={llmEnabled} />

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={toggle} style={{
          background: "none", border: "none", cursor: "pointer", padding: "2px 2px",
          color: "var(--ink-faint)", fontFamily: "var(--font-ui)", fontSize: 12, fontWeight: 600, letterSpacing: "0.02em",
        }}>
          {notable ? "Notable only ›" : "Showing all ›"}
        </button>
      </div>

      {trendsVisible && (
        <>
          <div className="label" style={sectionHdr}>Trends</div>
          {showTrend && <RatingTrend brews={rated} />}
          {trendCards.map((c) => <BarCard key={c.id} card={c} />)}
        </>
      )}

      {love.length > 0 && (
        <>
          <div className="label" style={sectionHdr}>What you love</div>
          {love.map((c) => <BarCard key={c.id} card={c} />)}
        </>
      )}

      {drink.length > 0 && (
        <>
          <div className="label" style={sectionHdr}>What you drink</div>
          {drink.map((c) => <BarCard key={c.id} card={c} />)}
        </>
      )}

      {hasFaceoff && (
        <>
          <div className="label" style={sectionHdr}>Head to head</div>
          <TasterFaceoff brews={inferredRated} coffees={coffees} config={config} />
        </>
      )}

      <BrewingTips brews={rated} coffees={coffees} config={config} llmEnabled={llmEnabled} />
    </div>
  );
}

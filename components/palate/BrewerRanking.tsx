"use client";
import { useMemo } from "react";
import { brewRating } from "@/lib/domain";
import type { Brew, Config } from "@/lib/types";

interface BrewerRankingProps {
  brews: Brew[];
  config: Config;
}

function buildBrewerStats(brews: Brew[], config: Config) {
  const acc: Record<string, { sum: number; n: number }> = {};
  brews.filter((b) => b.stars != null).forEach((b) => {
    const br = config.brewers.find((x) => x.id === b.brewer_id);
    const name = (br?.short || b.brewer_id || "").trim();
    if (!name) return;
    const o = acc[name] = acc[name] || { sum: 0, n: 0 };
    o.sum += brewRating(b);
    o.n += 1;
  });
  return Object.entries(acc)
    .map(([brewer, o]) => ({ brewer, avg: o.sum / o.n, n: o.n }))
    .filter((x) => x.n >= 2)
    .sort((a, b) => b.avg - a.avg);
}

export function BrewerRanking({ brews, config }: BrewerRankingProps) {
  const rows = useMemo(() => buildBrewerStats(brews, config), [brews, config]);
  if (rows.length < 2) return null;

  return (
    <div className="card" style={{ padding: "16px 18px" }}>
      <div className="label" style={{ marginBottom: 14 }}>Brewers you&apos;re enjoying</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map((r) => (
          <div key={r.brewer} style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <span style={{ width: 132, flexShrink: 0, fontSize: 13, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {r.brewer}
            </span>
            <div style={{ flex: 1, height: 8, background: "var(--ink-ghost)", borderRadius: 5, overflow: "hidden" }}>
              <div style={{ width: `${(r.avg / 5) * 100}%`, height: "100%", background: "var(--accent)", borderRadius: 5 }} />
            </div>
            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", width: 40, flexShrink: 0, lineHeight: 1.15 }}>
              <span className="num" style={{ fontSize: 12.5, color: "var(--ink-dim)" }}>{r.avg.toFixed(1)}★</span>
              <span className="label" style={{ fontSize: 8.5, color: "var(--ink-faint)" }}>{r.n}×</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

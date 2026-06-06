"use client";
import { useMemo } from "react";
import { Icon } from "@/components/ui";
import { brewRating } from "@/lib/domain";
import { noteIcon, familyColor, familyLabel } from "@/lib/flavour";
import type { Brew, Coffee } from "@/lib/types";

interface FlavourRankingProps {
  brews: Brew[];
  coffees: Coffee[];
}

interface FamilyStat {
  fam: string;
  avg: number;
  n: number;
}

function buildFlavourStats(brews: Brew[], coffees: Coffee[]): FamilyStat[] {
  const fam: Record<string, { sum: number; n: number }> = {};

  brews.filter((b) => b.stars != null).forEach((b) => {
    const c = coffees.find((x) => x.id === b.coffee_id);
    if (!c) return;
    const fams = [...new Set((c.notes || []).map((n) => noteIcon(n)))];
    fams.forEach((f) => {
      const o = fam[f] = fam[f] || { sum: 0, n: 0 };
      o.sum += brewRating(b);
      o.n += 1;
    });
  });

  return Object.entries(fam)
    .map(([f, o]) => ({ fam: f, avg: o.sum / o.n, n: o.n }))
    .filter((x) => x.n >= 2)
    .sort((a, b) => b.avg - a.avg);
}

export function FlavourRanking({ brews, coffees }: FlavourRankingProps) {
  const rows = useMemo(() => buildFlavourStats(brews, coffees), [brews, coffees]);

  if (!rows.length) return null;

  return (
    <div className="card" style={{ padding: "16px 18px" }}>
      <div className="label" style={{ marginBottom: 14 }}>Flavours you&apos;re enjoying</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map((r) => {
          const col = familyColor(r.fam);
          return (
            <div key={r.fam} style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, width: 132, color: col, flexShrink: 0 }}>
                <Icon name={r.fam} size={15} stroke={1.7} />
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap" }}>{familyLabel(r.fam)}</span>
              </span>
              <div style={{ flex: 1, height: 8, background: "var(--ink-ghost)", borderRadius: 5, overflow: "hidden" }}>
                <div style={{ width: `${(r.avg / 5) * 100}%`, height: "100%", background: col, borderRadius: 5 }} />
              </div>
              <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", width: 40, flexShrink: 0, lineHeight: 1.15 }}>
                <span className="num" style={{ fontSize: 12.5, color: "var(--ink-dim)" }}>{r.avg.toFixed(1)}★</span>
                <span className="label" style={{ fontSize: 8.5, color: "var(--ink-faint)" }}>{r.n}×</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

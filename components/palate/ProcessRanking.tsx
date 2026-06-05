"use client";
import { useMemo } from "react";
import { brewRating } from "@/lib/domain";
import type { Brew, Coffee } from "@/lib/types";

interface ProcessRankingProps {
  brews: Brew[];
  coffees: Coffee[];
}

interface ProcessStat {
  process: string;
  avg: number;
  n: number;
}

/** Group by raw process name, but collapse every anaerobic/anoxic variant
 *  (Anaerobic Natural, Anoxic, double anaerobic, …) into one "Anaerobic" bucket. */
function processLabel(raw: string): string | null {
  const p = (raw || "").trim();
  if (!p) return null;
  if (/anaerobic|anoxic/i.test(p)) return "Anaerobic";
  return p;
}

function buildProcessStats(brews: Brew[], coffees: Coffee[]): ProcessStat[] {
  const acc: Record<string, { sum: number; n: number }> = {};

  brews.filter((b) => b.stars != null).forEach((b) => {
    const c = coffees.find((x) => x.id === b.coffee_id);
    const label = c ? processLabel(c.process) : null;
    if (!label) return;
    const o = acc[label] = acc[label] || { sum: 0, n: 0 };
    o.sum += brewRating(b);
    o.n += 1;
  });

  return Object.entries(acc)
    .map(([process, o]) => ({ process, avg: o.sum / o.n, n: o.n }))
    .filter((x) => x.n >= 2)
    .sort((a, b) => b.avg - a.avg);
}

export function ProcessRanking({ brews, coffees }: ProcessRankingProps) {
  const rows = useMemo(() => buildProcessStats(brews, coffees), [brews, coffees]);

  if (rows.length < 2) return null;

  return (
    <div className="card" style={{ padding: "16px 18px" }}>
      <div className="label" style={{ marginBottom: 14 }}>Processes you&apos;re enjoying</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map((r) => (
          <div key={r.process} style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <span style={{ width: 132, flexShrink: 0, fontSize: 13, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {r.process}
            </span>
            <div style={{ flex: 1, height: 8, background: "var(--ink-ghost)", borderRadius: 5, overflow: "hidden" }}>
              <div style={{ width: `${(r.avg / 5) * 100}%`, height: "100%", background: "var(--accent)", borderRadius: 5 }} />
            </div>
            <span className="num" style={{ fontSize: 12.5, color: "var(--ink-dim)", width: 30, textAlign: "right" }}>{r.avg.toFixed(1)}★</span>
          </div>
        ))}
      </div>
    </div>
  );
}

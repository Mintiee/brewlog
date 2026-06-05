"use client";
import { useMemo } from "react";
import { brewRating } from "@/lib/domain";
import type { Brew } from "@/lib/types";

interface RestRankingProps {
  brews: Brew[];
}

// 5-day buckets, last one open-ended.
const BUCKET_DAYS = 5;
const LABELS = ["0–4d", "5–9d", "10–14d", "15–19d", "20–24d", "25–29d", "30–34d", "35–39d", "40d+"];
const LAST = LABELS.length - 1;

interface RestStat {
  idx: number;
  avg: number;
  n: number;
}

function buildRestStats(brews: Brew[]): RestStat[] {
  const acc: Record<number, { sum: number; n: number }> = {};

  // Uses the freeze-adjusted rest snapshotted on each brew at log time.
  brews.filter((b) => b.stars != null && b.rest_days != null).forEach((b) => {
    const idx = Math.min(Math.floor(b.rest_days! / BUCKET_DAYS), LAST);
    const o = acc[idx] = acc[idx] || { sum: 0, n: 0 };
    o.sum += brewRating(b);
    o.n += 1;
  });

  // Ordered by rest (ascending) so the freshness→rating trend reads left-to-right.
  return Object.entries(acc)
    .map(([idx, o]) => ({ idx: Number(idx), avg: o.sum / o.n, n: o.n }))
    .sort((a, b) => a.idx - b.idx);
}

export function RestRanking({ brews }: RestRankingProps) {
  const rows = useMemo(() => buildRestStats(brews), [brews]);

  if (rows.length < 2) return null;

  return (
    <div className="card" style={{ padding: "16px 18px" }}>
      <div className="label" style={{ marginBottom: 14 }}>Ratings by rest time</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map((r) => (
          <div key={r.idx} style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <span style={{ width: 64, flexShrink: 0, fontSize: 13, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap" }}>
              {LABELS[r.idx]}
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

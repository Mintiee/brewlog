"use client";
import { useMemo } from "react";
import { brewRating } from "@/lib/domain";
import type { Brew } from "@/lib/types";

const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

/** A sparkline of brew ratings over time (oldest → newest), with a steady/
 *  climbing/dipping read from first-half vs second-half average. */
export function RatingTrend({ brews }: { brews: Brew[] }) {
  const pts = useMemo(() => {
    return brews
      .filter((b) => b.stars != null)
      .sort((a, b) => Number(a.started_at) - Number(b.started_at))
      .slice(-30)
      .map((b) => brewRating(b));
  }, [brews]);

  if (pts.length < 4) return null;

  const W = 300, H = 60, pad = 6;
  const n = pts.length;
  const x = (i: number) => pad + (i / (n - 1)) * (W - 2 * pad);
  const y = (v: number) => pad + (1 - v / 5) * (H - 2 * pad);
  const line = pts.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  const half = Math.floor(n / 2);
  const d = avg(pts.slice(half)) - avg(pts.slice(0, half));
  const trend = d > 0.2 ? "climbing" : d < -0.2 ? "dipping" : "holding steady";

  return (
    <div className="card" style={{ padding: "16px 18px" }}>
      <div className="label" style={{ marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
        <span>Ratings over time</span>
        <span className="mono" style={{ color: "var(--ink-dim)" }}>{trend}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: H, display: "block" }}>
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <circle cx={x(n - 1)} cy={y(pts[n - 1])} r={3} fill="var(--accent)" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="label" style={{ fontSize: 9, marginTop: 8 }}>{n} most recent rated brews</div>
    </div>
  );
}

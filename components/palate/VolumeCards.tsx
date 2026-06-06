"use client";
import { useMemo } from "react";
import type { Brew, Coffee } from "@/lib/types";

interface Row { key: string; label: string; count: number }

// Shared bar list — bar length is volume relative to the most-brewed row.
function VolumeList({ title, rows }: { title: string; rows: Row[] }) {
  if (rows.length < 2) return null;
  const max = rows[0].count || 1;
  return (
    <div className="card" style={{ padding: "16px 18px" }}>
      <div className="label" style={{ marginBottom: 14 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map((r) => (
          <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <span style={{ width: 132, flexShrink: 0, fontSize: 13, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {r.label}
            </span>
            <div style={{ flex: 1, height: 8, background: "var(--ink-ghost)", borderRadius: 5, overflow: "hidden" }}>
              <div style={{ width: `${(r.count / max) * 100}%`, height: "100%", background: "var(--accent)", borderRadius: 5 }} />
            </div>
            <span className="num" style={{ fontSize: 12.5, color: "var(--ink-dim)", width: 30, textAlign: "right" }}>{r.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Most-brewed individual coffees (counts every brew, rated or not). */
export function MostBrewed({ brews, coffees }: { brews: Brew[]; coffees: Coffee[] }) {
  const rows = useMemo<Row[]>(() => {
    const acc: Record<string, number> = {};
    brews.forEach((b) => { acc[b.coffee_id] = (acc[b.coffee_id] || 0) + 1; });
    return Object.entries(acc)
      .map(([id, count]) => ({ key: id, label: coffees.find((c) => c.id === id)?.name ?? id, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [brews, coffees]);
  return <VolumeList title="Most brewed" rows={rows} />;
}

/** Brew volume by origin country. */
export function OriginVolume({ brews, coffees }: { brews: Brew[]; coffees: Coffee[] }) {
  const rows = useMemo<Row[]>(() => {
    const acc: Record<string, number> = {};
    brews.forEach((b) => {
      const origin = coffees.find((c) => c.id === b.coffee_id)?.origin?.trim();
      if (!origin) return;
      acc[origin] = (acc[origin] || 0) + 1;
    });
    return Object.entries(acc)
      .map(([origin, count]) => ({ key: origin, label: origin, count }))
      .sort((a, b) => b.count - a.count);
  }, [brews, coffees]);
  return <VolumeList title="Cups by origin" rows={rows} />;
}

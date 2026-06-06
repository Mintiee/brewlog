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

// Group brews by a key derived from the coffee, into volume rows (desc by count).
function volumeByCoffee(brews: Brew[], coffees: Coffee[], keyOf: (c: Coffee) => string | null): Row[] {
  const acc: Record<string, number> = {};
  brews.forEach((b) => {
    const c = coffees.find((x) => x.id === b.coffee_id);
    const key = c ? keyOf(c) : null;
    if (!key) return;
    acc[key] = (acc[key] || 0) + 1;
  });
  return Object.entries(acc)
    .map(([key, count]) => ({ key, label: key, count }))
    .sort((a, b) => b.count - a.count);
}

/** Brew volume by origin country. */
export function OriginVolume({ brews, coffees }: { brews: Brew[]; coffees: Coffee[] }) {
  const rows = useMemo(() => volumeByCoffee(brews, coffees, (c) => c.origin?.trim() || null), [brews, coffees]);
  return <VolumeList title="Cups by origin" rows={rows} />;
}

/** Brew volume by roaster. */
export function RoasterVolume({ brews, coffees }: { brews: Brew[]; coffees: Coffee[] }) {
  const rows = useMemo(() => volumeByCoffee(brews, coffees, (c) => c.roaster?.trim() || null), [brews, coffees]);
  return <VolumeList title="Cups by roaster" rows={rows} />;
}

/** Brew volume by process — raw name, but anaerobic/anoxic variants lumped. */
export function ProcessVolume({ brews, coffees }: { brews: Brew[]; coffees: Coffee[] }) {
  const rows = useMemo(() => volumeByCoffee(brews, coffees, (c) => {
    const p = (c.process || "").trim();
    if (!p) return null;
    return /anaerobic|anoxic/i.test(p) ? "Anaerobic" : p;
  }), [brews, coffees]);
  return <VolumeList title="Cups by process" rows={rows} />;
}

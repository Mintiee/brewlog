"use client";
import { Icon } from "@/components/ui";
import type { StatCard } from "@/lib/palate/stats";

/** Renders a uniform Palate stat card: title + labelled bars with a right readout. */
export function BarCard({ card }: { card: StatCard }) {
  return (
    <div className="card" style={{ padding: "16px 18px" }}>
      <div className="label" style={{ marginBottom: 14 }}>{card.title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {card.rows.map((r) => (
          <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, width: 132, flexShrink: 0 }}>
              {r.icon && <span style={{ color: r.color, display: "inline-flex", flexShrink: 0 }}><Icon name={r.icon} size={15} stroke={1.7} /></span>}
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</span>
            </span>
            <div style={{ flex: 1, height: 8, background: "var(--ink-ghost)", borderRadius: 5, overflow: "hidden" }}>
              <div style={{ width: `${Math.max(0, Math.min(1, r.barFrac)) * 100}%`, height: "100%", background: r.color || "var(--accent)", borderRadius: 5 }} />
            </div>
            <span className="num" style={{ fontSize: 12.5, color: "var(--ink-dim)", width: 30, textAlign: "right" }}>{r.right}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

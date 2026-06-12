"use client";
import { Fragment } from "react";
import { activeGrams, coffeeStatus, cupsLeft, freshColor } from "@/lib/domain";
import { noteColor } from "@/lib/flavour";
import { OriginTile } from "@/components/ui/OriginTile";
import { CoffeeName } from "@/components/ui/CoffeeName";
import type { Coffee, Brew } from "@/lib/types";

interface ShelfRowProps {
  coffee: Coffee;
  brews: Brew[];
  onOpen: (c: Coffee) => void;
}

export function ShelfRow({ coffee, brews, onOpen }: ShelfRowProps) {
  const active = activeGrams(coffee, brews);
  const serves = cupsLeft(active);
  const low = serves <= 2;
  const st = coffeeStatus(coffee, brews);
  return (
    <button onClick={() => onOpen(coffee)} className="card" style={{
      width: "100%", textAlign: "left", cursor: "pointer", padding: 16, marginBottom: 10, display: "flex", gap: 13, alignItems: "flex-start",
    }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, flexShrink: 0, width: 46 }}>
        <OriginTile code={coffee.cc} roaster={coffee.roaster} color={coffee.color} size={46} radius={11} process={coffee.process} />
        {coffee.origin && <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--ink-faint)", textAlign: "center", lineHeight: 1.15 }}>{coffee.origin}</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="label" style={{ color: "var(--ink-faint)" }}>{coffee.roaster}</div>
        <CoffeeName coffee={coffee} style={{ fontSize: 16.5, letterSpacing: "-0.01em" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 3, fontSize: 12, color: "var(--ink-dim)" }}>
          <span className="dot" style={{ width: 5, height: 5, background: freshColor(st.state) }} />
          <span>{st.label}</span>
        </div>
        {coffee.notes.length > 0 && (
          <div style={{ marginTop: 4, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {coffee.notes.map((n, i) => (
              <Fragment key={n}>
                {i > 0 && <span style={{ color: "var(--ink-faint)" }}> · </span>}
                <span style={{ color: noteColor(n) }}>{n}</span>
              </Fragment>
            ))}
          </div>
        )}
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div className="num" style={{ fontSize: 20, fontWeight: 600, lineHeight: 1, color: low ? "var(--accent)" : "var(--ink)" }}>
          {serves % 1 === 0 ? String(serves) : serves.toFixed(1)}<span style={{ fontSize: 10.5, color: "var(--ink-faint)", fontWeight: 500, marginLeft: 2 }}>serves</span>
        </div>
        <div className="label" style={{ fontSize: 9, marginTop: 4, color: low ? "var(--accent)" : "var(--ink-faint)" }}>{low ? "running low" : `${active}g`}</div>
      </div>
    </button>
  );
}

"use client";
import { coffeeStatus, cupsLeft, frozenGramsOf } from "@/lib/domain";
import { Icon } from "@/components/ui/Icon";
import { OriginTile } from "@/components/ui/OriginTile";
import type { Coffee, Brew } from "@/lib/types";

interface FrozenRowProps {
  coffee: Coffee;
  brews: Brew[];
  onOpen: (c: Coffee) => void;
}

export function FrozenRow({ coffee, brews, onOpen }: FrozenRowProps) {
  const frozen = frozenGramsOf(coffee, brews);
  const serves = cupsLeft(frozen);
  const st = coffeeStatus(coffee, brews);
  return (
    <button onClick={() => onOpen(coffee)} className="card" style={{
      width: "100%", textAlign: "left", cursor: "pointer", padding: 16, marginBottom: 10, display: "flex", gap: 13, alignItems: "center",
    }}>
      <OriginTile code={coffee.cc} roaster={coffee.roaster} color={coffee.color} size={46} radius={11} process={coffee.process} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="label" style={{ color: "var(--ink-faint)" }}>{coffee.roaster}</div>
        <div style={{ fontSize: 16.5, fontWeight: 600, letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{coffee.name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 3, fontSize: 12, color: "var(--frozen)" }}>
          <Icon name="snow" size={12} stroke={1.8} />
          <span>{st.label}</span>
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div className="num" style={{ fontSize: 20, fontWeight: 600, lineHeight: 1, color: "var(--frozen)" }}>
          {serves % 1 === 0 ? String(serves) : serves.toFixed(1)}<span style={{ fontSize: 10.5, color: "var(--ink-faint)", fontWeight: 500, marginLeft: 2 }}>serves</span>
        </div>
        <div className="label" style={{ fontSize: 9, marginTop: 4, color: "var(--ink-faint)" }}>{frozen}g</div>
      </div>
    </button>
  );
}

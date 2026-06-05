"use client";
import type { Coffee, Brew } from "@/lib/types";
import { coffeeStatus } from "@/lib/domain";
import { Icon, FreshDot, OriginTile } from "@/components/ui";

interface CoffeePinProps {
  coffee: Coffee;
  brews: Brew[];
  onChange: () => void;
}

export function CoffeePin({ coffee, brews, onChange }: CoffeePinProps) {
  const st = coffeeStatus(coffee, brews);
  return (
    <button onClick={onChange} style={{
      width: "100%", display: "flex", alignItems: "center", gap: 13,
      background: "var(--surface)", border: "1px solid var(--line)",
      borderRadius: 16, padding: "12px 14px", cursor: "pointer", textAlign: "left",
    }}>
      <OriginTile code={coffee.cc} roaster={coffee.roaster} color={coffee.color} size={30} radius={9} process={coffee.process} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="label" style={{ color: "var(--ink-faint)" }}>{coffee.roaster}</div>
        <div style={{ fontSize: 15.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{coffee.name}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--ink-faint)" }}>
        <FreshDot state={st.state} />
        <Icon name="chevDown" size={16} stroke={1.8} />
      </div>
    </button>
  );
}

"use client";
import { coffeeStatus, freshColor } from "@/lib/domain";
import { Icon } from "@/components/ui/Icon";
import type { Coffee, Brew } from "@/lib/types";

interface FreshBarProps {
  coffee: Coffee;
  brews: Brew[];
}

export function FreshBar({ coffee, brews }: FreshBarProps) {
  const st = coffeeStatus(coffee, brews);
  if (st.state === "frozen") {
    return (
      <div style={{ marginTop: 11, display: "flex", alignItems: "center", gap: 8, color: "var(--frozen)" }}>
        <Icon name="snow" size={15} stroke={1.7} />
        <span style={{ fontSize: 11.5, fontWeight: 600 }}>Frozen · ageing paused at day {st.day}</span>
      </div>
    );
  }
  const total = coffee.peak_days;
  const restPct = (coffee.rest_days / total) * 100;
  const nowPct = Math.min(100, (st.day / total) * 100);
  return (
    <div style={{ marginTop: 9 }}>
      <div style={{ position: "relative", height: 4, borderRadius: 3, background: "var(--ink-ghost)", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, width: `${restPct}%`, height: "100%", background: "var(--rest-soft)" }} />
        <div style={{ position: "absolute", left: `${restPct}%`, right: 0, height: "100%", background: "var(--accent-soft)" }} />
        <div style={{ position: "absolute", left: `calc(${nowPct}% - 1px)`, top: -3, width: 2, height: 10, background: freshColor(st.state), borderRadius: 2 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        <span style={{ fontSize: 11.5, color: freshColor(st.state), fontWeight: 600 }}>{st.label}</span>
        <span className="label" style={{ fontSize: 9.5 }}>peak wk {Math.round(coffee.rest_days / 7)}–{Math.round(coffee.peak_days / 7)}</span>
      </div>
    </div>
  );
}

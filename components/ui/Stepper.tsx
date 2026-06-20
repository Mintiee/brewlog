"use client";
import { Icon } from "./Icon";

interface StepperProps {
  icon: string;
  label: string;
  value: number;
  unit?: string;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  format?: (v: number) => string;
  /** Reduce vertical padding (8px vs 12px) for space-constrained screens. */
  dense?: boolean;
}

export function Stepper({ icon, label, value, unit, onChange, step = 1, min = 0, max = 999, format, dense }: StepperProps) {
  const dec = () => onChange(Math.max(min, +(value - step).toFixed(2)));
  const inc = () => onChange(Math.min(max, +(value + step).toFixed(2)));
  const btnStyle: React.CSSProperties = {
    width: 30, height: 30, borderRadius: "50%", background: "var(--surface-3)",
    border: "1px solid var(--line)", color: "var(--ink)", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, padding: dense ? "8px 0" : "12px 0", minWidth: 0 }}>
      <div style={{ color: "var(--ink-faint)", display: "flex", flexShrink: 0 }}>
        <Icon name={icon} size={18} stroke={1.6} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="label" style={{ marginBottom: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
        <div className="num" style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em" }}>
          {format ? format(value) : value}
          {unit && <span style={{ fontSize: 11, color: "var(--ink-faint)", marginLeft: 2, fontWeight: 500 }}>{unit}</span>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button style={btnStyle} onClick={dec}><Icon name="minus" size={15} stroke={2} /></button>
        <button style={btnStyle} onClick={inc}><Icon name="plus" size={15} stroke={2} /></button>
      </div>
    </div>
  );
}

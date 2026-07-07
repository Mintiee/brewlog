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
  // Hit target is 44x44 but a negative margin cancels the extra 14px out of the
  // flex layout, so the row footprint is unchanged; the 30x30 visual circle
  // lives on an inner span centered in that hit box, so nothing looks different.
  const hitStyle: React.CSSProperties = {
    width: 44, height: 44, margin: -7, background: "none", border: "none", padding: 0,
    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
  };
  const circleStyle: React.CSSProperties = {
    width: 30, height: 30, borderRadius: "50%", background: "var(--surface-3)",
    border: "1px solid var(--line)", color: "var(--ink)",
    display: "flex", alignItems: "center", justifyContent: "center",
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
        <button style={hitStyle} onClick={dec} aria-label="Decrease"><span style={circleStyle}><Icon name="minus" size={15} stroke={2} /></span></button>
        <button style={hitStyle} onClick={inc} aria-label="Increase"><span style={circleStyle}><Icon name="plus" size={15} stroke={2} /></span></button>
      </div>
    </div>
  );
}

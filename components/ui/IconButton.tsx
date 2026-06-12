"use client";
import { Icon } from "./Icon";

interface IconButtonProps {
  icon: string;
  /** Accessible name — icon-only buttons are invisible to screen readers without it. */
  label: string;
  onClick: () => void;
  /** Button diameter (px). Callers keep their established sizes (34/36/38). */
  size?: number;
  iconSize?: number;
  stroke?: number;
  style?: React.CSSProperties;
}

/** The app's round soft icon button (close/edit on sheets and headers). */
export function IconButton({ icon, label, onClick, size = 34, iconSize = 18, stroke = 1.9, style }: IconButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: "50%",
        width: size, height: size, color: "var(--ink-dim)", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        ...style,
      }}
    >
      <Icon name={icon} size={iconSize} stroke={stroke} />
    </button>
  );
}

"use client";
import { Icon } from "./Icon";

interface StarsProps {
  value: number;
  onChange?: (n: number) => void;
  size?: number;
  gap?: number;
  readOnly?: boolean;
}

export function Stars({ value, onChange, size = 30, gap = 8, readOnly = false }: StarsProps) {
  return (
    <div style={{ display: "flex", gap }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          className="starbtn"
          onClick={() => !readOnly && onChange?.(n === value ? 0 : n)}
          style={{
            background: "none", border: "none", padding: 0,
            cursor: readOnly ? "default" : "pointer",
            color: n <= value ? "var(--accent)" : "var(--ink-ghost)",
            lineHeight: 0,
          }}
        >
          <Icon name={n <= value ? "star" : "starO"} size={size} stroke={1.5} />
        </button>
      ))}
    </div>
  );
}

export function StarsMini({ value, size = 13 }: { value: number; size?: number }) {
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} style={{ lineHeight: 0, color: n <= value ? "var(--accent)" : "var(--ink-ghost)" }}>
          <Icon name="star" size={size} stroke={1.5} />
        </span>
      ))}
    </div>
  );
}

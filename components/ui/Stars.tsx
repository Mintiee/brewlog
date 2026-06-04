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
      {[1, 2, 3, 4, 5].map((n) => {
        const full = n <= value;
        const half = !full && (n - 0.5 === value);
        return (
          <div key={n} style={{ position: "relative", width: size, height: size, lineHeight: 0, flexShrink: 0 }}>
            {/* Base layer: outline or full star */}
            <span style={{ color: full ? "var(--accent)" : "var(--ink-ghost)", display: "block" }}>
              <Icon name={full ? "star" : "starO"} size={size} stroke={1.5} />
            </span>
            {/* Half-fill overlay: clip filled star to left 50% */}
            {half && (
              <span style={{
                position: "absolute", left: 0, top: 0,
                overflow: "hidden", width: "50%", height: "100%",
                color: "var(--accent)", display: "block", lineHeight: 0,
              }}>
                <Icon name="star" size={size} stroke={1.5} />
              </span>
            )}
            {/* Tap zones: left half = n-0.5, right half = n */}
            {!readOnly && (
              <>
                <button
                  className="starbtn"
                  onClick={() => onChange?.(value === n - 0.5 ? 0 : n - 0.5)}
                  style={{
                    position: "absolute", left: 0, top: 0, width: "50%", height: "100%",
                    background: "none", border: "none", padding: 0, cursor: "pointer",
                  }}
                />
                <button
                  className="starbtn"
                  onClick={() => onChange?.(value === n ? 0 : n)}
                  style={{
                    position: "absolute", right: 0, top: 0, width: "50%", height: "100%",
                    background: "none", border: "none", padding: 0, cursor: "pointer",
                  }}
                />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function StarsMini({ value, size = 13 }: { value: number; size?: number }) {
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const full = n <= value;
        const half = !full && (n - 0.5 === value);
        return (
          <span key={n} style={{ position: "relative", display: "inline-block", width: size, height: size, lineHeight: 0, flexShrink: 0 }}>
            {/* Base: accent for full, ghost for empty/half */}
            <span style={{ color: full ? "var(--accent)" : "var(--ink-ghost)", display: "block" }}>
              <Icon name="star" size={size} stroke={1.5} />
            </span>
            {/* Half-fill: clip accent star to left 50% */}
            {half && (
              <span style={{
                position: "absolute", left: 0, top: 0,
                overflow: "hidden", width: "50%", height: "100%",
                color: "var(--accent)", display: "block", lineHeight: 0,
              }}>
                <Icon name="star" size={size} stroke={1.5} />
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

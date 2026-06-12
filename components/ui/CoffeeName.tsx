"use client";
import type { CSSProperties } from "react";
import type { Coffee } from "@/lib/types";

/**
 * Coffee name with its varietal trailing in quieter text, clamped to two
 * lines so a long name wraps rather than truncating the varietal away.
 * Hides the varietal when empty or stored as the "—" placeholder.
 */
export function CoffeeName({ coffee, style }: { coffee: Coffee; style?: CSSProperties }) {
  const hasVarietal = coffee.varietal && coffee.varietal !== "—";
  return (
    <div style={{ fontWeight: 600, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", ...style }}>
      {coffee.name}
      {hasVarietal && (
        <span style={{ color: "var(--ink-faint)", fontWeight: 500 }}>
          {" "}· <span style={{ fontSize: "0.8em" }}>{coffee.varietal}</span>
        </span>
      )}
    </div>
  );
}

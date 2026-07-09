"use client";
import type { CSSProperties } from "react";
import type { Coffee } from "@/lib/types";

/**
 * Coffee name with its varietals trailing in quieter text, clamped to two
 * lines so a long name wraps rather than truncating the varietals away.
 */
export function CoffeeName({ coffee, style }: { coffee: Coffee; style?: CSSProperties }) {
  const hasVarietal = coffee.varietals.length > 0;
  return (
    <div style={{ fontWeight: 600, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", ...style }}>
      {coffee.name}
      {hasVarietal && (
        <span style={{ color: "var(--ink-faint)", fontWeight: 500 }}>
          {" "}· <span style={{ fontSize: "0.8em" }}>{coffee.varietals.join(" · ")}</span>
        </span>
      )}
    </div>
  );
}

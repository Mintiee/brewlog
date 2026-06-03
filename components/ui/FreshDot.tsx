"use client";
import { freshColor } from "@/lib/domain";

export function FreshDot({ state }: { state: string }) {
  const color = freshColor(state);
  return (
    <span
      className="dot"
      style={{ background: color, boxShadow: `0 0 8px ${color}` }}
    />
  );
}

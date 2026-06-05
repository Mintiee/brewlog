"use client";
import { initials } from "@/lib/domain";
import { processTexture } from "@/lib/flavour";

interface MonogramProps {
  roaster: string;
  color: string;
  size?: number;
  radius?: number;
  process?: string;
}

export function Monogram({ roaster, color, size = 44, radius = 12, process }: MonogramProps) {
  const tex = processTexture(process || "");
  return (
    <span style={{
      position: "relative",
      width: size, height: size, borderRadius: radius, background: color, flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
      boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.14), inset 0 -10px 18px rgba(0,0,0,0.12)",
    }}>
      <span style={{
        fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: size * 0.34,
        color: "rgba(20,10,4,0.74)", letterSpacing: "0.01em",
      }}>{initials(roaster)}</span>
      {tex.backgroundImage && <span aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", ...tex }} />}
    </span>
  );
}

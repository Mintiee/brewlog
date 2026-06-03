"use client";
import { useState } from "react";
import { Monogram } from "./Monogram";

interface OriginTileProps {
  code: string | null;
  roaster: string;
  color: string;
  size?: number;
  radius?: number;
}

export function OriginTile({ code, roaster, color, size = 48, radius = 13 }: OriginTileProps) {
  const url = code ? `https://cdn.jsdelivr.net/gh/djaiss/mapsicon/all/${code}/vector.svg` : null;
  const [ok, setOk] = useState<boolean | null>(code ? null : false);

  if (ok === false || !url) {
    return <Monogram roaster={roaster} color={color} size={size} radius={radius} />;
  }
  return (
    <span style={{
      width: size, height: size, borderRadius: radius, background: color, flexShrink: 0,
      boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.14), inset 0 -10px 18px rgba(0,0,0,0.12)",
      display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        crossOrigin="anonymous"
        onLoad={() => setOk(true)}
        onError={() => setOk(false)}
        style={{ width: "62%", height: "62%", objectFit: "contain", opacity: 0.6, filter: "brightness(0)" }}
      />
    </span>
  );
}

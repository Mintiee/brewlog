"use client";
import { useState } from "react";
import { Monogram } from "./Monogram";
import { processTexture } from "@/lib/flavour";

interface OriginTileProps {
  code: string | null;
  roaster: string;
  color: string;
  size?: number;
  radius?: number;
  process?: string;
}

/**
 * Country codes whose outline we've discovered is unavailable, shared across every
 * tile instance and surviving unmount.
 *
 * Previously this lived in per-instance state, which meant a shelf with eight
 * Ethiopian bags would independently request, independently fail, and independently
 * fall back — and every tab switch re-ran the whole load/error dance from scratch.
 *
 * Only negatives are recorded, and only permanent ones are expected: the outlines are
 * same-origin static assets precached by the service worker (public/sw.js), so if the
 * app itself loaded, a miss means the code genuinely has no vendored outline rather
 * than a transient network blip. Successes need no entry — the HTTP/SW cache handles
 * those, and an absent entry simply means "render the img".
 */
const missingOutlines = new Set<string>();

export function OriginTile({ code, roaster, color, size = 48, radius = 13, process }: OriginTileProps) {
  // A render counter, not state: the fallback decision is derived from `code` and the
  // shared set on every render, so a tile whose code changes in place (null -> "et")
  // now updates correctly. The old useState initialiser only ran on mount, which left
  // such tiles stuck on the Monogram forever.
  const [, bump] = useState(0);

  if (!code || missingOutlines.has(code)) {
    return <Monogram roaster={roaster} color={color} size={size} radius={radius} process={process} />;
  }

  const tex = processTexture(process || "");
  // Vendored from djaiss/mapsicon at a pinned commit — see scripts/fetch-outlines.mjs
  // and public/maps/LICENSE.md. Same-origin so the service worker can precache it.
  const url = `/maps/${code}.svg`;
  const inner = Math.round(size * 0.62);

  return (
    <span style={{
      position: "relative",
      width: size, height: size, borderRadius: radius, background: color, flexShrink: 0,
      boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.14), inset 0 -10px 18px rgba(0,0,0,0.12)",
      display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        width={inner}
        height={inner}
        loading="lazy"
        decoding="async"
        onError={() => { missingOutlines.add(code); bump((n) => n + 1); }}
        style={{ width: "62%", height: "62%", objectFit: "contain", opacity: 0.6, filter: "brightness(0)" }}
      />
      {tex.backgroundImage && <span aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", ...tex }} />}
    </span>
  );
}

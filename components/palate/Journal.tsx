"use client";
import { useMemo, useState } from "react";
import { StarsMini } from "@/components/ui";
import { brewRating, daysAgoFromStartedAt, journalDateText } from "@/lib/domain";
import { processTexture } from "@/lib/flavour";
import type { Brew, Coffee, Config } from "@/lib/types";

interface JournalProps {
  brews: Brew[];
  coffees: Coffee[];
  config: Config;
  onOpen?: (b: Brew) => void;
}

interface Group {
  d: number;
  ts: number;
  items: Brew[];
}

// Render-windowing only: the journal can hold a couple of years of brews, but
// we lay out cards one calendar-day chunk at a time so the DOM stays light.
// ~3 brews/day × 90 days ≈ 270 cards — generous yet snappy on a phone.
// This windows the *display* only; Stats still see every fetched brew.
const CHUNK_DAYS = 90;

export function Journal({ brews, coffees, config, onOpen }: JournalProps) {
  const [windowDays, setWindowDays] = useState(CHUNK_DAYS);

  const groups = useMemo<Group[]>(() => {
    const sorted = [...brews].sort((a, b) => {
      const da = daysAgoFromStartedAt(a.started_at);
      const db = daysAgoFromStartedAt(b.started_at);
      return da - db;
    });

    const result: Group[] = [];
    let cur: Group | null = null;

    sorted.forEach((b) => {
      const d = daysAgoFromStartedAt(b.started_at);
      if (!cur || cur.d !== d) {
        cur = { d, ts: parseInt(b.started_at, 10), items: [] };
        result.push(cur);
      }
      cur.items.push(b);
    });

    return result;
  }, [brews]);

  // Day-groups within the current window (daysAgo < windowDays), and whether
  // any older groups remain. Same comparison on both sides so a group never
  // both shows and triggers "show older".
  const visible = groups.filter((g) => g.d < windowDays);
  const hidden = groups.filter((g) => g.d >= windowDays);
  const hasMore = hidden.length > 0;

  // Extend the window by one chunk. Snap past any gap to the next older brew
  // first, so a long stretch with no brews never yields an empty "show older".
  const showOlder = () => {
    const nextOldest = hidden[0]?.d ?? windowDays;
    setWindowDays(nextOldest + CHUNK_DAYS);
  };

  return (
    <div>
      <div className="label" style={{ margin: "4px 2px 12px" }}>Journal</div>
      {visible.map((g) => (
        <div key={g.d} style={{ marginBottom: 16 }}>
          <div
            className="mono"
            style={{ fontSize: 11.5, color: "var(--ink-faint)", marginBottom: 8, letterSpacing: "0.04em" }}
          >
            {journalDateText(g.ts)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {g.items.map((b) => {
              const c = coffees.find((x) => x.id === b.coffee_id);
              const br = config.brewers.find((x) => x.id === b.brewer_id);
              const rating = Math.round(brewRating(b));
              const tex = c ? processTexture(c.process) : {};

              return (
                <button
                  key={b.id}
                  className="card"
                  onClick={() => onOpen?.(b)}
                  style={{ padding: "13px 15px", display: "flex", alignItems: "center", gap: 12, width: "100%", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, cursor: onOpen ? "pointer" : "default", textAlign: "left" }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 38,
                      borderRadius: 4,
                      background: c ? c.color : "var(--accent)",
                      flexShrink: 0,
                      ...tex,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {c ? c.name : b.coffee_id}
                    </div>
                    <div className="mono" style={{ fontSize: 11.5, color: "var(--ink-dim)", marginTop: 2 }}>
                      {br ? br.short : b.brewer_id} · 1:{b.ratio.toFixed(1)} · {b.temp}°C · {b.grind}{config.grinder.unit[0]}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                    {b.stars != null ? (
                      <>
                        <StarsMini value={rating} size={12} />
                        <span className="label" style={{ fontSize: 8.5, color: "var(--ink-faint)" }}>
                          {b.taster1 || "you"} {b.stars}
                          {b.stars2 != null ? ` · ${b.taster2 || config.taster2 || "partner"} ${b.stars2}` : ""}
                        </span>
                      </>
                    ) : (
                      <span className="label" style={{ fontSize: 8.5, color: "var(--ink-faint)", border: "1px solid var(--line)", borderRadius: 6, padding: "2px 7px" }}>
                        Unrated
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {hasMore && (
        <button
          onClick={showOlder}
          style={{
            width: "100%", marginTop: 4, padding: "11px 14px",
            background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12,
            color: "var(--ink-dim)", fontFamily: "var(--font-ui)", fontSize: 13, fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Show older brews
        </button>
      )}
    </div>
  );
}

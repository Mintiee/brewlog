"use client";
import { useMemo } from "react";
import { StarsMini } from "@/components/ui";
import { brewRating, daysAgoFromStartedAt } from "@/lib/domain";
import type { Brew, Coffee, Config } from "@/lib/types";

interface JournalProps {
  brews: Brew[];
  coffees: Coffee[];
  config: Config;
}

function relDay(d: number): string {
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  return `${d}d ago`;
}

interface Group {
  d: number;
  items: Brew[];
}

export function Journal({ brews, coffees, config }: JournalProps) {
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
        cur = { d, items: [] };
        result.push(cur);
      }
      cur.items.push(b);
    });

    return result;
  }, [brews]);

  return (
    <div>
      <div className="label" style={{ margin: "4px 2px 12px" }}>Journal</div>
      {groups.map((g) => (
        <div key={g.d} style={{ marginBottom: 16 }}>
          <div
            className="mono"
            style={{ fontSize: 11.5, color: "var(--ink-faint)", marginBottom: 8, letterSpacing: "0.04em" }}
          >
            {relDay(g.d)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {g.items.map((b) => {
              const c = coffees.find((x) => x.id === b.coffee_id);
              const br = config.brewers.find((x) => x.id === b.brewer_id);
              const rating = Math.round(brewRating(b));

              return (
                <div
                  key={b.id}
                  className="card"
                  style={{ padding: "13px 15px", display: "flex", alignItems: "center", gap: 12 }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 38,
                      borderRadius: 4,
                      background: c ? c.color : "var(--accent)",
                      flexShrink: 0,
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
                    <StarsMini value={rating} size={12} />
                    {b.stars2 != null ? (
                      <span className="label" style={{ fontSize: 8.5, color: "var(--ink-faint)" }}>
                        {b.taster1 || "you"} {b.stars} · {b.taster2 || config.taster2 || "partner"} {b.stars2}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

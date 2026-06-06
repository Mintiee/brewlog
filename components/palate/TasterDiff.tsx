"use client";
import { useMemo } from "react";
import type { Brew, Config } from "@/lib/types";

interface TasterDiffProps {
  brews: Brew[];
  config: Config;
}

/** Compares the two people on cups they BOTH rated (stars + stars2). Aggregates
 *  by taster name across both slots, so it doesn't matter who logged which. */
export function TasterDiff({ brews, config }: TasterDiffProps) {
  const data = useMemo(() => {
    const pairs = brews.filter((b) => b.stars != null && b.stars2 != null);
    if (pairs.length < 2) return null;
    const acc: Record<string, { sum: number; n: number }> = {};
    const add = (name: string, v: number) => { const o = acc[name] = acc[name] || { sum: 0, n: 0 }; o.sum += v; o.n += 1; };
    pairs.forEach((b) => {
      add((b.taster1 || "You").trim(), b.stars as number);
      add((b.taster2 || config.taster2 || "Partner").trim(), b.stars2 as number);
    });
    const people = Object.entries(acc).map(([name, o]) => ({ name, avg: o.sum / o.n }));
    if (people.length !== 2) return null;  // need exactly two distinct tasters
    people.sort((a, b) => b.avg - a.avg);
    return { people, pairs: pairs.length };
  }, [brews, config]);

  if (!data) return null;
  const [hi, lo] = data.people;
  const delta = hi.avg - lo.avg;
  const note = delta < 0.15
    ? `Across ${data.pairs} cups you both rated, your scores mostly agree.`
    : `Across ${data.pairs} cups you both rated, ${hi.name} rates ${delta.toFixed(1)}★ higher on average.`;

  return (
    <div className="card" style={{ padding: "16px 18px" }}>
      <div className="label" style={{ marginBottom: 14 }}>Two palates</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {data.people.map((p) => (
          <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <span style={{ width: 100, flexShrink: 0, fontSize: 13, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {p.name}
            </span>
            <div style={{ flex: 1, height: 8, background: "var(--ink-ghost)", borderRadius: 5, overflow: "hidden" }}>
              <div style={{ width: `${(p.avg / 5) * 100}%`, height: "100%", background: "var(--accent)", borderRadius: 5 }} />
            </div>
            <span className="num" style={{ fontSize: 12.5, color: "var(--ink-dim)", width: 30, textAlign: "right" }}>{p.avg.toFixed(1)}★</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12.5, color: "var(--ink-dim)", lineHeight: 1.45, marginTop: 12 }}>{note}</div>
    </div>
  );
}

"use client";
import { useMemo } from "react";
import type { Brew, Coffee, Config } from "@/lib/types";

const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

interface TasterFaceoffProps {
  brews: Brew[];
  coffees: Coffee[];
  config: Config;
}

/** "You vs Kris" face-off. Identity is by taster name; scores come from both the
 *  primary (stars) and second (stars2) slots, so it doesn't matter who logged. */
export function TasterFaceoff({ brews, coffees, config }: TasterFaceoffProps) {
  const data = useMemo(() => {
    const rated = brews.filter((b) => b.stars != null);
    if (!rated.length) return null;

    const tally: Record<string, { sum: number; n: number }> = {};
    const add = (name: string, v: number) => { const o = tally[name] = tally[name] || { sum: 0, n: 0 }; o.sum += v; o.n += 1; };
    rated.forEach((b) => {
      add((b.taster1 || "You").trim(), b.stars as number);
      if (b.stars2 != null) add((b.taster2 || config.taster2 || "Partner").trim(), b.stars2 as number);
    });
    const people = Object.entries(tally)
      .map(([name, o]) => ({ name, avg: o.sum / o.n, n: o.n }))
      .sort((a, b) => b.n - a.n);
    if (people.length < 2) return null;
    const [p1, p2] = people;

    const scoreFor = (b: Brew, name: string): number | null => {
      if ((b.taster1 || "You").trim() === name && b.stars != null) return b.stars;
      if ((b.taster2 || config.taster2 || "Partner").trim() === name && b.stars2 != null) return b.stars2;
      return null;
    };
    const pairs = rated
      .map((b) => ({ b, a: scoreFor(b, p1.name), c: scoreFor(b, p2.name) }))
      .filter((x): x is { b: Brew; a: number; c: number } => x.a != null && x.c != null);

    let agreePct: number | null = null;
    let genGap = 0;
    let split: { b: Brew; a: number; c: number } | null = null;
    let loved: { b: Brew; a: number; c: number } | null = null;
    if (pairs.length >= 2) {
      agreePct = Math.round((pairs.filter((x) => Math.abs(x.a - x.c) <= 0.5).length / pairs.length) * 100);
      genGap = mean(pairs.map((x) => x.a - x.c)); // + => p1 the softer critic
      split = pairs.reduce((m, x) => (Math.abs(x.a - x.c) > Math.abs(m.a - m.c) ? x : m));
      const both = pairs.filter((x) => x.a >= 4 && x.c >= 4);
      loved = both.length ? both.reduce((m, x) => (x.a + x.c > m.a + m.c ? x : m)) : null;
    }

    return { p1, p2, pairsN: pairs.length, agreePct, genGap, split, loved };
  }, [brews, config]);

  if (!data) return null;
  const { p1, p2, pairsN, agreePct, genGap, split, loved } = data;
  const coffeeName = (b: Brew) => coffees.find((c) => c.id === b.coffee_id)?.name ?? "a brew";
  const gap = Math.abs(genGap);
  const generous = genGap >= 0 ? p1.name : p2.name;

  const personRow = (p: { name: string; avg: number; n: number }) => (
    <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 11 }}>
      <span style={{ width: 100, flexShrink: 0, fontSize: 13, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
      <div style={{ flex: 1, height: 8, background: "var(--ink-ghost)", borderRadius: 5, overflow: "hidden" }}>
        <div style={{ width: `${(p.avg / 5) * 100}%`, height: "100%", background: "var(--accent)", borderRadius: 5 }} />
      </div>
      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", width: 40, flexShrink: 0, lineHeight: 1.15 }}>
        <span className="num" style={{ fontSize: 12.5, color: "var(--ink-dim)" }}>{p.avg.toFixed(1)}★</span>
        <span className="label" style={{ fontSize: 8.5, color: "var(--ink-faint)" }}>{p.n}×</span>
      </span>
    </div>
  );

  return (
    <div className="card" style={{ padding: "16px 18px" }}>
      <div className="label" style={{ marginBottom: 14 }}>{p1.name} vs {p2.name}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {personRow(p1)}
        {personRow(p2)}
      </div>

      {agreePct != null && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
          <div className="label" style={{ marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
            <span>Agreement</span>
            <span className="mono" style={{ color: "var(--ink-dim)" }}>{agreePct}% · {pairsN} shared</span>
          </div>
          <div style={{ height: 8, background: "var(--ink-ghost)", borderRadius: 5, overflow: "hidden" }}>
            <div style={{ width: `${agreePct}%`, height: "100%", background: "var(--accent)", borderRadius: 5 }} />
          </div>
          <div style={{ fontSize: 12.5, color: "var(--ink-dim)", lineHeight: 1.45, marginTop: 10 }}>
            {gap < 0.15
              ? "You score about the same on cups you share."
              : `${generous} is the softer critic — ${gap.toFixed(1)}★ higher on average.`}
          </div>
          {split && Math.abs(split.a - split.c) >= 1 && (
            <div style={{ fontSize: 12.5, color: "var(--ink-dim)", lineHeight: 1.45, marginTop: 6 }}>
              Biggest split: <span style={{ color: "var(--ink)", fontWeight: 600 }}>{coffeeName(split.b)}</span> — {p1.name} {split.a}★, {p2.name} {split.c}★.
            </div>
          )}
          {loved && (
            <div style={{ fontSize: 12.5, color: "var(--ink-dim)", lineHeight: 1.45, marginTop: 6 }}>
              You both loved <span style={{ color: "var(--ink)", fontWeight: 600 }}>{coffeeName(loved.b)}</span>.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

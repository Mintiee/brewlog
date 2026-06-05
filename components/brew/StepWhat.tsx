"use client";
import { useState, useEffect, useMemo } from "react";
import type { Coffee, Brew, Config } from "@/lib/types";
import { coffeeStatus, activeGrams, cupsLeft, lastBrewOf, sinceText, daysAgoFromStartedAt, makeIntro } from "@/lib/domain";
import { noteIcon, noteColor, processTexture } from "@/lib/flavour";
import { Icon, FreshDot, OriginTile } from "@/components/ui";

interface StepWhatProps {
  coffees: Coffee[];
  brews: Brew[];
  config: Config;
  onPick: (c: Coffee) => void;
  onRate: (b: Brew) => void;
  onOpenBrew?: (b: Brew) => void;
  onGotoShelf?: () => void;
}

export function StepWhat({ coffees, brews, config, onPick, onRate, onOpenBrew, onGotoShelf }: StepWhatProps) {
  const intro = useMemo(() => makeIntro(config.random_greeting), [config.random_greeting]);
  const [, setTick] = useState(0);

  const pending = brews.filter((b) => b.pending).sort((a, b) => Number(b.started_at) - Number(a.started_at));

  useEffect(() => {
    if (!pending.length) return;
    const id = setInterval(() => setTick((x) => x + 1), 30000);
    return () => clearInterval(id);
  }, [pending.length]);

  const decorated = coffees.filter((c) => !c.archived).map((c) => ({ c, st: coffeeStatus(c, brews) }));
  const sortByDay = (arr: typeof decorated) => [...arr].sort((a, b) => b.st.day - a.st.day);
  const ready = sortByDay(decorated.filter((d) => d.st.ready && d.st.state !== "past"));
  const pastPeak = sortByDay(decorated.filter((d) => d.st.ready && d.st.state === "past"));

  // Recent strip: last 14 days — only render from the oldest day with a brew to today
  const byDay: Record<number, Brew[]> = {};
  brews.forEach((b) => {
    const d = daysAgoFromStartedAt(b.started_at);
    if (d <= 13) (byDay[d] = byDay[d] || []).push(b);
  });
  const hasRecent = Object.keys(byDay).length > 0;
  // Find the furthest-back day with a brew, then render from there → 0 (oldest left, today right)
  const oldestFilledDay = hasRecent ? Math.max(...Object.keys(byDay).map(Number)) : 0;
  const days = [];
  for (let d = oldestFilledDay; d >= 0; d--) days.push({ d, brews: (byDay[d] || []).slice(0, 4) });

  const rel = (d: number) => d === 0 ? "today" : d === 1 ? "yesterday" : `${d}d ago`;

  const brewerById = (id: string) => config.brewers.find((b) => b.id === id);

  const renderRow = ({ c, st }: typeof decorated[number], i: number, dim = false) => {
    const lb = lastBrewOf(c.id, brews);
    const daysAgo = lb ? daysAgoFromStartedAt(lb.started_at) : null;
    const last = daysAgo !== null ? (daysAgo === 0 ? "today" : `${daysAgo}d`) : null;
    const servesN = cupsLeft(activeGrams(c, brews));
    const serves = servesN % 1 === 0 ? String(servesN) : servesN.toFixed(1);
    return (
      <button key={c.id} onClick={() => onPick(c)} className={`rise rise-${Math.min(i + 2, 5)}`} style={{
        display: "flex", alignItems: "center", gap: 15, textAlign: "left", color: "var(--ink)",
        background: "var(--surface)", borderRadius: "var(--r-tile)", padding: "16px 17px", cursor: "pointer",
        border: "1px solid var(--line)", opacity: dim ? 0.72 : 1,
      }}>
        <OriginTile code={c.cc} roaster={c.roaster} color={c.color} size={48} radius={13} process={c.process} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "3px 10px", color: "var(--ink-faint)", fontSize: 10.5 }}>
            <span className="label" style={{ color: "var(--ink-faint)" }}>{c.roaster}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }} title="days since roast">
              <Icon name="timer" size={12} stroke={1.8} /> {st.day}d
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }} title="last brewed">
              <Icon name="brew" size={13} stroke={1.8} /> {last ?? "new"}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }} title="serves left">
              <Icon name="bean" size={13} stroke={1.8} /> {serves} left
            </span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.015em", color: "var(--ink)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", marginTop: 2 }}>{c.name}</div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "5px 13px", marginTop: 8 }}>
            {c.notes.map((n) => (
              <span key={n} style={{ display: "inline-flex", alignItems: "center", gap: 5, color: noteColor(n) }}>
                <Icon name={noteIcon(n)} size={14} stroke={1.7} />
                <span style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: "-0.01em" }}>{n}</span>
              </span>
            ))}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="screen-pad">
      <div className="rise rise-1" style={{ paddingTop: 8 }}>
        <div className="h-greet">{intro.greet}.</div>
        <h1 className="h-ask" style={{ marginTop: 4 }}>{intro.q}</h1>
      </div>

      {pending.length > 0 && (
        <div className="rise rise-2" style={{ marginTop: 24 }}>
          <div className="label" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 7 }}>
            <span className="dot" style={{ width: 6, height: 6, background: "var(--accent)" }} /> Waiting to rate · {pending.length}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {pending.map((b) => {
              const c = coffees.find((x) => x.id === b.coffee_id);
              const br = brewerById(b.brewer_id);
              if (!c) return null;
              return (
                <button key={b.id} onClick={() => onRate(b)} style={{
                  display: "flex", alignItems: "center", gap: 14, textAlign: "left", width: "100%",
                  background: "var(--accent-soft)", border: "1px solid color-mix(in srgb, var(--accent) 38%, transparent)",
                  borderRadius: "var(--r-tile)", padding: "13px 14px", cursor: "pointer", color: "var(--ink)",
                }}>
                  <OriginTile code={c.cc} roaster={c.roaster} color={c.color} size={44} radius={12} process={c.process} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink-faint)", fontSize: 11 }}>
                      <span className="label" style={{ color: "var(--ink-faint)" }}>{br ? br.short : ""}</span>
                      <span className="mono">{sinceText(b.started_at)}</span>
                    </div>
                    <div style={{ fontSize: 16.5, fontWeight: 600, letterSpacing: "-0.015em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 1 }}>{c.name}</div>
                  </div>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0,
                    background: "var(--accent)", color: "#1a0f06", fontWeight: 600, fontSize: 13.5,
                    padding: "9px 14px", borderRadius: 999 }}>
                    Rate <Icon name="chev" size={15} stroke={2.2} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="label rise rise-2" style={{ margin: "26px 0 12px" }}>Rested &amp; ready · {ready.length}</div>
      {ready.length === 0 && (
        <div className="rise rise-2" style={{ textAlign: "center", padding: "30px 16px", color: "var(--ink-dim)" }}>
          <div style={{ color: "var(--ink-ghost)", display: "flex", justifyContent: "center", marginBottom: 12 }}><Icon name="timer" size={40} stroke={1.3} /></div>
          <div style={{ fontSize: 15.5, fontWeight: 600, color: "var(--ink)" }}>Nothing's ready yet</div>
          <div style={{ fontSize: 13, marginTop: 5, lineHeight: 1.5 }}>Everything's still resting or in the freezer. Check the shelf for what's coming up.</div>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {ready.map((d, i) => renderRow(d, i))}
      </div>

      {pastPeak.length > 0 && (
        <>
          <div className="label rise rise-2" style={{ margin: "26px 0 12px", color: "var(--fade)" }}>Past peak · {pastPeak.length}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {pastPeak.map((d, i) => renderRow(d, i, true))}
          </div>
        </>
      )}

      {ready.length < 3 && onGotoShelf && (
        <button
          onClick={onGotoShelf}
          className="rise rise-5"
          style={{
            marginTop: 20, width: "100%", textAlign: "left",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "var(--surface)", border: "1px solid var(--line)",
            borderRadius: "var(--r-tile)", padding: "14px 17px",
            cursor: "pointer", color: "var(--ink-dim)",
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 500 }}>Add more coffees to your shelf</span>
          <Icon name="chev" size={16} stroke={1.8} />
        </button>
      )}

      {hasRecent && (
        <div className="rise rise-5" style={{ marginTop: 28 }}>
          <div className="label" style={{ marginBottom: 12 }}>Recently · last 2 weeks</div>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {days.map((day, i) => {
              const dt = new Date(); dt.setHours(0, 0, 0, 0); dt.setDate(dt.getDate() - day.d);
              const weekStart = i > 0 && dt.getDay() === 1;
              const tappable = day.brews.length > 0 && !!onOpenBrew;
              return (
                <span
                  key={day.d}
                  title={(day.brews.length ? day.brews.length + (day.brews.length === 1 ? " brew" : " brews") : "no brew") + " · " + rel(day.d)}
                  onClick={() => tappable && onOpenBrew!(day.brews[0])}
                  role={tappable ? "button" : undefined}
                  style={{
                    width: 19, height: 19, borderRadius: 5, overflow: "hidden", flexShrink: 0,
                    display: "grid", gap: 1, background: "rgba(12,11,10,0.35)",
                    gridTemplateColumns: day.brews.length === 4 ? "1fr 1fr" : `repeat(${Math.max(day.brews.length, 1)}, 1fr)`,
                    gridTemplateRows: day.brews.length === 4 ? "1fr 1fr" : "1fr",
                    marginLeft: weekStart ? 8 : 0,
                    border: day.brews.length ? "none" : "1px solid var(--line)",
                    boxShadow: day.brews.length ? "inset 0 0 0 1px rgba(255,255,255,0.1)" : "none",
                    cursor: tappable ? "pointer" : "default",
                  }}
                >
                  {day.brews.map((b, j) => {
                    const c = coffees.find((x) => x.id === b.coffee_id);
                    const tex = c ? processTexture(c.process) : {};
                    return <span key={j} style={{ backgroundColor: c ? c.color : "var(--ink-ghost)", ...tex }} />;
                  })}
                </span>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
            <span className="label" style={{ fontSize: 9, color: "var(--ink-ghost)" }}>{oldestFilledDay > 0 ? rel(oldestFilledDay) : ""}</span>
            <span className="label" style={{ fontSize: 9, color: "var(--ink-faint)" }}>today</span>
          </div>
        </div>
      )}

      <div className="screen-bottom" />
    </div>
  );
}

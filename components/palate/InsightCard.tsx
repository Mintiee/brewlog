"use client";
import { useState, useEffect, useCallback } from "react";
import { Icon } from "@/components/ui";
import { brewRating, localISODate } from "@/lib/domain";
import type { Brew, Coffee, Config } from "@/lib/types";

interface InsightCardProps {
  brews: Brew[];
  coffees: Coffee[];
  config: Config;
  llmEnabled: boolean;
}

const LS_KEY = "brew_insight_v3";  // bumped: invalidates old local caches on deploy
const FORTNIGHT_MS = 14 * 24 * 60 * 60 * 1000;

/** "This fortnight": rated brews from the last 14 days, most recent first, formatted for the prompt. */
function buildDigest(brews: Brew[], coffees: Coffee[], config: Config): string[] {
  const cutoff = Date.now() - FORTNIGHT_MS;
  const rated = brews
    .filter((b) => b.stars != null && Number(b.started_at) >= cutoff)
    .sort((a, b) => Number(b.started_at) - Number(a.started_at))
    .slice(0, 18);
  return rated.map((b) => {
    const c = coffees.find((x) => x.id === b.coffee_id);
    const br = config.brewers.find((x) => x.id === b.brewer_id);
    const place = c ? [c.origin, c.region].filter(Boolean).join(" ") : "";
    const coffeeLabel = c
      ? `${c.roaster} ${c.name} (${place || "?"}${c.varietal ? `, ${c.varietal}` : ""}, ${c.process}, ${c.roast})`
      : b.coffee_id;
    const brewer = br?.short ?? b.brewer_id;
    const ratio = b.ratio ? `1:${b.ratio.toFixed(1)}` : "";
    const recipe = `${b.dose}g→${b.water}g${b.bypass ? ` +${b.bypass}g bypass` : ""}, ${b.temp}°, grind ${b.grind}${ratio ? `, ${ratio}` : ""}${b.water_type ? `, ${b.water_type}` : ""}`;
    const rest = b.rest_days != null ? `, rested ${b.rest_days}d` : "";
    const scores = `acidity ${b.acidity ?? "-"}/5, sweetness ${b.sweetness ?? "-"}/5, body ${b.body ?? "-"}/5, clarity ${b.clarity ?? "-"}/5`;
    const rating = b.stars2 != null
      ? `${b.taster1 || "taster 1"} ${b.stars}/5, ${b.taster2 || config.taster2 || "taster 2"} ${b.stars2}/5`
      : `${brewRating(b).toFixed(1)}/5`;
    const note = b.note ? ` — "${b.note}"` : "";
    return `${coffeeLabel} on ${brewer} (${recipe}${rest}): ${rating} (${scores})${note}`;
  });
}

export function InsightCard({ brews, coffees, config, llmEnabled }: InsightCardProps) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Shared fetch path for both the mount-time load and a manual force-refresh.
  // Local calendar day (not UTC), so a fresh insight appears at local midnight
  // rather than at UTC midnight (mid-morning in AU). Offset lets the server
  // map its stored generated_at onto the same local day.
  const run = useCallback(async (force: boolean) => {
    const today = localISODate(Date.now());
    const tzOffsetMin = new Date().getTimezoneOffset();

    // Same-day short-circuit: skip the network round-trip entirely if we already
    // have today's insight cached locally. (The server also caps to once/day.)
    // A forced refresh always bypasses this and clears the stale entry.
    if (!force) {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
          const c = JSON.parse(raw) as { date: string; text: string };
          if (c.date === today && c.text) { setText(c.text); setLoading(false); return; }
        }
      } catch { /* ignore malformed cache */ }
    } else {
      try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
    }

    if (force) setRefreshing(true); else setLoading(true);
    setFailed(false);

    const digest = buildDigest(brews, coffees, config);

    try {
      const res = await fetch("/api/insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brews: digest, date: today, tzOffsetMin, ...(force ? { force: true } : {}) }),
        // A hung request must not spin the card forever — land in the
        // existing catch → failed-state path like any other fetch error.
        signal: AbortSignal.timeout(35_000),
      });
      if (!res.ok) throw new Error("insight failed");
      const data = await res.json();
      const sentence = typeof data.text === "string" ? data.text.trim().replace(/^["']|["']$/g, "") : null;
      if (sentence) {
        setText(sentence);
        try { localStorage.setItem(LS_KEY, JSON.stringify({ date: today, text: sentence })); } catch { /* ignore */ }
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [brews, coffees, config]);

  useEffect(() => {
    if (!llmEnabled) return;
    // Deferred a tick: run() sets state synchronously on its cache-hit path,
    // which must not happen directly in the effect body.
    const t = setTimeout(() => void run(false), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brews, coffees, config, llmEnabled]);

  if (!llmEnabled) return (
    <div className="card" style={{ padding: 18, opacity: 0.6 }}>
      <div style={{ display: "flex", gap: 8, color: "var(--ink-faint)", alignItems: "center" }}>
        <Icon name="spark" size={16} stroke={1.8} />
        <span className="label">This fortnight · Add an AI key in Settings to enable</span>
      </div>
    </div>
  );
  if (failed && !text) return null;

  return (
    <div className="card" style={{ padding: 18, background: "var(--surface)", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -30, right: -30, width: 120, height: 120, borderRadius: "50%", background: "var(--accent-soft)", filter: "blur(8px)" }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12, position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--accent)" }}>
          <Icon name="spark" size={17} stroke={1.8} />
          <span className="label" style={{ color: "var(--accent)" }}>This fortnight</span>
        </div>
        <button
          onClick={() => void run(true)}
          disabled={loading || refreshing}
          aria-label="Refresh insight"
          title="Refresh insight"
          style={{
            background: "none", border: "none", cursor: loading || refreshing ? "default" : "pointer",
            color: "var(--ink-faint)", padding: 4, display: "flex", opacity: loading || refreshing ? 0.5 : 1,
          }}
        >
          <Icon name="refresh" size={15} stroke={2} className={refreshing ? "spin" : undefined} />
        </button>
      </div>
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <div className="shimmer" style={{ height: 13, width: "100%", borderRadius: 7, background: "var(--surface-3)" }} />
          <div className="shimmer" style={{ height: 13, width: "92%", borderRadius: 7, background: "var(--surface-3)" }} />
          <div className="shimmer" style={{ height: 13, width: "70%", borderRadius: 7, background: "var(--surface-3)" }} />
        </div>
      ) : (
        <p style={{ fontSize: 16, lineHeight: 1.5, fontWeight: 500, letterSpacing: "-0.01em", margin: 0, position: "relative", textWrap: "pretty", opacity: refreshing ? 0.5 : 1 }}>
          {text}
        </p>
      )}
    </div>
  );
}

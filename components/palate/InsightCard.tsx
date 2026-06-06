"use client";
import { useState, useEffect } from "react";
import { Icon } from "@/components/ui";
import { brewRating, localISODate } from "@/lib/domain";
import type { Brew, Coffee, Config } from "@/lib/types";

interface InsightCardProps {
  brews: Brew[];
  coffees: Coffee[];
  config: Config;
  llmEnabled: boolean;
}

export function InsightCard({ brews, coffees, config, llmEnabled }: InsightCardProps) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!llmEnabled) return;
    let cancelled = false;

    const LS_KEY = "brew_insight_v3";  // bumped: invalidates old local caches on deploy
    // Local calendar day (not UTC), so a fresh insight appears at local midnight
    // rather than at UTC midnight (mid-morning in AU). Offset lets the server
    // map its stored generated_at onto the same local day.
    const today = localISODate(Date.now());
    const tzOffsetMin = new Date().getTimezoneOffset();
    const FORTNIGHT_MS = 14 * 24 * 60 * 60 * 1000;

    async function run() {
      // Same-day short-circuit: skip the network round-trip entirely if we already
      // have today's insight cached locally. (The server also caps to once/day.)
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
          const c = JSON.parse(raw) as { date: string; text: string };
          if (c.date === today && c.text) { setText(c.text); setLoading(false); return; }
        }
      } catch { /* ignore malformed cache */ }

      setLoading(true);
      setFailed(false);
      setText(null);

      // "This fortnight": rated brews from the last 14 days, most recent first.
      const cutoff = Date.now() - FORTNIGHT_MS;
      const rated = brews
        .filter((b) => b.stars != null && Number(b.started_at) >= cutoff)
        .sort((a, b) => Number(b.started_at) - Number(a.started_at))
        .slice(0, 18);
      const digest = rated.map((b) => {
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

      try {
        const res = await fetch("/api/insight", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brews: digest, date: today, tzOffsetMin }),
        });
        if (!res.ok) throw new Error("insight failed");
        const data = await res.json();
        const sentence = typeof data.text === "string" ? data.text.trim().replace(/^["']|["']$/g, "") : null;
        if (!cancelled) {
          if (sentence) {
            setText(sentence);
            setLoading(false);
            try { localStorage.setItem(LS_KEY, JSON.stringify({ date: today, text: sentence })); } catch { /* ignore */ }
          } else {
            setFailed(true);
          }
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    run();
    return () => { cancelled = true; };
  }, [brews, coffees, config, llmEnabled]);

  if (!llmEnabled) return (
    <div className="card" style={{ padding: 18, opacity: 0.6 }}>
      <div style={{ display: "flex", gap: 8, color: "var(--ink-faint)", alignItems: "center" }}>
        <Icon name="spark" size={16} stroke={1.8} />
        <span className="label">This fortnight · Add an AI key in Settings to enable</span>
      </div>
    </div>
  );
  if (failed) return null;

  return (
    <div className="card" style={{ padding: 18, background: "var(--surface)", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -30, right: -30, width: 120, height: 120, borderRadius: "50%", background: "var(--accent-soft)", filter: "blur(8px)" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--accent)", marginBottom: 12, position: "relative" }}>
        <Icon name="spark" size={17} stroke={1.8} />
        <span className="label" style={{ color: "var(--accent)" }}>This fortnight</span>
      </div>
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <div className="shimmer" style={{ height: 13, width: "100%", borderRadius: 7, background: "var(--surface-3)" }} />
          <div className="shimmer" style={{ height: 13, width: "92%", borderRadius: 7, background: "var(--surface-3)" }} />
          <div className="shimmer" style={{ height: 13, width: "70%", borderRadius: 7, background: "var(--surface-3)" }} />
        </div>
      ) : (
        <p style={{ fontSize: 16, lineHeight: 1.5, fontWeight: 500, letterSpacing: "-0.01em", margin: 0, position: "relative", textWrap: "pretty" }}>
          {text}
        </p>
      )}
    </div>
  );
}

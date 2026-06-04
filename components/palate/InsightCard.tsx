"use client";
import { useState, useEffect } from "react";
import { Icon } from "@/components/ui";
import { brewRating } from "@/lib/domain";
import type { Brew, Coffee } from "@/lib/types";

interface InsightCardProps {
  brews: Brew[];
  coffees: Coffee[];
  llmEnabled: boolean;
}

export function InsightCard({ brews, coffees, llmEnabled }: InsightCardProps) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!llmEnabled) return;
    let cancelled = false;

    const LS_KEY = "brew_insight";
    const today = new Date().toISOString().slice(0, 10);

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

      const rated = brews.filter((b) => b.stars != null).slice(0, 18);
      const digest = rated.map((b) => {
        const c = coffees.find((x) => x.id === b.coffee_id);
        const coffeeLabel = c
          ? `${c.roaster} ${c.name} (${c.process})`
          : b.coffee_id;
        const acidity = b.acidity ?? "-";
        const sweetness = b.sweetness ?? "-";
        const body = b.body ?? "-";
        const clarity = b.clarity ?? "-";
        return `${coffeeLabel} on ${b.brewer_id}: ${brewRating(b).toFixed(1)}/5 (acidity ${acidity}/5, sweetness ${sweetness}/5, body ${body}/5, clarity ${clarity}/5)`;
      });

      try {
        const res = await fetch("/api/insight", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brews: digest }),
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
  }, [brews, coffees, llmEnabled]);

  if (!llmEnabled) return null;
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
          <div className="shimmer" style={{ height: 13, width: "100%", borderRadius: 7 }} />
          <div className="shimmer" style={{ height: 13, width: "92%", borderRadius: 7 }} />
          <div className="shimmer" style={{ height: 13, width: "70%", borderRadius: 7 }} />
        </div>
      ) : (
        <p style={{ fontSize: 16, lineHeight: 1.5, fontWeight: 500, letterSpacing: "-0.01em", margin: 0, position: "relative", textWrap: "pretty" }}>
          {text}
        </p>
      )}
    </div>
  );
}

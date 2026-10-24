"use client";
import { memo } from "react";
import { formatWeight, freshColor, roastDateText } from "@/lib/domain";
import { useCoffeeColor } from "@/lib/store/AppContext";
import { Icon } from "@/components/ui/Icon";
import { OriginTile } from "@/components/ui/OriginTile";
import { CoffeeName } from "@/components/ui/CoffeeName";
import type { Coffee, FreshStatus } from "@/lib/types";

interface ResultRowProps {
  coffee: Coffee;
  /** Freshness for live bags; ignored once the bag is finished. */
  status?: FreshStatus;
  avg: number | null;
  onOpen: (c: Coffee) => void;
  /** Second line: roaster + weight by default, roaster + roast date + process in "history". */
  variant?: "shelf" | "history";
}

/**
 * Compact one-line bag row — shared by the Finished list, search results and the
 * "From {producer}" history in CoffeeDetail. Finished bags render dashed and faded
 * so a repeat purchase reads at a glance against what's on the shelf now.
 */
export const ResultRow = memo(function ResultRow({ coffee: c, status, avg, onOpen, variant = "shelf" }: ResultRowProps) {
  const colorOf = useCoffeeColor();
  const done = c.archived;
  const detail = variant === "history"
    ? [c.roaster, c.roasted_at ? roastDateText(c.roasted_at) : "", c.process].filter(Boolean).join(" · ")
    : `${c.roaster}${c.grams ? ` · ${formatWeight(c.grams)}` : ""}`;
  return (
    <button
      onClick={() => onOpen(c)}
      style={{
        width: "100%", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 12,
        background: done ? "transparent" : "var(--surface)",
        border: done ? "1px dashed var(--line-2)" : "1px solid var(--line)",
        borderRadius: 13, padding: "10px 14px", marginBottom: 8, opacity: done ? 0.6 : 1,
      }}
    >
      <OriginTile code={c.cc} roaster={c.roaster} color={colorOf(c.notes)} size={30} radius={8} process={c.process} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <CoffeeName coffee={c} style={{ fontSize: 14 }} />
        <div className="label" style={{ color: "var(--ink-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{detail}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
        {avg != null && (
          <span className="mono" style={{ fontSize: 12, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Icon name="star" size={12} stroke={1.8} /> {avg.toFixed(1)}
          </span>
        )}
        {done || !status ? (
          (avg == null || variant === "history") && <span className="label" style={{ fontSize: 9 }}>finished</span>
        ) : (
          <span className="label" style={{ fontSize: 9, display: "inline-flex", alignItems: "center", gap: 5, color: freshColor(status.state) }}>
            <span className="dot" style={{ width: 5, height: 5, background: freshColor(status.state) }} />
            {status.state === "past" ? "past peak" : status.state}
          </span>
        )}
      </div>
    </button>
  );
});

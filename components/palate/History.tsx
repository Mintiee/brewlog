"use client";
import { Icon } from "@/components/ui";
import { InsightCard } from "./InsightCard";
import { FlavourRanking } from "./FlavourRanking";
import { BrewingTips } from "./BrewingTips";
import { Journal } from "./Journal";
import type { Brew, Coffee, Config } from "@/lib/types";

interface HistoryProps {
  brews: Brew[];
  coffees: Coffee[];
  config: Config;
  llmEnabled: boolean;
}

export function History({ brews, coffees, config, llmEnabled }: HistoryProps) {
  return (
    <div className="screen">
      <div className="screen-pad" style={{ paddingTop: 8 }}>
        <div className="label">last 3 weeks · {brews.length} brews</div>
        <h1 className="h-ask" style={{ fontSize: 30, marginTop: 3, marginBottom: 18 }}>Palate</h1>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {brews.length === 0 ? (
            <div style={{ textAlign: "center", padding: "50px 16px", color: "var(--ink-dim)" }}>
              <div style={{ color: "var(--ink-ghost)", display: "flex", justifyContent: "center", marginBottom: 12 }}>
                <Icon name="log" size={44} stroke={1.3} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)" }}>No brews yet</div>
              <div style={{ fontSize: 13.5, marginTop: 6, lineHeight: 1.5 }}>
                Log a few brews and your flavour patterns and tips will show up here.
              </div>
            </div>
          ) : (
            <>
              <InsightCard brews={brews} coffees={coffees} llmEnabled={llmEnabled} />
              <FlavourRanking brews={brews} coffees={coffees} />
              <div className="label" style={{ margin: "6px 2px -2px" }}>Brewing tips</div>
              <BrewingTips brews={brews} coffees={coffees} config={config} />
              <div style={{ marginTop: 8 }}>
                <Journal brews={brews} coffees={coffees} config={config} />
              </div>
            </>
          )}
        </div>
        <div className="screen-bottom" />
      </div>
    </div>
  );
}

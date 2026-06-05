"use client";
import { useState } from "react";
import { Icon, Segmented } from "@/components/ui";
import { InsightCard } from "./InsightCard";
import { FlavourRanking } from "./FlavourRanking";
import { RoasterRanking } from "./RoasterRanking";
import { BrewingTips } from "./BrewingTips";
import { Journal } from "./Journal";
import { BrewDetail } from "./BrewDetail";
import { useApp } from "@/lib/store/AppContext";
import type { Brew, Coffee, Config } from "@/lib/types";

interface HistoryProps {
  brews: Brew[];
  coffees: Coffee[];
  config: Config;
  llmEnabled: boolean;
}

export function History({ brews, coffees, config, llmEnabled }: HistoryProps) {
  const { updateBrew, dismissBrew } = useApp();
  const [selected, setSelected] = useState<Brew | null>(null);
  const [view, setView] = useState<"journal" | "stats">("journal");

  const handleUpdate = (id: string, patch: Partial<Brew>) => {
    updateBrew(id, patch);
  };

  return (
    <div className="screen">
      <div className="screen-pad" style={{ paddingTop: 8 }}>
        <div className="label">{brews.length} {brews.length === 1 ? "brew" : "brews"}</div>
        <h1 className="h-ask" style={{ fontSize: 30, marginTop: 3, marginBottom: 18 }}>Log</h1>

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
            <div style={{ marginBottom: 16 }}>
              <Segmented
                options={["Journal", "Stats"]}
                value={view === "journal" ? "Journal" : "Stats"}
                onChange={(v) => setView(v === "Journal" ? "journal" : "stats")}
              />
            </div>
            {view === "journal" ? (
              <Journal brews={brews} coffees={coffees} config={config} onOpen={setSelected} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <InsightCard brews={brews} coffees={coffees} config={config} llmEnabled={llmEnabled} />
                <FlavourRanking brews={brews} coffees={coffees} />
                <RoasterRanking brews={brews} coffees={coffees} />
                <BrewingTips brews={brews} coffees={coffees} config={config} llmEnabled={llmEnabled} />
              </div>
            )}
          </>
        )}
        <div className="screen-bottom" />
      </div>

      <BrewDetail
        brew={selected}
        coffees={coffees}
        config={config}
        onClose={() => setSelected(null)}
        onUpdate={handleUpdate}
        onDelete={dismissBrew}
      />
    </div>
  );
}

"use client";
import { useState, useMemo } from "react";
import { Icon, Segmented } from "@/components/ui";
import { InsightCard } from "./InsightCard";
import { FlavourRanking } from "./FlavourRanking";
import { RoasterRanking } from "./RoasterRanking";
import { OriginRanking } from "./OriginRanking";
import { ProcessRanking } from "./ProcessRanking";
import { VarietalRanking } from "./VarietalRanking";
import { BrewerRanking } from "./BrewerRanking";
import { TasterFaceoff } from "./TasterFaceoff";
import { RatingTrend } from "./RatingTrend";
import { OriginVolume, RoasterVolume, ProcessVolume } from "./VolumeCards";
import { RestRanking } from "./RestRanking";
import { BrewingTips } from "./BrewingTips";
import { Journal } from "./Journal";
import { BrewDetail } from "./BrewDetail";
import { StepRate } from "@/components/brew/StepRate";
import { Sheet } from "@/components/ui/Sheet";
import { useApp } from "@/lib/store/AppContext";
import type { Brew, Coffee, Config, Recipe } from "@/lib/types";

interface HistoryProps {
  brews: Brew[];
  coffees: Coffee[];
  config: Config;
  llmEnabled: boolean;
}

export function History({ brews, coffees, config, llmEnabled }: HistoryProps) {
  const { updateBrew, dismissBrew, rateBrew, profile } = useApp();
  const [selected, setSelected] = useState<Brew | null>(null);
  const [rating, setRating] = useState<Brew | null>(null);
  const [view, setView] = useState<"journal" | "stats">("journal");

  // Derive the brewer + recipe a pending brew was logged with, so StepRate can
  // open straight from the journal popup.
  const rateBrewer = rating ? (config.brewers.find((b) => b.id === rating.brewer_id) ?? config.brewers[0]) : null;
  const rateRecipe: Recipe | null = rating
    ? { dose: rating.dose, water: rating.water, temp: rating.temp, grind: rating.grind, water_type: rating.water_type, bypass: rating.bypass || 0, ratio: rating.ratio }
    : null;
  const rateCoffee = rating ? coffees.find((c) => c.id === rating.coffee_id) ?? null : null;

  // The Journal lists every brew (rated + unrated), matching the Recently strip.
  // Stats stay rated-only so unrated brews don't skew rankings/insight/tips.
  const rated = useMemo(() => brews.filter((b) => !b.pending), [brews]);

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
                <InsightCard brews={rated} coffees={coffees} config={config} llmEnabled={llmEnabled} />
                <RatingTrend brews={rated} />
                <OriginVolume brews={brews} coffees={coffees} />
                <RoasterVolume brews={brews} coffees={coffees} />
                <ProcessVolume brews={brews} coffees={coffees} />
                <FlavourRanking brews={rated} coffees={coffees} />
                <RoasterRanking brews={rated} coffees={coffees} />
                <OriginRanking brews={rated} coffees={coffees} />
                <ProcessRanking brews={rated} coffees={coffees} />
                <VarietalRanking brews={rated} coffees={coffees} />
                <BrewerRanking brews={rated} config={config} />
                <RestRanking brews={rated} />
                <TasterFaceoff brews={rated} coffees={coffees} config={config} />
                <BrewingTips brews={rated} coffees={coffees} config={config} llmEnabled={llmEnabled} />
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
        onRate={(b) => { setSelected(null); setRating(b); }}
      />

      {/* Rate an unrated brew straight from the journal popup. */}
      <Sheet open={!!rating} onClose={() => setRating(null)}>
        {rating && rateBrewer && rateRecipe && rateCoffee && (
          <StepRate
            coffee={rateCoffee}
            brewer={rateBrewer}
            recipe={rateRecipe}
            brew={rating}
            profile={profile}
            config={config}
            onSave={(r) => { rateBrew(rating.id, r as Partial<Brew>); setRating(null); }}
          />
        )}
      </Sheet>
    </div>
  );
}

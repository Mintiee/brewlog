"use client";
import { useState, useMemo } from "react";
import { Icon, Segmented, EmptyState } from "@/components/ui";
import dynamic from "next/dynamic";
import { Journal } from "./Journal";
import { StepRate } from "@/components/brew/StepRate";
import { Sheet } from "@/components/ui/Sheet";
import { useAppActions, useAppSelector } from "@/lib/store/AppContext";
import type { Brew, Coffee, Config, Recipe } from "@/lib/types";

/**
 * The stats stack (StatsView -> BarCard, RatingTrend, TasterFaceoff, BrewingTips,
 * InsightCard, lib/palate/stats) is only reachable behind the Journal/Stats toggle,
 * so it has no business being in the initial bundle. BrewDetail is a sheet that
 * renders nothing until a card is tapped.
 */
const StatsView = dynamic(() => import("./StatsView").then((m) => m.StatsView), {
  ssr: false,
  loading: () => <div style={{ minHeight: 240 }} />,
});
const BrewDetail = dynamic(() => import("./BrewDetail").then((m) => m.BrewDetail), { ssr: false });

interface HistoryProps {
  brews: Brew[];
  coffees: Coffee[];
  config: Config;
  llmEnabled: boolean;
}

export function History({ brews, coffees, config, llmEnabled }: HistoryProps) {
  const { updateBrew, dismissBrew, dismissBrewSession, rateBrew } = useAppActions();
  const profile = useAppSelector((s) => s.profile);
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
  // Stats stay rated-only so unrated brews don't skew rankings/insight/tips —
  // a brew resolved as "unrated" (rated_at set, stars null) is non-pending but
  // must still be excluded here, hence the explicit stars check.
  const rated = useMemo(() => brews.filter((b) => !b.pending && b.stars != null), [brews]);

  const handleUpdate = (id: string, patch: Partial<Brew>) => {
    updateBrew(id, patch);
  };

  return (
    <div className="screen">
      <div className="screen-pad" style={{ paddingTop: 8 }}>
        <div className="label">{brews.length} {brews.length === 1 ? "brew" : "brews"}</div>
        <h1 className="h-ask" style={{ fontSize: 30, marginTop: 3, marginBottom: 18 }}>Log</h1>

        {brews.length === 0 ? (
          <EmptyState
            icon="log"
            title="No brews yet"
            body="Log a few brews and your flavour patterns and tips will show up here."
          />
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
              <StatsView rated={rated} allBrews={brews} coffees={coffees} config={config} llmEnabled={llmEnabled} />
            )}
          </>
        )}
        <div className="screen-bottom" />
      </div>

      <BrewDetail
        brew={selected}
        coffees={coffees}
        brews={brews}
        config={config}
        onClose={() => setSelected(null)}
        onUpdate={handleUpdate}
        onDelete={dismissBrewSession}
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

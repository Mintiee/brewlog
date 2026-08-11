"use client";
import { useState } from "react";
import type { Coffee, Brew, Brewer, Recipe, Config, Profile } from "@/lib/types";
import { recipeRatio } from "@/lib/domain";
import { Icon } from "@/components/ui";
import { CoffeePin } from "./CoffeePin";
import { RatingFields, EMPTY_RATING, type RatingDraft } from "./RatingFields";

interface StepRateProps {
  coffee: Coffee;
  brewer: Brewer;
  recipe: Recipe;
  brew: Brew;
  profile: Profile;
  config: Config;
  onSave: (rating: object) => void;
  onSkip?: () => void;
}

export function StepRate({ coffee, brewer, recipe, brew, profile, config, onSave, onSkip }: StepRateProps) {
  const meName = profile.name || "You";
  const [draft, setDraft] = useState<RatingDraft>(EMPTY_RATING);
  const patch = (p: Partial<RatingDraft>) => setDraft((d) => ({ ...d, ...p }));

  // brew is accepted as prop (may be used by parent/future callers)
  void brew;

  return (
    <div className="screen-pad" style={{ paddingTop: 6 }}>
      <CoffeePin coffee={coffee} brews={[]} onChange={() => {}} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, color: "var(--ink-dim)", fontSize: 13 }}>
        <span className="mono">{brewer.short} · <span style={{ color: "var(--ink)", fontWeight: 600 }}>{recipe.grind}{config.grinder.unit[0]}</span> · {recipe.temp}°C</span>
        <span className="mono">{recipe.water + (recipe.bypass || 0)}g · 1:{recipeRatio(recipe).toFixed(1)}</span>
      </div>

      <h2 className="h-ask" style={{ fontSize: 22, marginTop: 16, marginBottom: 12 }}>How was it?</h2>

      <RatingFields
        value={draft}
        onChange={patch}
        meName={meName}
        partnerName={config.taster2 || "Kris"}
      />

      <button className="btn btn-accent" disabled={!draft.stars}
        onClick={() => onSave({
          stars: draft.stars,
          acidity: draft.acidity, sweetness: draft.sweetness, body: draft.body, clarity: draft.clarity,
          note: draft.note, taster1: meName,
          stars2: draft.stars2 || null,
          taster2: draft.stars2 ? (draft.taster2 || null) : null,
        })}
        style={{ marginTop: 12, opacity: draft.stars ? 1 : 0.4 }}>
        <Icon name="check" size={20} stroke={2} /> Save rating
      </button>

      {onSkip && (
        <button className="btn btn-ghost" style={{ marginTop: 6, height: 42, justifyContent: "center", color: "var(--ink-faint)" }} onClick={onSkip}>
          Don&apos;t rate this one — keep it unrated
        </button>
      )}
      <div className="screen-bottom" />
    </div>
  );
}

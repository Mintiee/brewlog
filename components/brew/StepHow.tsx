"use client";
import { useState, useMemo } from "react";
import type { Coffee, Brew, Brewer, Config, Recipe, SavedRecipe } from "@/lib/types";
import { defaultsFor, previousBrewFor, recipeDelta, brewRating, recipeRatio } from "@/lib/domain";
import { Icon, SheetHeader } from "@/components/ui";
import { Sheet } from "@/components/ui/Sheet";
import { CoffeePin } from "./CoffeePin";
import { RecipeFields } from "./RecipeFields";
import { WaterTypeRow } from "./WaterTypeRow";

export type Audience = "me" | "partner" | "split" | "guest";

interface StepHowProps {
  coffee: Coffee;
  brews: Brew[];
  config: Config;
  /** Saved recipe library — rendered as apply-on-tap chips. */
  recipes: SavedRecipe[];
  /** Persist the current recipe under a name. */
  addRecipe: (r: SavedRecipe) => Promise<boolean>;
  /** Show the partner options (Kris / Split) — only truthy when another household member exists. */
  canSplit?: boolean;
  /** Display name of the partner (e.g. "Kris"). */
  splitPartnerName?: string;
  onChangeCoffee: () => void;
  onLog: (brewer: Brewer, recipe: Recipe, audience: Audience) => void;
}

// Pick a brewer-shaped icon by matching the user-facing label (`short`) and id.
// Matching is normalized + substring because user-created brewers get a timestamp
// id ("b" + Date.now()), so `short` ("V60", "Gabi", "OXO") is the reliable signal.
function brewerIcon(b: Brewer): string {
  const key = `${b.short} ${b.id}`.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (key.includes("v60")) return "dripperV60";
  if (key.includes("gabi")) return "dripperGabi";
  if (key.includes("oxo")) return "dripperOxo";
  return "dripper";
}

// "Who's it for?" pill — one option in the audience selector.
function AudiencePill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: "8px 5px", borderRadius: 10, cursor: "pointer", fontSize: 12, fontWeight: 600,
        fontFamily: "var(--font-ui)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        background: active ? "var(--ink)" : "none",
        color: active ? "var(--bg)" : "var(--ink-faint)",
        border: `1px solid ${active ? "var(--ink)" : "transparent"}`,
        transition: "all .15s ease",
      }}
    >
      {label}
    </button>
  );
}

export function StepHow({ coffee, brews, config, recipes, addRecipe, canSplit, splitPartnerName, onChangeCoffee, onLog }: StepHowProps) {
  const recipeFromBrew = (b: Brew): Recipe =>
    ({ dose: b.dose, ratio: b.ratio, water: b.water, bypass: b.bypass || 0, temp: b.temp, grind: b.grind, water_type: b.water_type });

  // Most recent brew of this coffee on a given brewer (incl. the just-logged pending one).
  const lastBrewOn = (brewerId: string) =>
    brews
      .filter((x) => x.coffee_id === coffee.id && x.brewer_id === brewerId)
      .sort((a, c) => Number(c.started_at) - Number(a.started_at))[0] || null;

  // Most recent brew on a given brewer, any coffee — the second-tier default
  // when this coffee hasn't been brewed on this brewer yet.
  const lastOnBrewer = (brewerId: string) =>
    brews
      .filter((x) => x.brewer_id === brewerId)
      .sort((a, c) => Number(c.started_at) - Number(a.started_at))[0] || null;

  // Recipe for a brewer with no history for this coffee: most recent brew on
  // that brewer (any coffee) → the brewer's seed defaults.
  const fallbackRecipe = (b: Brewer): Recipe => {
    const onBrewer = lastOnBrewer(b.id);
    return onBrewer ? recipeFromBrew(onBrewer) : { ...defaultsFor(coffee, b), water_type: config.default_water };
  };

  // Default to the single most recent brew of this coffee — brewer and recipe from the same brew.
  // Memoised: this filters and sorts the entire brew list, and only the useState
  // initialisers below consume it, yet it re-ran on every render — including the
  // 50-120ms tick of a held-down stepper.
  const lastForCoffee = useMemo(
    () => brews
      .filter((x) => x.coffee_id === coffee.id)
      .sort((a, c) => Number(c.started_at) - Number(a.started_at))[0] || null,
    [brews, coffee.id],
  );
  const initialBrewer = (lastForCoffee && config.brewers.find((b) => b.id === lastForCoffee.brewer_id)) || config.brewers[0];

  const [brewer, setBrewer] = useState<Brewer>(initialBrewer);
  const [r, setR] = useState<Recipe>(() =>
    lastForCoffee ? recipeFromBrew(lastForCoffee) : fallbackRecipe(initialBrewer)
  );
  // Default to "split" when the brewer is OXO (makes enough for two) and a partner exists;
  // otherwise "Just me". "For a guest" is always available but never the automatic default.
  const defaultAudience = (b: Brewer): Audience => (!!canSplit && brewerIcon(b) === "dripperOxo" ? "split" : "me");
  const [audience, setAudience] = useState<Audience>(() => defaultAudience(initialBrewer));
  const [saveOpen, setSaveOpen] = useState(false);
  const [recipeName, setRecipeName] = useState("");

  // Apply a saved recipe: load its parameters into the working recipe, and if it
  // was saved on a still-configured brewer, select that brewer too.
  function applyRecipe(rec: SavedRecipe) {
    setR({
      dose: rec.dose, water: rec.water, bypass: rec.bypass || 0,
      temp: rec.temp, grind: rec.grind, ratio: rec.ratio, water_type: rec.water_type,
    });
    if (rec.brewer_id) {
      const b = config.brewers.find((x) => x.id === rec.brewer_id);
      if (b) setBrewer(b);
    }
  }

  // A chip reads as "active" when the working recipe still matches it exactly —
  // editing any stepper afterwards silently clears the highlight.
  const recipeActive = (rec: SavedRecipe) =>
    r.dose === rec.dose && r.water === rec.water && (r.bypass || 0) === (rec.bypass || 0) &&
    r.temp === rec.temp && r.grind === rec.grind && r.water_type === rec.water_type &&
    (!rec.brewer_id || rec.brewer_id === brewer.id);

  function openSaveSheet() {
    // Sensible default name — brewer short + coffee name; user can overwrite.
    setRecipeName(`${brewer.short} ${coffee.name}`.trim());
    setSaveOpen(true);
  }

  function commitRecipe() {
    const name = recipeName.trim();
    if (!name) return;
    void addRecipe({
      id: crypto.randomUUID(),
      name,
      dose: r.dose, water: r.water, bypass: r.bypass || 0, temp: r.temp,
      grind: r.grind, ratio: recipeRatio(r), water_type: r.water_type,
      brewer_id: brewer.id,
    });
    setSaveOpen(false);
  }

  function selectBrewer(b: Brewer) {
    setBrewer(b);
    setAudience(defaultAudience(b));
    const last = lastBrewOn(b.id);
    setR(last ? recipeFromBrew(last) : fallbackRecipe(b));
  }

  // Passive reference to the previous brew of this coffee — prefers this brewer,
  // falls back to any brewer if this coffee hasn't been brewed on it before.
  //
  // Memoised: previousBrewFor does four chained filters plus a sort over every brew,
  // and this line called it twice. It depends on the coffee and brewer, never on the
  // recipe being edited, so a stepper tick has no business recomputing it.
  const prevBrew = useMemo(
    () => previousBrewFor(coffee.id, brewer.id, brews) ?? previousBrewFor(coffee.id, null, brews),
    [coffee.id, brewer.id, brews],
  );
  const prevDelta = prevBrew ? recipeDelta(prevBrew, r) : null;
  const prevRating = prevBrew && prevBrew.stars != null ? brewRating(prevBrew) : null;

  const patchRecipe = (p: Partial<Recipe>) => setR((s) => ({ ...s, ...p }));

  return (
    <div className="screen-pad">
      <div className="rise rise-1"><CoffeePin coffee={coffee} brews={brews} onChange={onChangeCoffee} /></div>

      <h2 className="h-ask rise rise-2" style={{ fontSize: 21, marginTop: 10 }}>How are you brewing?</h2>

      {/* brewer tiles */}
      <div className="rise rise-2" style={{ display: "flex", gap: 9, marginTop: 10 }}>
        {config.brewers.map((b) => {
          const on = b.id === brewer.id;
          return (
            <button key={b.id} onClick={() => selectBrewer(b)} style={{
              flex: 1, padding: "10px 8px 8px", borderRadius: 16, cursor: "pointer",
              background: on ? "var(--ink)" : "var(--surface)",
              color: on ? "var(--bg)" : "var(--ink-dim)",
              border: `1px solid ${on ? "var(--ink)" : "var(--line)"}`,
              transition: "all .15s ease", display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
            }}>
              <Icon name={brewerIcon(b)} size={22} stroke={1.5} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{b.short}</span>
            </button>
          );
        })}
      </div>

      {/* Saved recipes — apply-on-tap chips, only when the library has entries */}
      {recipes.length > 0 && (
        <div className="rise rise-2" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          {recipes.map((rec) => (
            <span
              key={rec.id}
              className="chip"
              data-on={recipeActive(rec)}
              onClick={() => applyRecipe(rec)}
              style={{ cursor: "pointer" }}
            >
              {rec.name}
            </span>
          ))}
        </div>
      )}

      {/* recipe — grind-led, dense steppers to save vertical space */}
      <div className="rise rise-3" style={{ marginTop: 10 }}>
        <RecipeFields dense recipe={r} onChange={patchRecipe} config={config} showBypass={brewer.bypass} />
      </div>

      {/* Save the current recipe to the library — small ghost affordance */}
      <div className="rise rise-3" style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
        <button
          onClick={openSaveSheet}
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            background: "none", border: "none", cursor: "pointer",
            color: "var(--ink-faint)", fontFamily: "var(--font-ui)",
            fontSize: 12.5, fontWeight: 600, padding: "4px 2px",
          }}
        >
          <Icon name="plus" size={15} stroke={2} /> Save recipe
        </button>
      </div>

      {/* Last brew of this coffee — passive reference, no advice */}
      {prevBrew && prevDelta && (
        <div
          className="label rise rise-3"
          style={{
            marginTop: 8, display: "flex", alignItems: "center", gap: 6,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}
        >
          <span>Last time</span>
          <span>·</span>
          <span style={{ color: prevDelta.find((d) => d.key === "grind")?.changed ? "var(--ink)" : "var(--ink-faint)" }}>
            {prevBrew.grind}{config.grinder.unit[0]} grind
          </span>
          <span>·</span>
          <span style={{ color: prevDelta.find((d) => d.key === "temp")?.changed ? "var(--ink)" : "var(--ink-faint)" }}>
            {prevBrew.temp}°
          </span>
          <span>·</span>
          <span style={{ color: prevDelta.find((d) => d.key === "dose")?.changed ? "var(--ink)" : "var(--ink-faint)" }}>
            {prevBrew.dose}g
          </span>
          <span>·</span>
          <span style={{ color: prevDelta.find((d) => d.key === "water")?.changed ? "var(--ink)" : "var(--ink-faint)" }}>
            {prevBrew.water}g
          </span>
          {prevRating != null && (
            <>
              <span>·</span>
              <span>★{prevRating}</span>
            </>
          )}
        </div>
      )}

      {/* Water + Who's it for */}
      <div className="card rise rise-4" style={{ marginTop: 10, padding: "2px 16px" }}>
        {/* Water — tap row opens the picker sheet */}
        <WaterTypeRow value={r.water_type} onChange={(w) => patchRecipe({ water_type: w })} waters={config.waters} />

        <div style={{ height: 1, background: "var(--line)" }} />
        <div style={{ padding: "10px 0" }}>
          <span className="label" style={{ display: "block", marginBottom: 6 }}>Who&apos;s it for?</span>
          <div style={{ display: "flex", gap: 5, background: "var(--surface-2)", borderRadius: 12, padding: 3 }}>
            <AudiencePill label="Me"    active={audience === "me"}      onClick={() => setAudience("me")} />
            {canSplit && (
              <AudiencePill label={splitPartnerName ?? "Partner"} active={audience === "partner"} onClick={() => setAudience("partner")} />
            )}
            {canSplit && (
              <AudiencePill label="Split" active={audience === "split"} onClick={() => setAudience("split")} />
            )}
            <AudiencePill label="Guest" active={audience === "guest"}   onClick={() => setAudience("guest")} />
          </div>
        </div>
      </div>

      <div className="rise rise-5" style={{ marginTop: 10 }}>
        <button className="btn btn-accent" onClick={() => onLog(brewer, r, audience)}>
          <Icon name="check" size={19} stroke={2} /> Log coffee
        </button>
      </div>
      <div className="screen-bottom" />

      {/* Save-recipe naming sheet */}
      <Sheet open={saveOpen} onClose={() => setSaveOpen(false)}>
        <div className="screen-pad" style={{ paddingTop: 6 }}>
          <SheetHeader title="Save recipe" onClose={() => setSaveOpen(false)} />
          <input
            value={recipeName}
            onChange={(e) => setRecipeName(e.target.value)}
            placeholder="e.g. V60 bright"
            autoFocus
            style={{
              width: "100%", padding: "12px 14px", borderRadius: 13,
              background: "var(--surface)", border: "1px solid var(--line)",
              color: "var(--ink)", outline: "none", fontFamily: "var(--font-ui)",
              fontSize: 16, boxSizing: "border-box", marginBottom: 8,
            }}
          />
          <div className="mono" style={{ fontSize: 12, color: "var(--ink-faint)", marginBottom: 16 }}>
            {r.dose}g · {r.water + (r.bypass || 0)}g · {r.temp}° · grind {r.grind} · {brewer.short}
          </div>
          <button
            className="btn"
            onClick={commitRecipe}
            disabled={!recipeName.trim()}
            style={{
              width: "100%", background: "var(--ink)", color: "var(--bg)",
              height: 52, borderRadius: 13, opacity: recipeName.trim() ? 1 : 0.45,
            }}
          >
            Save recipe
          </button>
        </div>
      </Sheet>
    </div>
  );
}

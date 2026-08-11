"use client";
import type { Config, Recipe } from "@/lib/types";
import { recipeRatio } from "@/lib/domain";
import { Icon, Stepper } from "@/components/ui";

/** Just the fields this card edits. `ratio` is deliberately absent — it is
 *  derived, never typed in, and the edit sheet's draft doesn't carry one. */
export type RecipeDraft = Pick<Recipe, "dose" | "water" | "bypass" | "temp" | "grind">;

interface RecipeFieldsProps {
  recipe: RecipeDraft;
  /** Partial patch of the working recipe — the caller owns the state. */
  onChange: (patch: Partial<RecipeDraft>) => void;
  config: Config;
  /** Show the post-brew "After" (bypass) stepper and relabel Water → Brew. */
  showBypass?: boolean;
  /** Tighter rows for the log flow, where the whole step must fit one screen. */
  dense?: boolean;
}

/**
 * The recipe stepper card — grind, dose, water, temp, bypass — shared by the
 * log flow (StepHow) and the edit sheet (BrewDetail) so the two can't drift.
 * They previously disagreed on the dose step (0.5 vs 0.1) and the water unit
 * (g vs mL) purely because each hand-rolled its own copy.
 */
export function RecipeFields({ recipe: r, onChange, config, showBypass, dense }: RecipeFieldsProps) {
  const total = r.water + (r.bypass || 0);
  const ratio = recipeRatio(r);
  const g = config.grinder;

  return (
    <div className="card" style={{ padding: "2px 16px" }}>
      <Stepper
        dense={dense}
        icon="grind"
        label={`Grind · ${g.name}`}
        value={r.grind}
        unit={g.unit}
        step={g.grind_step ?? 1}
        min={g.grind_min ?? 0}
        max={g.grind_max ?? 50}
        format={(v) => (g.grind_step ?? 1) < 1 ? v.toFixed(1) : String(v)}
        onChange={(v) => onChange({ grind: v })}
      />

      <div style={{ height: 1, background: "var(--line)" }} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
        <Stepper dense={dense} icon="scale" label="Dose" value={r.dose} unit="g"
          step={0.1} min={5} max={40}
          format={(v) => v.toFixed(1)}
          onChange={(v) => onChange({ dose: v })} />
        <Stepper dense={dense} icon="drop" label={showBypass ? "Brew" : "Water"} value={r.water} unit="g"
          step={1} min={50} max={600}
          onChange={(v) => onChange({ water: v })} />
        <Stepper dense={dense} icon="thermo" label="Temp" value={r.temp} unit="°C"
          step={1} min={80} max={100}
          onChange={(v) => onChange({ temp: v })} />
        {showBypass && (
          <Stepper dense={dense} icon="snow" label="After" value={r.bypass || 0} unit="g"
            step={1} min={0} max={400}
            onChange={(v) => onChange({ bypass: v })} />
        )}
      </div>

      <div className="mono" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 7, color: "var(--ink-faint)", fontSize: 12, marginTop: 4, paddingTop: 8, paddingBottom: 8, borderTop: "1px solid var(--line)" }}>
        {showBypass
          ? <span>{r.water}g brew + {r.bypass || 0}g after · {total}g · 1:{ratio.toFixed(1)}</span>
          : <span>{r.dose}g in <Icon name="chev" size={11} stroke={2} /> {total}g out · 1:{ratio.toFixed(1)}</span>}
      </div>
    </div>
  );
}

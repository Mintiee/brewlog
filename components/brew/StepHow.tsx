"use client";
import { useState } from "react";
import type { Coffee, Brew, Brewer, Config, Recipe } from "@/lib/types";
import { defaultsFor } from "@/lib/domain";
import { Icon, Stepper } from "@/components/ui";
import { Sheet } from "@/components/ui/Sheet";
import { CoffeePin } from "./CoffeePin";

interface StepHowProps {
  coffee: Coffee;
  brews: Brew[];
  config: Config;
  /** Show the "Split with {name}" toggle — only truthy when another household member exists. */
  canSplit?: boolean;
  /** Display name of the partner to split with (e.g. "Kris"). */
  splitPartnerName?: string;
  onChangeCoffee: () => void;
  onLog: (brewer: Brewer, recipe: Recipe, split: boolean) => void;
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

// Minimal inline toggle switch (yes/no only — no shared primitive exists).
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      style={{
        width: 44, height: 26, borderRadius: 13, flexShrink: 0,
        background: on ? "var(--accent)" : "var(--surface-3)",
        border: `1px solid ${on ? "var(--accent)" : "var(--line)"}`,
        cursor: "pointer", padding: 0, position: "relative",
        transition: "background .18s ease, border-color .18s ease",
      }}
    >
      <span style={{
        position: "absolute", top: 3, left: on ? 21 : 3,
        width: 18, height: 18, borderRadius: "50%",
        background: on ? "#1a0f06" : "var(--ink-faint)",
        transition: "left .18s ease, background .18s ease",
      }} />
    </button>
  );
}

export function StepHow({ coffee, brews, config, canSplit, splitPartnerName, onChangeCoffee, onLog }: StepHowProps) {
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
  const lastForCoffee = brews
    .filter((x) => x.coffee_id === coffee.id)
    .sort((a, c) => Number(c.started_at) - Number(a.started_at))[0] || null;
  const initialBrewer = (lastForCoffee && config.brewers.find((b) => b.id === lastForCoffee.brewer_id)) || config.brewers[0];

  const [brewer, setBrewer] = useState<Brewer>(initialBrewer);
  const [r, setR] = useState<Recipe>(() =>
    lastForCoffee ? recipeFromBrew(lastForCoffee) : fallbackRecipe(initialBrewer)
  );
  // Default split ON when the brewer is OXO (makes enough for two) and a partner exists.
  const [split, setSplit] = useState(() => !!canSplit && brewerIcon(initialBrewer) === "dripperOxo");
  const [waterPickerOpen, setWaterPickerOpen] = useState(false);

  function selectBrewer(b: Brewer) {
    setBrewer(b);
    if (canSplit) setSplit(brewerIcon(b) === "dripperOxo");
    const last = lastBrewOn(b.id);
    setR(last ? recipeFromBrew(last) : fallbackRecipe(b));
  }

  const total = r.water + (r.bypass || 0);
  const ratio = total / r.dose;
  const setDose = (v: number) => setR((s) => ({ ...s, dose: v }));
  const setWater = (v: number) => setR((s) => ({ ...s, water: v }));
  const setBypass = (v: number) => setR((s) => ({ ...s, bypass: v }));
  const setTemp = (v: number) => setR((s) => ({ ...s, temp: v }));
  const setGrind = (v: number) => setR((s) => ({ ...s, grind: v }));

  return (
    <div className="screen-pad">
      <div className="rise rise-1"><CoffeePin coffee={coffee} brews={brews} onChange={onChangeCoffee} /></div>

      {/* brewer tiles */}
      <div className="rise rise-2" style={{ display: "flex", gap: 9, marginTop: 14 }}>
        {config.brewers.map((b) => {
          const on = b.id === brewer.id;
          return (
            <button key={b.id} onClick={() => selectBrewer(b)} style={{
              flex: 1, padding: "12px 8px 10px", borderRadius: 16, cursor: "pointer",
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

      {/* recipe — grind-led, now as an inline Stepper matching Dose/Water/Temp */}
      <div className="card rise rise-3" style={{ marginTop: 12, padding: "2px 16px" }}>
        <Stepper
          icon="grind"
          label={`Grind · ${config.grinder.name}`}
          value={r.grind}
          unit={config.grinder.unit}
          step={config.grinder.grind_step ?? 1}
          min={config.grinder.grind_min ?? 0}
          max={config.grinder.grind_max ?? 50}
          format={(v) => (config.grinder.grind_step ?? 1) < 1 ? v.toFixed(1) : String(v)}
          onChange={setGrind}
        />

        <div style={{ height: 1, background: "var(--line)" }} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
          <Stepper icon="scale"  label="Dose"  value={r.dose}   unit="g"   step={0.5} min={8}  max={40}  onChange={setDose} />
          <Stepper icon="drop"   label={brewer.bypass ? "Brew" : "Water"} value={r.water} unit="g" step={1} min={50} max={600} onChange={setWater} />
          <Stepper icon="thermo" label="Temp"  value={r.temp}   unit="°C"  step={1}   min={80} max={100} onChange={setTemp} />
          {brewer.bypass && (
            <Stepper icon="snow" label="After" value={r.bypass || 0} unit="g" step={1} min={0} max={400} onChange={setBypass} />
          )}
        </div>

        <div className="mono" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 7, color: "var(--ink-faint)", fontSize: 12, marginTop: 6, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
          {brewer.bypass
            ? <span>{r.water}g brew + {r.bypass || 0}g after · {total}g · 1:{ratio.toFixed(1)}</span>
            : <span>{r.dose}g in <Icon name="chev" size={11} stroke={2} /> {total}g out · 1:{ratio.toFixed(1)}</span>}
        </div>
      </div>

      {/* Water + Split — compact options card */}
      <div className="card rise rise-4" style={{ marginTop: 12, padding: "2px 16px" }}>
        {/* Water — tap row opens the picker sheet */}
        <button
          onClick={() => setWaterPickerOpen(true)}
          style={{
            display: "flex", alignItems: "center", gap: 12, width: "100%",
            padding: "14px 0", background: "none", border: "none",
            cursor: "pointer", color: "var(--ink)", textAlign: "left",
          }}
        >
          <span className="label" style={{ flex: 1 }}>Water</span>
          <span style={{ fontSize: 15, fontWeight: 600 }}>{r.water_type || "—"}</span>
          <Icon name="chev" size={16} stroke={1.8} style={{ color: "var(--ink-faint)" }} />
        </button>

        {canSplit && (
          <>
            <div style={{ height: 1, background: "var(--line)" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 0" }}>
              <span className="label" style={{ flex: 1 }}>Split with {splitPartnerName ?? "partner"}</span>
              <Toggle on={split} onChange={setSplit} />
            </div>
          </>
        )}
      </div>

      <div className="rise rise-5" style={{ marginTop: 14 }}>
        <button className="btn btn-accent" onClick={() => onLog(brewer, r, split)}>
          <Icon name="check" size={19} stroke={2} /> Log coffee
        </button>
      </div>
      <div className="screen-bottom" />

      {/* Water picker sheet */}
      <Sheet open={waterPickerOpen} onClose={() => setWaterPickerOpen(false)}>
        <div className="screen-pad" style={{ paddingTop: 6, paddingBottom: 8 }}>
          <div className="label" style={{ marginBottom: 6 }}>Water</div>
          {config.waters.map((w) => (
            <button
              key={w}
              onClick={() => { setR((s) => ({ ...s, water_type: w })); setWaterPickerOpen(false); }}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                width: "100%", padding: "14px 2px", background: "none", border: "none",
                borderBottom: "1px solid var(--line)", cursor: "pointer",
                color: "var(--ink)", fontSize: 16, fontWeight: 600, fontFamily: "var(--font-ui)",
              }}
            >
              {w}
              {r.water_type === w && <Icon name="check" size={18} stroke={2} style={{ color: "var(--accent)" }} />}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

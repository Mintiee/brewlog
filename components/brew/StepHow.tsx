"use client";
import { useState } from "react";
import type { Coffee, Brew, Brewer, Config, Recipe } from "@/lib/types";
import { defaultsFor } from "@/lib/domain";
import { Icon, Stepper, OriginTile } from "@/components/ui";
import { CoffeePin } from "./CoffeePin";

interface StepHowProps {
  coffee: Coffee;
  brews: Brew[];
  config: Config;
  onChangeCoffee: () => void;
  onLog: (brewer: Brewer, recipe: Recipe) => void;
}

export function StepHow({ coffee, brews, config, onChangeCoffee, onLog }: StepHowProps) {
  const [brewer, setBrewer] = useState<Brewer>(config.brewers[0]);
  const [r, setR] = useState<Recipe>(() => defaultsFor(coffee, config.brewers[0]));

  function selectBrewer(b: Brewer) {
    setBrewer(b);
    const last = brews
      .filter((x) => x.coffee_id === coffee.id && !x.pending && x.brewer_id === b.id)
      .sort((a, c) => Number(c.started_at) - Number(a.started_at))[0] || null;
    if (last) {
      setR({ dose: last.dose, ratio: last.ratio, water: last.water, bypass: last.bypass || 0, temp: last.temp, grind: last.grind, water_type: last.water_type });
    } else {
      setR(defaultsFor(coffee, b));
    }
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

      <h2 className="h-ask rise rise-2" style={{ fontSize: 24, marginTop: 22 }}>How are you brewing?</h2>

      {/* brewer tiles */}
      <div className="rise rise-2" style={{ display: "flex", gap: 9, marginTop: 16 }}>
        {config.brewers.map((b) => {
          const on = b.id === brewer.id;
          return (
            <button key={b.id} onClick={() => selectBrewer(b)} style={{
              flex: 1, padding: "16px 8px 13px", borderRadius: 16, cursor: "pointer",
              background: on ? "var(--ink)" : "var(--surface)",
              color: on ? "var(--bg)" : "var(--ink-dim)",
              border: `1px solid ${on ? "var(--ink)" : "var(--line)"}`,
              transition: "all .15s ease", display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
            }}>
              <Icon name="brew" size={26} stroke={1.5} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{b.short}</span>
            </button>
          );
        })}
      </div>

      {/* recipe — grind-led */}
      <div className="card rise rise-3" style={{ marginTop: 16, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <div className="label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="grind" size={13} stroke={1.8} /> Grind · {config.grinder.name}
            </div>
            <div className="num" style={{ fontSize: 48, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1, marginTop: 5 }}>
              <span key={r.grind} className="popv">
                {(config.grinder.grind_step ?? 1) < 1 ? r.grind.toFixed(1) : r.grind}
              </span>
              <span style={{ fontSize: 15, color: "var(--ink-faint)", marginLeft: 5, fontWeight: 500 }}>{config.grinder.unit}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => setGrind(+Math.max(config.grinder.grind_min ?? 0, r.grind - (config.grinder.grind_step ?? 1)).toFixed(2))}
              style={{ width: 46, height: 46, borderRadius: "50%", background: "var(--surface-3)", border: "1px solid var(--line)", color: "var(--ink)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            ><Icon name="minus" size={20} stroke={2} /></button>
            <button
              onClick={() => setGrind(+Math.min(config.grinder.grind_max ?? 50, r.grind + (config.grinder.grind_step ?? 1)).toFixed(2))}
              style={{ width: 46, height: 46, borderRadius: "50%", background: "var(--accent)", border: "none", color: "#1a0f06", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            ><Icon name="plus" size={20} stroke={2.2} /></button>
          </div>
        </div>

        <div style={{ height: 1, background: "var(--line)", margin: "16px 0 0" }} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
          <Stepper icon="scale"  label="Dose"  value={r.dose}   unit="g"   step={0.5} min={8}  max={40}  onChange={setDose} />
          <Stepper icon="drop"   label={brewer.bypass ? "Brew" : "Water"} value={r.water} unit="g" step={5} min={50} max={600} onChange={setWater} />
          <Stepper icon="thermo" label="Temp"  value={r.temp}   unit="°C"  step={1}   min={80} max={100} onChange={setTemp} />
          {brewer.bypass && (
            <Stepper icon="snow" label="After" value={r.bypass || 0} unit="g" step={5} min={0} max={400} onChange={setBypass} />
          )}
        </div>

        <div className="mono" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 7, color: "var(--ink-faint)", fontSize: 12, marginTop: 6, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
          {brewer.bypass
            ? <span>{r.water}g brew + {r.bypass || 0}g after · {total}g · 1:{ratio.toFixed(1)}</span>
            : <span>{r.dose}g in <Icon name="chev" size={11} stroke={2} /> {total}g out · 1:{ratio.toFixed(1)}</span>}
        </div>
      </div>

      {/* water type */}
      <div className="rise rise-4" style={{ marginTop: 16 }}>
        <div className="label" style={{ marginBottom: 9 }}>Water</div>
        <div style={{ display: "flex", gap: 8 }}>
          {config.waters.map((w) => (
            <button key={w} className="chip" data-on={r.water_type === w} onClick={() => setR((s) => ({ ...s, water_type: w }))} style={{ flex: 1, textAlign: "center" }}>{w}</button>
          ))}
        </div>
      </div>

      <div className="rise rise-5" style={{ marginTop: 22 }}>
        <button className="btn btn-accent" onClick={() => onLog(brewer, r)}>
          <Icon name="check" size={19} stroke={2} /> Log coffee
        </button>
      </div>
      <div className="screen-bottom" />
    </div>
  );
}

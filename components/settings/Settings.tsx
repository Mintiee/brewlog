"use client";
import { useState } from "react";
import { Icon, IconButton, Stepper } from "@/components/ui";
import { SSection, SText, SRow, SToggle } from "./controls";
import { AddBrewerSheet } from "./AddBrewerSheet";
import { RoasterRestSheet } from "./RoasterRestSheet";
import { ImportSheet } from "@/components/import/ImportSheet";
import { detectProvider } from "@/lib/llm/detect";
import type { Coffee, Config, Profile, SavedRecipe } from "@/lib/types";

interface SettingsProps {
  config: Config;
  onConfig: (c: Config) => void;
  onClose: () => void;
  profile: Profile;
  /** The shelf — only used to offer its roasters as per-roaster rest windows. */
  coffees: Coffee[];
  recipes: SavedRecipe[];
  onUpdateRecipe: (r: SavedRecipe) => void;
  onDeleteRecipe: (id: string) => void;
  llmEnabled: boolean;
  onSetAiKey: (key: string, provider: string) => Promise<string>;
  onRemoveAiKey: () => Promise<void>;
}

export function Settings({
  config,
  onConfig,
  onClose,
  profile,
  coffees,
  recipes,
  onUpdateRecipe,
  onDeleteRecipe,
  llmEnabled,
  onSetAiKey,
  onRemoveAiKey,
}: SettingsProps) {
  const upd = (patch: Partial<Config>) => onConfig({ ...config, ...patch });
  const updBrewer = (i: number, patch: object) =>
    onConfig({ ...config, brewers: config.brewers.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const removeBrewer = (i: number) =>
    config.brewers.length > 1 &&
    onConfig({ ...config, brewers: config.brewers.filter((_, j) => j !== i) });
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);

  const [newWater, setNewWater] = useState("");
  const [aiKey, setAiKey] = useState("");
  const [aiSaving, setAiSaving] = useState(false);

  // Per-roaster rest windows are edited in RoasterRestSheet; this screen only shows
  // how many are set and opens it.
  const [editingRoasters, setEditingRoasters] = useState(false);
  const overrideCount = Object.keys(config.roaster_rest).length;

  return (
    <div className="screen">
      <div className="screen-pad" style={{ paddingTop: 8 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div className="label">your setup</div>
            <h1 className="h-ask" style={{ fontSize: 30, marginTop: 3, marginBottom: 20 }}>Settings</h1>
          </div>
          <IconButton icon="close" label="Done" onClick={onClose} size={38} />
        </div>

        {/* ACCOUNT */}
        <SSection label="Account">
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <span
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: "var(--accent)",
                  color: "#1a0f06",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontFamily: "var(--font-mono)",
                  flexShrink: 0,
                }}
              >
                {(profile.name || "Y")[0].toUpperCase()}
              </span>
              <div style={{ flex: 1 }}>
                <div className="label" style={{ marginBottom: 4 }}>Signed in as</div>
                {/* Renaming and multi-account switching aren't implemented yet
                    (full auth is planned) — show the name read-only rather than
                    an input that silently discards edits. */}
                <div style={{ fontSize: 15, fontWeight: 600 }}>{profile.name || "You"}</div>
              </div>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 8, lineHeight: 1.5 }}>
            You and your household share one shelf and brew log — each rates and logs as themselves.
          </div>
        </SSection>

        {/* GRINDER */}
        <SSection label="Grinder">
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 2 }}>
              <SText
                value={config.grinder.name}
                onChange={(v) => upd({ grinder: { ...config.grinder, name: v } })}
                placeholder="Grinder"
              />
            </div>
            <div style={{ flex: 1 }}>
              <SText
                value={config.grinder.unit}
                onChange={(v) => upd({ grinder: { ...config.grinder, unit: v } })}
                placeholder="unit"
              />
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 7 }}>
            Unit shows on every grind readout (e.g. clicks, numbers, µm).
          </div>
          <div className="card" style={{ padding: "2px 16px", marginTop: 12 }}>
            <Stepper icon="minus" label="Min" value={config.grinder.grind_min ?? 0} unit={config.grinder.unit}
              step={config.grinder.grind_step ?? 1} min={0} max={config.grinder.grind_max ?? 50}
              format={(v) => (config.grinder.grind_step ?? 1) < 1 ? v.toFixed(1) : String(v)}
              onChange={(v) => upd({ grinder: { ...config.grinder, grind_min: v } })} />
            <div style={{ height: 1, background: "var(--line)" }} />
            <Stepper icon="plus" label="Max" value={config.grinder.grind_max ?? 50} unit={config.grinder.unit}
              step={config.grinder.grind_step ?? 1} min={config.grinder.grind_min ?? 0} max={999}
              format={(v) => (config.grinder.grind_step ?? 1) < 1 ? v.toFixed(1) : String(v)}
              onChange={(v) => upd({ grinder: { ...config.grinder, grind_max: v } })} />
            <div style={{ height: 1, background: "var(--line)" }} />
            <Stepper icon="grind" label="Increment" value={config.grinder.grind_step ?? 1} unit=""
              step={0.1} min={0.1} max={10}
              format={(v) => v % 1 === 0 ? String(v) : v.toFixed(1)}
              onChange={(v) => upd({ grinder: { ...config.grinder, grind_step: +v.toFixed(2) } })} />
          </div>
          <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 7 }}>
            The dial range &amp; step for your grinder — e.g. a ZP6 is 0.0–10.0 in steps of 0.1.
          </div>
        </SSection>

        {/* BREWERS */}
        <SSection label="Brewers">
          {config.brewers.map((b, i) => (
            <div key={b.id || i} className="card" style={{ padding: "12px 16px 4px", marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 4 }}>
                <div style={{ flex: 2 }}>
                  <SText value={b.name} onChange={(v) => updBrewer(i, { name: v })} placeholder="Name" />
                </div>
                <div style={{ flex: 1 }}>
                  <SText value={b.short} onChange={(v) => updBrewer(i, { short: v })} placeholder="Short" />
                </div>
                <button
                  onClick={() => removeBrewer(i)}
                  aria-label={`Remove ${b.name || "brewer"}`}
                  style={{ background: "none", border: "none", color: "var(--ink-faint)", cursor: "pointer", display: "flex", flexShrink: 0, padding: 13, margin: -13 }}
                >
                  <Icon name="close" size={18} stroke={1.9} />
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0 10px", borderTop: "1px solid var(--line)", marginTop: 4 }}>
                <span style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ink-dim)" }}>Add water after brewing (bypass)</span>
                <SToggle on={!!b.bypass} onChange={(v) => updBrewer(i, { bypass: v })} />
              </div>
            </div>
          ))}
          <button className="btn btn-soft" onClick={() => setAdding(true)}>
            <Icon name="plus" size={18} stroke={2} /> Add a brewer
          </button>
          <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 7, lineHeight: 1.5 }}>
            Each brew remembers its own recipe. The starting recipe below is only used the
            first time you brew on a new brewer — after that, your last brew carries over.
          </div>

          <AddBrewerSheet
            open={adding}
            grinder={config.grinder}
            onClose={() => setAdding(false)}
            onAdd={(b) => onConfig({ ...config, brewers: [...config.brewers, b] })}
          />
        </SSection>

        {/* RECIPES */}
        <SSection label="Recipes">
          {recipes.length === 0 ? (
            <div style={{ fontSize: 11.5, color: "var(--ink-faint)", lineHeight: 1.5 }}>
              No saved recipes yet — save one from the brew screen.
            </div>
          ) : (
            recipes.map((rec) => (
              <div key={rec.id} className="card" style={{ padding: "12px 16px", marginBottom: 10 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ flex: 1 }}>
                    <SText
                      value={rec.name}
                      onChange={(v) => onUpdateRecipe({ ...rec, name: v })}
                      placeholder="Recipe name"
                    />
                  </div>
                  <button
                    onClick={() => onDeleteRecipe(rec.id)}
                    aria-label={`Delete ${rec.name || "recipe"}`}
                    style={{ background: "none", border: "none", color: "var(--ink-faint)", cursor: "pointer", display: "flex", flexShrink: 0, padding: 13, margin: -13 }}
                  >
                    <Icon name="close" size={18} stroke={1.9} />
                  </button>
                </div>
                <div className="mono" style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 8 }}>
                  {rec.dose}g · {rec.water + (rec.bypass || 0)}mL · {rec.temp}° · grind {rec.grind}
                </div>
              </div>
            ))
          )}
          <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 7, lineHeight: 1.5 }}>
            Saved recipes appear as chips on the brew screen — tap one to load it.
          </div>
        </SSection>

        {/* FRESHNESS */}
        <SSection label="Freshness">
          <div className="card" style={{ padding: "2px 16px" }}>
            <Stepper icon="timer" label="Ready from" value={config.rest_days} unit="days"
              step={1} min={1} max={config.peak_days - 1}
              onChange={(v) => upd({ rest_days: Math.round(v) })} />
            <div style={{ height: 1, background: "var(--line)" }} />
            <Stepper icon="timer" label="Best until" value={config.peak_days} unit="days"
              step={1} min={config.rest_days + 1} max={365}
              onChange={(v) => upd({ peak_days: Math.round(v) })} />
            <div style={{ height: 1, background: "var(--line)" }} />
            <Stepper icon="scale" label="Serving size" value={config.serving_grams} unit="g per cup"
              step={0.5} min={5} max={30}
              format={(v) => (v % 1 === 0 ? String(v) : v.toFixed(1))}
              onChange={(v) => upd({ serving_grams: +v.toFixed(1) })} />
          </div>
          <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 7, lineHeight: 1.5 }}>
            &ldquo;Ready from&rdquo; is when a coffee finishes resting; &ldquo;Best until&rdquo; is when the
            drink window closes. Used for any roaster without its own window.
          </div>

          {/* Per-roaster overrides live in their own sheet — a list of always-open
              stepper cards here swamped the section at more than a couple of roasters. */}
          <button
            onClick={() => setEditingRoasters(true)}
            className="card"
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "14px 16px",
              marginTop: 10, border: "1px solid var(--line)", cursor: "pointer",
              color: "inherit", textAlign: "left", font: "inherit",
            }}
          >
            <span style={{ flex: 1, fontSize: 15, fontWeight: 500 }}>By roaster</span>
            <span style={{ fontSize: 12.5, color: overrideCount ? "var(--accent)" : "var(--ink-faint)", fontWeight: 600 }}>
              {overrideCount ? `${overrideCount} set` : "none set"}
            </span>
            <span style={{ display: "flex", color: "var(--ink-faint)" }}>
              <Icon name="chev" size={16} stroke={1.8} />
            </span>
          </button>
        </SSection>

        {/* WATER */}
        <SSection label="Water">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            {config.waters.map((w) => {
              const isDef = w === config.default_water;
              return (
                <span
                  key={w}
                  className="chip"
                  data-on={isDef}
                  onClick={() => upd({ default_water: w })}
                  style={{ display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer" }}
                >
                  {w}
                  {isDef && <span className="label" style={{ fontSize: 8, color: "inherit", opacity: 0.7 }}>default</span>}
                  <button
                    type="button"
                    aria-label={`Remove ${w}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      const nw = config.waters.filter((x) => x !== w);
                      upd({ waters: nw, default_water: isDef ? (nw[0] || "") : config.default_water });
                    }}
                    style={{ display: "flex", alignItems: "center", background: "none", border: "none", padding: 2, margin: -2, cursor: "pointer", color: "inherit", opacity: 0.6 }}
                  >
                    <Icon name="close" size={13} stroke={2} />
                  </button>
                </span>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 9 }}>
            <div style={{ flex: 1 }}>
              <SText value={newWater} onChange={setNewWater} placeholder="Add a water…" />
            </div>
            <button
              className="btn"
              onClick={() => {
                const v = newWater.trim();
                if (v && !config.waters.includes(v)) {
                  upd({ waters: [...config.waters, v] });
                  setNewWater("");
                }
              }}
              style={{ background: "var(--ink)", color: "var(--bg)", width: 52, height: 52, borderRadius: 13, flexShrink: 0 }}
            >
              <Icon name="plus" size={20} stroke={2} />
            </button>
          </div>
          <div style={{ marginTop: 8 }}>
            <span className="label">Tap a water to make it the default</span>
          </div>
        </SSection>

        {/* RITUAL */}
        <SSection label="Ritual">
          <div className="card" style={{ padding: "4px 16px 14px" }}>
            <SRow label="Surprise me with greetings">
              <SToggle on={config.random_greeting !== false} onChange={(v) => upd({ random_greeting: v })} />
            </SRow>
            <div style={{ height: 1, background: "var(--line)" }} />
            <div style={{ padding: "12px 0" }}>
              <div className="label" style={{ marginBottom: 7 }}>Second taster&apos;s name</div>
              <SText value={config.taster2} onChange={(v) => upd({ taster2: v })} placeholder="e.g. Kris" />
              <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 7 }}>
                Shown when you add a second rating to a brew.
              </div>
            </div>
          </div>
        </SSection>

        {/* INTELLIGENCE */}
        <SSection label="Intelligence">
          <div className="card" style={{ padding: "12px 16px" }}>
            {llmEnabled ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Icon name="spark" size={16} stroke={1.7} style={{ color: "var(--accent)" }} />
                  <span style={{ fontSize: 14.5, fontWeight: 500 }}>Key set ✓ (OpenAI)</span>
                </div>
                <button
                  className="btn btn-ghost"
                  onClick={onRemoveAiKey}
                  style={{ fontSize: 13, padding: "6px 14px", height: "auto" }}
                >
                  Remove key
                </button>
              </div>
            ) : (
              <div>
                <SText
                  value={aiKey}
                  onChange={setAiKey}
                  placeholder="sk-… paste your API key"
                  type="password"
                />
                <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 7, marginBottom: 12, lineHeight: 1.5 }}>
                  Provider detected automatically from your key prefix.
                </div>
                <button
                  className="btn btn-accent"
                  disabled={!aiKey.trim() || aiSaving}
                  onClick={async () => {
                    const k = aiKey.trim();
                    if (!k) return;
                    setAiSaving(true);
                    await onSetAiKey(k, detectProvider(k));
                    setAiKey("");
                    setAiSaving(false);
                  }}
                >
                  <Icon name="key" size={18} stroke={1.7} />
                  {aiSaving ? "Saving…" : "Save key"}
                </button>
              </div>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 8, lineHeight: 1.5 }}>
            Powers bag &amp; link scanning, the Palate insight, and note categorisation. Encrypted and shared across your household.
          </div>
        </SSection>

        {/* IMPORT */}
        <SSection label="Import">
          <div className="card" style={{ padding: "12px 16px" }}>
            <div style={{ fontSize: 14.5, fontWeight: 500, marginBottom: 6 }}>Import your coffee shelf</div>
            <div style={{ fontSize: 13, color: "var(--ink-dim)", lineHeight: 1.5, marginBottom: 14 }}>
              Bring in coffees from Bean Conqueror (.json export), a CSV file, or paste a list for the AI to structure.
            </div>
            <button
              className="btn btn-accent"
              onClick={() => setImporting(true)}
              style={{ width: "100%", height: 50 }}
            >
              <Icon name="upload" size={18} stroke={1.8} /> Import coffees
            </button>
          </div>
        </SSection>

        <div className="screen-bottom" />
      </div>

      <RoasterRestSheet
        open={editingRoasters}
        coffees={coffees}
        restDays={config.rest_days}
        peakDays={config.peak_days}
        windows={config.roaster_rest}
        onChange={(roaster_rest) => upd({ roaster_rest })}
        onClose={() => setEditingRoasters(false)}
      />
      <ImportSheet open={importing} onClose={() => setImporting(false)} />
    </div>
  );
}

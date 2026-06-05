"use client";
import { useState } from "react";
import type { Coffee, Brew, Brewer, Recipe, Config, Profile } from "@/lib/types";
import { Icon, Stars, Scale5 } from "@/components/ui";
import { CoffeePin } from "./CoffeePin";

interface StepRateProps {
  coffee: Coffee;
  brewer: Brewer;
  recipe: Recipe;
  brew: Brew;
  profile: Profile;
  config: Config;
  onSave: (rating: object) => void;
  onDiscard?: () => void;
}

export function StepRate({ coffee, brewer, recipe, brew, profile, config, onSave, onDiscard }: StepRateProps) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const meName = profile.name || "You";
  const [stars, setStars] = useState(0);
  const [acidity, setAcidity] = useState(0);
  const [sweetness, setSweetness] = useState(0);
  const [body, setBody] = useState(0);
  const [clarity, setClarity] = useState(0);
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [stars2, setStars2] = useState(0);
  const [secondOpen, setSecondOpen] = useState(false);
  const [taster2, setTaster2] = useState(config.taster2 || "Kris");

  // brew is accepted as prop (may be used by parent/future callers)
  void brew;

  return (
    <div className="screen-pad" style={{ paddingTop: 6 }}>
      <CoffeePin coffee={coffee} brews={[]} onChange={() => {}} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, color: "var(--ink-dim)", fontSize: 13 }}>
        <span className="mono">{brewer.short} · <span style={{ color: "var(--ink)", fontWeight: 600 }}>{recipe.grind}{config.grinder.unit[0]}</span> · {recipe.temp}°C</span>
        <span className="mono">{recipe.water + (recipe.bypass || 0)}g · 1:{((recipe.water + (recipe.bypass || 0)) / recipe.dose).toFixed(1)}</span>
      </div>

      <h2 className="h-ask" style={{ fontSize: 22, marginTop: 16, marginBottom: 12 }}>How was it?</h2>

      {/* ratings */}
      <div className="card" style={{ padding: "8px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 0" }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>{meName}</span>
          <Stars value={stars} onChange={setStars} size={34} gap={10} />
        </div>
        {secondOpen && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: "1px solid var(--line)" }}>
            <input value={taster2} onChange={(e) => setTaster2(e.target.value)} style={{ background: "none", border: "none", outline: "none", color: "var(--ink)", fontFamily: "var(--font-ui)", fontSize: 15, fontWeight: 600, width: 84, minWidth: 0, padding: 0 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Stars value={stars2} onChange={setStars2} size={28} gap={6} />
              <button onClick={() => { setSecondOpen(false); setStars2(0); }} style={{ background: "none", border: "none", color: "var(--ink-faint)", cursor: "pointer", display: "flex" }}><Icon name="close" size={15} stroke={2} /></button>
            </div>
          </div>
        )}
      </div>
      {!secondOpen && (
        <button className="btn btn-ghost" onClick={() => setSecondOpen(true)} style={{ marginTop: 8, height: 40, justifyContent: "flex-start", paddingLeft: 4, whiteSpace: "nowrap", color: "var(--ink-faint)" }}>
          <Icon name="plus" size={16} stroke={2} /> Add another taster
        </button>
      )}

      <div className="card" style={{ padding: "2px 16px", marginTop: 10 }}>
        <Scale5 label="Acidity"   value={acidity}   onChange={setAcidity}   lowTag="Flat"   highTag="Bright" />
        <div style={{ height: 1, background: "var(--line)" }} />
        <Scale5 label="Sweetness" value={sweetness} onChange={setSweetness} lowTag="Dry"    highTag="Syrupy" />
        <div style={{ height: 1, background: "var(--line)" }} />
        <Scale5 label="Body"      value={body}      onChange={setBody}      lowTag="Light"  highTag="Heavy" />
        <div style={{ height: 1, background: "var(--line)" }} />
        <Scale5 label="Clarity"   value={clarity}   onChange={setClarity}   lowTag="Muddy"  highTag="Clean" />
      </div>

      {noteOpen ? (
        <textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tasting note…" style={{
          width: "100%", marginTop: 14, minHeight: 70, resize: "none", padding: 14, borderRadius: 16,
          background: "var(--surface)", border: "1px solid var(--line)", color: "var(--ink)",
          fontFamily: "var(--font-ui)", fontSize: 15, outline: "none",
        }} />
      ) : (
        <button className="btn btn-ghost" style={{ marginTop: 8, height: 40, justifyContent: "flex-start", paddingLeft: 4 }} onClick={() => setNoteOpen(true)}>
          <Icon name="edit" size={17} stroke={1.7} /> Add a tasting note
        </button>
      )}

      <button className="btn btn-accent" disabled={!stars}
        onClick={() => onSave({ stars, acidity, sweetness, body, clarity, note, taster1: meName, logged_by: profile.id, stars2: secondOpen && stars2 ? stars2 : null, taster2: secondOpen && stars2 ? taster2 : null })}
        style={{ marginTop: 12, opacity: stars ? 1 : 0.4 }}>
        <Icon name="check" size={20} stroke={2} /> Save rating
      </button>

      {onDiscard && (
        confirmDiscard ? (
          <div style={{ marginTop: 14, padding: 14, borderRadius: 16, background: "var(--surface)", border: "1px solid var(--line)", textAlign: "center" }}>
            <div style={{ fontSize: 13.5, color: "var(--ink-dim)", lineHeight: 1.5 }}>Remove this cup from your log without rating it?</div>
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button className="btn btn-soft" style={{ flex: 1, height: 42 }} onClick={() => setConfirmDiscard(false)}>Keep it</button>
              <button className="btn" style={{ flex: 1, height: 42, background: "transparent", border: "1px solid var(--bad, #b65f4f)", color: "var(--bad, #c9755f)" }} onClick={onDiscard}>Discard</button>
            </div>
          </div>
        ) : (
          <button className="btn btn-ghost" style={{ marginTop: 6, height: 42, justifyContent: "center", color: "var(--ink-faint)" }} onClick={() => setConfirmDiscard(true)}>
            Don&apos;t rate this one
          </button>
        )
      )}
      <div className="screen-bottom" />
    </div>
  );
}

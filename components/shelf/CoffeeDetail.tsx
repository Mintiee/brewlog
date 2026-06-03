"use client";
import { useState, useEffect } from "react";
import {
  coffeeStatus, freshColor, activeGrams, frozenGramsOf, remainingGrams, cupsLeft, originCode,
} from "@/lib/domain";
import { noteColor, noteIcon } from "@/lib/flavour";
import { Icon } from "@/components/ui/Icon";
import { OriginTile } from "@/components/ui/OriginTile";
import { Sheet } from "@/components/ui/Sheet";
import { Stepper } from "@/components/ui/Stepper";
import { Segmented } from "@/components/ui/Segmented";
import { FreshBar } from "./FreshBar";
import { Field } from "./Field";
import type { Coffee, Brew } from "@/lib/types";

interface EditForm {
  roaster: string;
  name: string;
  origin: string;
  region: string;
  varietal: string;
  process: string;
  notes: string;
  grams: number;
  roastDaysAgo: number;
}

interface CoffeeDetailProps {
  coffee: Coffee | null;
  brews: Brew[];
  onClose: () => void;
  onBrew: (c: Coffee) => void;
  onUpdate: (c: Coffee) => void;
}

export function CoffeeDetail({ coffee, brews, onClose, onBrew, onUpdate }: CoffeeDetailProps) {
  const [freezing, setFreezing] = useState(false);
  const [amt, setAmt] = useState(0);
  const [editing, setEditing] = useState(false);
  const [ef, setEf] = useState<EditForm | null>(null);

  useEffect(() => {
    setFreezing(false);
    setEditing(false);
  }, [coffee?.id]);

  if (!coffee) return null;

  const st = coffeeStatus(coffee, brews);
  const coffeeBrews = brews.filter((b) => b.coffee_id === coffee.id);
  const remaining = remainingGrams(coffee, brews);
  const frozen = frozenGramsOf(coffee, brews);
  const active = activeGrams(coffee, brews);
  const statusLabel = st.state === "peak" ? "In peak" : st.state === "resting" ? "Resting" : st.state === "frozen" ? "Frozen" : "Past peak";

  const toggleFreezer = () => { onUpdate({ ...coffee, frozen_grams: 0 }); onClose(); };
  const setArchived = (v: boolean) => { onUpdate({ ...coffee, archived: v }); onClose(); };
  const startFreeze = () => {
    setAmt(Math.max(10, Math.min(active, Math.round(active / 2 / 10) * 10)));
    setFreezing(true);
  };
  const confirmFreeze = () => { onUpdate({ ...coffee, frozen_grams: frozen + amt }); onClose(); };
  const startEdit = () => {
    setEf({
      roaster: coffee.roaster,
      name: coffee.name,
      origin: coffee.origin,
      region: coffee.region,
      varietal: coffee.varietal,
      process: coffee.process,
      notes: (coffee.notes || []).join(", "),
      grams: coffee.grams || 250,
      roastDaysAgo: st.day,
    });
    setEditing(true);
  };
  const saveEdit = () => {
    if (!ef) return;
    const notes = ef.notes ? ef.notes.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const roastedAt = new Date(today.getTime() - ef.roastDaysAgo * 86400000);
    const roasted_at = roastedAt.toISOString().slice(0, 10);
    onUpdate({
      ...coffee,
      roaster: ef.roaster || "Unknown",
      name: ef.name || "Untitled",
      origin: ef.origin,
      region: ef.region || ef.origin,
      varietal: ef.varietal,
      process: ef.process as Coffee["process"],
      notes,
      grams: Number(ef.grams) || coffee.grams,
      roasted_at,
      cc: originCode(ef.origin),
      color: notes[0] ? noteColor(notes[0]) : coffee.color,
    });
    setEditing(false);
  };
  const setE = (k: keyof EditForm) => (v: string | number) =>
    setEf((f) => f ? { ...f, [k]: v } : f);

  if (editing && ef) {
    return (
      <Sheet open={true} onClose={onClose}>
        <div className="screen-pad" style={{ paddingTop: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <h2 style={{ fontSize: 21, fontWeight: 600, letterSpacing: "-0.01em" }}>Edit details</h2>
            <button onClick={() => setEditing(false)} style={{ background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: "50%", width: 34, height: 34, color: "var(--ink-dim)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="close" size={18} stroke={1.9} />
            </button>
          </div>
          <Field label="Roaster" value={ef.roaster} onChange={setE("roaster")} placeholder="Roaster" />
          <Field label="Coffee" value={ef.name} onChange={setE("name")} placeholder="Name / lot" />
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}><Field label="Origin" value={ef.origin} onChange={setE("origin")} placeholder="Country" /></div>
            <div style={{ flex: 1.3 }}><Field label="Region" value={ef.region} onChange={setE("region")} placeholder="Region" /></div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}><Field label="Varietal" value={ef.varietal} onChange={setE("varietal")} placeholder="Varietal" /></div>
            <div style={{ flex: 1 }}>
              <div className="label" style={{ marginBottom: 6 }}>Process</div>
              <Segmented options={["Washed", "Natural", "Honey"]} value={ef.process} onChange={setE("process")} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px", marginBottom: 4 }}>
            <Stepper icon="timer" label="Roasted" value={Number(ef.roastDaysAgo) || 0} unit="days ago" step={1} min={0} max={200} onChange={setE("roastDaysAgo")} />
            <Stepper icon="scale" label="Bag size" value={Number(ef.grams) || 0} unit="g" step={10} min={50} max={1000} onChange={setE("grams")} />
          </div>
          <Field label="Tasting notes" value={ef.notes} onChange={setE("notes")} placeholder="comma, separated" />
          <button className="btn btn-accent" style={{ marginTop: 8 }} onClick={saveEdit}>
            <Icon name="check" size={20} stroke={2} /> Save changes
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open={!!coffee} onClose={onClose}>
      <div className="screen-pad" style={{ paddingTop: 8 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <OriginTile code={coffee.cc} roaster={coffee.roaster} color={coffee.color} size={56} radius={13} />
          <div style={{ flex: 1 }}>
            <div className="label">{coffee.roaster}</div>
            <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{coffee.name}</div>
            <div style={{ fontSize: 13, color: "var(--ink-dim)", marginTop: 4 }}>{coffee.origin} · {coffee.region}</div>
          </div>
          <button onClick={startEdit} style={{ background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: "50%", width: 36, height: 36, color: "var(--ink-dim)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon name="edit" size={17} stroke={1.7} />
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, marginTop: 20, background: "var(--line)", border: "1px solid var(--line)", borderRadius: 16, overflow: "hidden" }}>
          {([["Varietal", coffee.varietal], ["Process", coffee.process], ["Roasted", `${st.day}d ago`], ["Status", statusLabel]] as [string, string][]).map(([k, v]) => (
            <div key={k} style={{ background: "var(--surface)", padding: "13px 15px" }}>
              <div className="label">{k}</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginTop: 3, color: k === "Status" ? freshColor(st.state) : "var(--ink)" }}>{v}</div>
            </div>
          ))}
        </div>

        <FreshBar coffee={coffee} brews={brews} />

        {/* remaining inventory */}
        <div style={{ marginTop: 18 }}>
          <div className="label" style={{ marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
            <span>Remaining</span><span className="mono">{remaining}g of {coffee.grams || 250}g</span>
          </div>
          <div style={{ display: "flex", height: 8, borderRadius: 5, overflow: "hidden", background: "var(--ink-ghost)" }}>
            <div style={{ width: `${(active / (coffee.grams || 250)) * 100}%`, background: "var(--accent)" }} />
            <div style={{ width: `${(frozen / (coffee.grams || 250)) * 100}%`, background: "var(--frozen)" }} />
          </div>
          <div className="mono" style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", marginTop: 9, fontSize: 12, color: "var(--ink-dim)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span className="dot" style={{ background: "var(--accent)" }} /> {active}g ready · {cupsLeft(active).toFixed(1)} serves
            </span>
            {frozen > 0 && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span className="dot" style={{ background: "var(--frozen)" }} /> {frozen}g frozen
              </span>
            )}
          </div>
        </div>

        <div className="label" style={{ marginTop: 20, marginBottom: 10 }}>Tasting notes</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {coffee.notes.map((n) => {
            const col = noteColor(n);
            return (
              <span key={n} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, padding: "7px 12px", borderRadius: 11, background: `color-mix(in srgb, ${col} 16%, transparent)`, color: col, fontWeight: 600 }}>
                <Icon name={noteIcon(n)} size={14} stroke={1.7} />{n}
              </span>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 20, color: "var(--ink-dim)", fontSize: 13 }}>
          <Icon name="log" size={16} stroke={1.7} /> {coffeeBrews.length} brews logged
        </div>

        {coffee.archived ? (
          <button className="btn btn-accent" style={{ marginTop: 18 }} onClick={() => setArchived(false)}>
            <Icon name="shelf" size={19} stroke={1.7} /> Restore to shelf
          </button>
        ) : freezing ? (
          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="card" style={{ padding: "2px 18px" }}>
              <Stepper icon="snow" label="Into the freezer" value={amt} unit="g" step={10} min={10} max={active} onChange={setAmt} />
            </div>
            <div className="mono" style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: -4 }}>
              {active - amt}g stays out · {cupsLeft(active - amt).toFixed(1)} serves
            </div>
            <button className="btn btn-accent" onClick={confirmFreeze}>
              <Icon name="snow" size={19} stroke={1.8} /> Freeze {amt}g
            </button>
            <button className="btn btn-ghost" onClick={() => setFreezing(false)}>Cancel</button>
          </div>
        ) : (
          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
            {(active > 0 || frozen > 0) && (
              <button className="btn btn-accent" onClick={() => onBrew(coffee)}>
                <Icon name="brew" size={20} stroke={1.7} /> {active > 0 ? "Brew this" : "Brew from freezer"}
              </button>
            )}
            {active > 0 && (
              <button className="btn btn-soft" onClick={startFreeze}>
                <Icon name="snow" size={19} stroke={1.7} /> Freeze some…
              </button>
            )}
            {frozen > 0 && (
              <button className="btn btn-soft" onClick={toggleFreezer}>
                <Icon name="snow" size={19} stroke={1.7} /> Take {frozen}g out of freezer
              </button>
            )}
            <button className="btn btn-ghost" onClick={() => setArchived(true)}>Mark this bag finished</button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

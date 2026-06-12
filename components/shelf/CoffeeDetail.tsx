"use client";
import { useState, useEffect } from "react";
import {
  coffeeStatus, freshColor, activeGrams, frozenGramsOf, remainingGrams, gramsUsed, cupsLeft, originCode, roastDateText,
  todayISO, daysAgoISO,
} from "@/lib/domain";
import { coffeeColor, noteColor, noteIcon } from "@/lib/flavour";
import { useEditForm } from "@/lib/hooks/useEditForm";
import { Icon } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { SheetHeader } from "@/components/ui/SheetHeader";
import { OriginTile } from "@/components/ui/OriginTile";
import { Sheet } from "@/components/ui/Sheet";
import { Stepper } from "@/components/ui/Stepper";
import { ProcessPicker } from "./ProcessPicker";
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
  remaining: number;   // grams left now; stored bag size is back-computed as remaining + used
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
  const [thawing, setThawing] = useState(false);
  const [confirmingFinish, setConfirmingFinish] = useState(false);
  const [amt, setAmt] = useState(0);
  const [thawAmt, setThawAmt] = useState(0);
  const { editing, form: ef, startEdit: beginEdit, cancelEdit, set: setE } = useEditForm<EditForm>();

  useEffect(() => {
    setFreezing(false);
    setThawing(false);
    setConfirmingFinish(false);
    cancelEdit();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset transient sheet state when the coffee changes
  }, [coffee?.id]);

  if (!coffee) return null;

  const st = coffeeStatus(coffee, brews);
  const coffeeBrews = brews.filter((b) => b.coffee_id === coffee.id);
  const remaining = remainingGrams(coffee, brews);
  const frozen = frozenGramsOf(coffee, brews);
  const active = activeGrams(coffee, brews);
  const statusLabel = st.state === "peak" ? "In peak" : st.state === "resting" ? "Resting" : st.state === "frozen" ? "Frozen" : "Past peak";
  const thawFmt = (v: number) => (v % 1 === 0 ? String(v) : v.toFixed(1));

  // Coming out of the freezer. Defaults to all (set when the slider opens); a
  // partial thaw leaves some frozen, so aging stays paused until the last gram is
  // out (then thawed_at resumes aging, matching the single freeze-cycle model).
  const startThaw = () => { setThawAmt(frozen); setThawing(true); };
  const confirmThaw = () => {
    const out = Math.min(Math.max(0, thawAmt), frozen);
    const left = frozen - out;
    if (left <= 0) onUpdate({ ...coffee, frozen_grams: 0, thawed_at: todayISO() });
    else onUpdate({ ...coffee, frozen_grams: left });
    onClose();
  };
  const setArchived = (v: boolean) => { onUpdate({ ...coffee, archived: v }); onClose(); };
  const startFreeze = () => {
    setAmt(Math.max(10, Math.min(active, Math.round(active / 2 / 10) * 10)));
    setFreezing(true);
  };
  // Going into the freezer pauses aging. Keep the original freeze date if already
  // frozen; clear any prior thaw (this is the active freeze cycle).
  const confirmFreeze = () => { onUpdate({ ...coffee, frozen_grams: frozen + amt, frozen_at: coffee.frozen_at || todayISO(), thawed_at: null }); onClose(); };
  const startEdit = () => {
    beginEdit({
      roaster: coffee.roaster,
      name: coffee.name,
      origin: coffee.origin,
      region: coffee.region,
      varietal: coffee.varietal,
      process: coffee.process,
      notes: (coffee.notes || []).join(", "),
      remaining,
      roastDaysAgo: st.day,
    });
  };
  const saveEdit = () => {
    if (!ef) return;
    const notes = ef.notes ? ef.notes.split(",").map((s) => s.trim()).filter(Boolean) : [];
    // Local date, not toISOString() — UTC formatting shifted the roast date back
    // a day in ahead-of-UTC timezones.
    const roasted_at = daysAgoISO(ef.roastDaysAgo);
    // "Remaining" is what's left now; the stored bag size (grams) is remaining +
    // what's already been brewed, so remainingGrams() reads back the edited value.
    const newRemaining = Number.isFinite(Number(ef.remaining)) ? Number(ef.remaining) : remaining;
    const grams = newRemaining + gramsUsed(coffee.id, brews);
    onUpdate({
      ...coffee,
      roaster: ef.roaster || "Unknown",
      name: ef.name || "Untitled",
      origin: ef.origin,
      region: ef.region || ef.origin,
      varietal: ef.varietal,
      process: ef.process || "Washed",
      notes,
      grams,
      roasted_at,
      cc: originCode(ef.origin),
      color: coffeeColor(notes),
    });
    cancelEdit();
    // Empty bag → almost certainly finished; offer to archive right away
    // (reuses the detail view's archive confirmation).
    if (newRemaining === 0) setConfirmingFinish(true);
  };

  if (editing && ef) {
    return (
      <Sheet open={true} onClose={onClose}>
        <div className="screen-pad" style={{ paddingTop: 6 }}>
          <SheetHeader title="Edit details" onClose={cancelEdit} />
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
              <ProcessPicker value={ef.process} onChange={setE("process")} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px", marginBottom: 4 }}>
            <Stepper icon="timer" label="Roasted" value={Number(ef.roastDaysAgo) || 0} unit="days ago" step={1} min={0} max={200} onChange={setE("roastDaysAgo")} />
            <Stepper icon="scale" label="Remaining" value={Number(ef.remaining) || 0} unit="g" step={2.5} min={0} max={1000} format={(v) => (v % 1 === 0 ? String(v) : v.toFixed(1))} onChange={setE("remaining")} />
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
          <OriginTile code={coffee.cc} roaster={coffee.roaster} color={coffee.color} size={56} radius={13} process={coffee.process} />
          <div style={{ flex: 1 }}>
            <div className="label">{coffee.roaster}</div>
            <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{coffee.name}</div>
            <div style={{ fontSize: 13, color: "var(--ink-dim)", marginTop: 4 }}>{coffee.origin} · {coffee.region}</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <IconButton icon="edit" label="Edit details" onClick={startEdit} size={36} iconSize={17} stroke={1.7} />
            <IconButton icon="close" label="Close" onClick={onClose} size={36} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, marginTop: 20, background: "var(--line)", border: "1px solid var(--line)", borderRadius: 16, overflow: "hidden" }}>
          {([["Varietal", coffee.varietal], ["Process", coffee.process], ["Roasted", `${st.day}d ago`], ["Status", statusLabel]] as [string, string][]).map(([k, v]) => (
            <div key={k} style={{ background: "var(--surface)", padding: "13px 15px" }}>
              <div className="label">{k}</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginTop: 3, color: k === "Status" ? freshColor(st.state) : "var(--ink)" }}>{v}</div>
              {k === "Roasted" && (
                <div className="label" style={{ marginTop: 2 }}>{roastDateText(coffee.roasted_at)}</div>
              )}
              {k === "Status" && st.state === "frozen" && coffee.frozen_at && (
                <div className="label" style={{ marginTop: 2 }}>since {roastDateText(coffee.frozen_at)}</div>
              )}
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
              <span className="dot" style={{ background: "var(--accent)" }} /> {active}g ready · {(() => { const s = cupsLeft(active); return s % 1 === 0 ? String(s) : s.toFixed(1); })()} serves
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
              {active - amt}g stays out · {(() => { const s = cupsLeft(active - amt); return s % 1 === 0 ? String(s) : s.toFixed(1); })()} serves
            </div>
            <button className="btn btn-accent" onClick={confirmFreeze}>
              <Icon name="snow" size={19} stroke={1.8} /> Freeze {amt}g
            </button>
            <button className="btn btn-ghost" onClick={() => setFreezing(false)}>Cancel</button>
          </div>
        ) : thawing ? (
          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="card" style={{ padding: "16px 18px" }}>
              <div className="label" style={{ marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
                <span>Out of the freezer</span>
                <span className="mono">{thawFmt(thawAmt)}g of {frozen}g</span>
              </div>
              <input
                type="range" className="range"
                min={0} max={frozen} step={2.5} value={Math.min(thawAmt, frozen)}
                onChange={(e) => setThawAmt(Number(e.target.value))}
              />
            </div>
            <div className="mono" style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: -4 }}>
              {thawFmt(frozen - Math.min(thawAmt, frozen))}g stays frozen · {(() => { const s = cupsLeft(thawAmt); return s % 1 === 0 ? String(s) : s.toFixed(1); })()} serves out
            </div>
            <button className="btn btn-accent" disabled={thawAmt <= 0} style={{ opacity: thawAmt <= 0 ? 0.4 : 1 }} onClick={confirmThaw}>
              <Icon name="snow" size={19} stroke={1.8} /> Take {thawFmt(thawAmt)}g out
            </button>
            <button className="btn btn-ghost" onClick={() => setThawing(false)}>Cancel</button>
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
              <button className="btn btn-soft" onClick={startThaw}>
                <Icon name="snow" size={19} stroke={1.7} /> Take out of freezer
              </button>
            )}
            {confirmingFinish ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 13.5, color: "var(--ink-dim)", textAlign: "center", lineHeight: 1.4 }}>
                  Move this bag to archive?<br />This can&apos;t be undone from the shelf.
                </div>
                <button className="btn btn-soft" style={{ color: "var(--fade)", borderColor: "var(--fade)" }} onClick={() => { setArchived(true); }}>
                  Yes, mark as finished
                </button>
                <button className="btn btn-ghost" onClick={() => setConfirmingFinish(false)}>Cancel</button>
              </div>
            ) : (
              <button className="btn btn-ghost" onClick={() => setConfirmingFinish(true)}>Mark this bag finished</button>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}

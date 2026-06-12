"use client";
import { useState, useEffect } from "react";
import { Stepper, Sheet, SheetHeader } from "@/components/ui";
import { SText, SToggle } from "./controls";
import type { Brewer, Grinder } from "@/lib/types";

interface AddBrewerSheetProps {
  open: boolean;
  grinder: Grinder;
  onClose: () => void;
  onAdd: (b: Brewer) => void;
}

// Captures the brewer's seed recipe once, at creation. After that, each brew
// remembers its own parameters, so the seed is never edited again.
const blankDraft = (): Brewer => ({
  id: "", name: "", short: "", dose: 15, water: 240, ratio: 16, temp: 94, grind: 5, pours: 3, bypass: false,
});

export function AddBrewerSheet({ open, grinder, onClose, onAdd }: AddBrewerSheetProps) {
  const [draft, setDraft] = useState<Brewer>(blankDraft);
  useEffect(() => { if (open) setDraft(blankDraft()); }, [open]);
  const setD = (patch: Partial<Brewer>) => setDraft((d) => ({ ...d, ...patch }));

  const commit = () => {
    const name = draft.name.trim() || "New brewer";
    const short = draft.short.trim() || name.slice(0, 6);
    const water = draft.water ?? Math.round(draft.dose * 16);
    onAdd({ ...draft, id: "b" + Date.now(), name, short, water, ratio: +(water / draft.dose).toFixed(2) });
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="screen-pad" style={{ paddingTop: 6 }}>
        <SheetHeader title="Add a brewer" onClose={onClose} />

        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 2 }}>
            <SText value={draft.name} onChange={(v) => setD({ name: v })} placeholder="Name" />
          </div>
          <div style={{ flex: 1 }}>
            <SText value={draft.short} onChange={(v) => setD({ short: v })} placeholder="Short" />
          </div>
        </div>

        <div className="label" style={{ marginBottom: 8 }}>Starting recipe</div>
        <div className="card" style={{ padding: "2px 16px", marginBottom: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
            <Stepper icon="scale" label="Dose" value={draft.dose} unit="g" step={0.5} min={8} max={40} onChange={(v) => setD({ dose: v })} />
            <Stepper icon="drop" label="Water" value={draft.water ?? 240} unit="g" step={1} min={50} max={1000} onChange={(v) => setD({ water: v })} />
            <Stepper icon="thermo" label="Temp" value={draft.temp} unit="°C" step={1} min={80} max={100} onChange={(v) => setD({ temp: v })} />
            <Stepper icon="grind" label="Grind"
              value={draft.grind} unit={grinder.unit}
              step={grinder.grind_step ?? 1} min={grinder.grind_min ?? 0} max={grinder.grind_max ?? 50}
              format={(v) => (grinder.grind_step ?? 1) < 1 ? v.toFixed(1) : String(v)}
              onChange={(v) => setD({ grind: v })} />
          </div>
        </div>

        <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", marginBottom: 18 }}>
          <span style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ink-dim)" }}>Add water after brewing (bypass)</span>
          <SToggle on={!!draft.bypass} onChange={(v) => setD({ bypass: v })} />
        </div>

        <button className="btn" onClick={commit} style={{ width: "100%", background: "var(--ink)", color: "var(--bg)", height: 52, borderRadius: 13 }}>
          Add brewer
        </button>
      </div>
    </Sheet>
  );
}

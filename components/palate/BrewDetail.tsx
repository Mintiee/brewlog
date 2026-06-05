"use client";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { Stepper } from "@/components/ui/Stepper";
import { Field } from "@/components/shelf/Field";
import { journalDateText, localISODate, parseLocalDate } from "@/lib/domain";
import type { Brew, Coffee, Config } from "@/lib/types";

interface EditForm {
  date: string;
  dose: number;
  water: number;
  temp: number;
  grind: number;
  ratio: number;
  water_type: string;
  stars: number;
  note: string;
}

interface BrewDetailProps {
  brew: Brew | null;
  coffees: Coffee[];
  config: Config;
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<Brew>) => void;
  onDelete?: (id: string) => void;
}

export function BrewDetail({ brew, coffees, config, onClose, onUpdate, onDelete }: BrewDetailProps) {
  const [editing, setEditing] = useState(false);
  const [ef, setEf] = useState<EditForm | null>(null);
  // Captured when editing starts (avoids an impure Date.now() in render); caps
  // the date picker so brews can't be dated into the future.
  const [todayISO, setTodayISO] = useState("");

  if (!brew) return null;

  const coffee = coffees.find((c) => c.id === brew.coffee_id);
  const brewer = config.brewers.find((b) => b.id === brew.brewer_id);
  const startMs = parseInt(brew.started_at, 10);

  const startEdit = () => {
    setTodayISO(localISODate(Date.now()));
    setEf({
      date: localISODate(startMs),
      dose: brew.dose,
      water: brew.water,
      temp: brew.temp,
      grind: brew.grind,
      ratio: brew.ratio,
      water_type: brew.water_type || config.default_water || "",
      stars: brew.stars ?? 3,
      note: brew.note || "",
    });
    setEditing(true);
  };

  const saveEdit = () => {
    if (!ef) return;
    // Parse the picked "YYYY-MM-DD" as local midnight (not UTC) to avoid ±1-day drift.
    const newStartMs = parseLocalDate(ef.date).getTime();
    const patch: Partial<Brew> = {
      dose: ef.dose,
      water: ef.water,
      temp: ef.temp,
      grind: ef.grind,
      ratio: ef.ratio,
      water_type: ef.water_type,
      stars: ef.stars,
      note: ef.note || null,
      started_at: String(newStartMs),
      // Keep rated_at at same offset from started_at (or keep original if not backdated)
      rated_at: brew.rated_at
        ? String(parseInt(brew.rated_at, 10) + (newStartMs - startMs))
        : null,
    };
    onUpdate(brew.id, patch);
    setEditing(false);
    onClose();
  };

  const setE = (k: keyof EditForm) => (v: string | number) =>
    setEf((f) => f ? { ...f, [k]: v } : f);

  const btnClose: React.CSSProperties = {
    background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: "50%",
    width: 34, height: 34, color: "var(--ink-dim)", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
  };

  if (editing && ef) {
    return (
      <Sheet open={true} onClose={onClose}>
        <div className="screen-pad" style={{ paddingTop: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <h2 style={{ fontSize: 21, fontWeight: 600, letterSpacing: "-0.01em" }}>Edit brew</h2>
            <button onClick={() => setEditing(false)} style={btnClose}>
              <Icon name="close" size={18} stroke={1.9} />
            </button>
          </div>

          <div className="card" style={{ padding: "2px 16px", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "12px 0", minWidth: 0 }}>
              <div style={{ color: "var(--ink-faint)", display: "flex", flexShrink: 0 }}>
                <Icon name="timer" size={18} stroke={1.6} />
              </div>
              <div className="label" style={{ flex: 1, minWidth: 0 }}>Date</div>
              <input
                type="date"
                value={ef.date}
                max={todayISO}
                onChange={(e) => setE("date")(e.target.value)}
                style={{
                  background: "var(--surface-3)", border: "1px solid var(--line)", borderRadius: 10,
                  color: "var(--ink)", fontFamily: "var(--font-ui)", fontSize: 15, fontWeight: 600,
                  padding: "7px 10px", outline: "none", colorScheme: "dark", flexShrink: 0,
                }}
              />
            </div>
            <div style={{ height: 1, background: "var(--line)" }} />
            <Stepper icon="scale" label="Dose" value={ef.dose} unit="g"
              step={0.1} min={5} max={40}
              format={(v) => v.toFixed(1)}
              onChange={setE("dose")} />
            <div style={{ height: 1, background: "var(--line)" }} />
            <Stepper icon="drop" label="Water" value={ef.water} unit="mL"
              step={5} min={50} max={600} onChange={setE("water")} />
            <div style={{ height: 1, background: "var(--line)" }} />
            <Stepper icon="thermo" label="Temp" value={ef.temp} unit="°C"
              step={1} min={80} max={100} onChange={setE("temp")} />
            <div style={{ height: 1, background: "var(--line)" }} />
            <Stepper icon="grind" label="Grind" value={ef.grind} unit={config.grinder.unit}
              step={config.grinder.grind_step ?? 1}
              min={config.grinder.grind_min ?? 0}
              max={config.grinder.grind_max ?? 50}
              format={(v) => (config.grinder.grind_step ?? 1) < 1 ? v.toFixed(1) : String(v)}
              onChange={setE("grind")} />
          </div>

          <div className="card" style={{ padding: "2px 16px", marginBottom: 14 }}>
            <Stepper icon="star" label="Rating" value={ef.stars} unit="/ 5"
              step={0.5} min={0.5} max={5}
              format={(v) => v % 1 === 0 ? String(v) : v.toFixed(1)}
              onChange={setE("stars")} />
          </div>

          <Field label="Notes" value={ef.note} onChange={setE("note") as (v: string) => void} placeholder="Tasting notes…" />

          <button className="btn btn-accent" style={{ marginTop: 8 }} onClick={saveEdit}>
            <Icon name="check" size={20} stroke={2} /> Save changes
          </button>
        </div>
      </Sheet>
    );
  }

  // Detail view
  const ratingStars = brew.stars ?? 0;
  const dateLabel = journalDateText(startMs);

  return (
    <Sheet open={!!brew} onClose={onClose}>
      <div className="screen-pad" style={{ paddingTop: 8 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <div style={{
            width: 10, height: 56, borderRadius: 5, flexShrink: 0, marginTop: 3,
            background: coffee ? coffee.color : "var(--accent)",
          }} />
          <div style={{ flex: 1 }}>
            <div className="label">{brewer ? brewer.short : brew.brewer_id}</div>
            <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              {coffee ? coffee.name : brew.coffee_id}
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-dim)", marginTop: 4 }}>
              {dateLabel} · 1:{brew.ratio.toFixed(1)}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button onClick={startEdit} style={btnClose}>
              <Icon name="edit" size={17} stroke={1.7} />
            </button>
            <button onClick={onClose} style={btnClose}>
              <Icon name="close" size={18} stroke={1.9} />
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, marginTop: 20, background: "var(--line)", border: "1px solid var(--line)", borderRadius: 16, overflow: "hidden" }}>
          {([
            ["Dose", `${brew.dose}g`],
            ["Water", `${brew.water}mL`],
            ["Rested", brew.rest_days != null ? `${brew.rest_days}d` : "—"],
            ["Temp", `${brew.temp}°C`],
            ["Grind", `${brew.grind}${config.grinder.unit}`],
            ["Water type", brew.water_type || "—"],
          ] as [string, string][]).map(([k, v]) => (
            <div key={k} style={{ background: "var(--surface)", padding: "13px 15px" }}>
              <div className="label">{k}</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginTop: 3 }}>{v}</div>
            </div>
          ))}
        </div>

        {brew.stars != null && (
          <div style={{ marginTop: 18 }}>
            <div className="label" style={{ marginBottom: 8 }}>Rating</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", gap: 4 }}>
                {[1, 2, 3, 4, 5].map((i) => {
                  const full = i <= ratingStars;
                  const half = !full && (i - 0.5 === ratingStars);
                  return (
                    <span key={i} style={{ position: "relative", display: "inline-block", fontSize: 22, lineHeight: 1 }}>
                      <span style={{ color: full ? "var(--accent)" : "var(--ink-ghost)" }}>★</span>
                      {half && (
                        <span style={{
                          position: "absolute", left: 0, top: 0,
                          overflow: "hidden", width: "50%", height: "100%",
                          color: "var(--accent)", display: "block",
                        }}>★</span>
                      )}
                    </span>
                  );
                })}
              </div>
              {brew.stars2 != null && (
                <span className="label" style={{ fontSize: 11 }}>
                  {brew.taster1 || "you"} {brew.stars} · {brew.taster2 || config.taster2} {brew.stars2}
                </span>
              )}
            </div>
          </div>
        )}

        {brew.note && (
          <div style={{ marginTop: 16, fontSize: 14, color: "var(--ink-dim)", lineHeight: 1.55, fontStyle: "italic" }}>
            &ldquo;{brew.note}&rdquo;
          </div>
        )}

        <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 10 }}>
          <button className="btn btn-accent" onClick={startEdit}>
            <Icon name="edit" size={19} stroke={1.7} /> Edit this brew
          </button>
          {onDelete && (
            <button className="btn btn-ghost" onClick={() => { onDelete(brew.id); onClose(); }}>
              Delete
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}

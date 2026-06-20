"use client";
import { useState } from "react";
import { useEditForm } from "@/lib/hooks/useEditForm";
import { Icon } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { SheetHeader } from "@/components/ui/SheetHeader";
import { Sheet } from "@/components/ui/Sheet";
import { Segmented } from "@/components/ui/Segmented";
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
  brews: Brew[];
  config: Config;
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<Brew>) => void;
  onDelete?: (id: string) => void;
  onRate?: (b: Brew) => void;
}

export function BrewDetail({ brew, coffees, brews, config, onClose, onUpdate, onDelete, onRate }: BrewDetailProps) {
  const { editing, form: ef, startEdit: beginEdit, cancelEdit, set: setE } = useEditForm<EditForm>();
  // Captured when editing starts (avoids an impure Date.now() in render); caps
  // the date picker so brews can't be dated into the future.
  const [todayISO, setTodayISO] = useState("");
  const [activeTaster, setActiveTaster] = useState(0);
  // Split deletes remove both tasters' ratings, so they confirm inline; solo
  // deletes go straight through (the post-delete Undo toast covers mistakes).
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (!brew) return null;

  // Resolve the session group for split brews. Sort so the logger's own cup
  // (!rate_for) comes first, partner's cup second — regardless of which row
  // was passed in (the recent strip may hand us the sibling at index 0).
  const group = brew.session_id
    ? [...brews.filter((b) => b.session_id === brew.session_id)]
        .sort((a, b) => (a.rate_for == null ? -1 : 1) - (b.rate_for == null ? -1 : 1))
    : null;
  const isSplit = group != null && group.length > 1;
  // Tab labels for the split segmented control. Clips activeTaster to bounds so
  // switching from a split brew to a solo brew never reads out of range.
  const tasterNames = isSplit
    ? group!.map((row) => row.taster1 || (row.rate_for == null ? "you" : config.taster2 || "partner"))
    : [];
  const activeIdx = Math.min(activeTaster, tasterNames.length - 1);

  const coffee = coffees.find((c) => c.id === brew.coffee_id);
  const brewer = config.brewers.find((b) => b.id === brew.brewer_id);
  const startMs = parseInt(brew.started_at, 10);

  const startEdit = () => {
    setTodayISO(localISODate(Date.now()));
    beginEdit({
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
    cancelEdit();
    onClose();
  };

  if (editing && ef) {
    return (
      <Sheet open={true} onClose={onClose}>
        <div className="screen-pad" style={{ paddingTop: 6 }}>
          <SheetHeader title="Edit brew" onClose={cancelEdit} />

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
                  color: "var(--ink)", fontFamily: "var(--font-ui)", fontSize: 16, fontWeight: 600,
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

          <Field label="Notes" value={ef.note} onChange={setE("note")} placeholder="Tasting notes…" />

          <button className="btn btn-accent" style={{ marginTop: 8 }} onClick={saveEdit}>
            <Icon name="check" size={20} stroke={2} /> Save changes
          </button>
        </div>
      </Sheet>
    );
  }

  // Detail view
  const dateLabel = journalDateText(startMs);

  // Renders stars + tasting scales + note for one brew row.
  // "Rating" label (solo) or the Segmented tab (split) serves as the header — no name header here.
  const renderTasterBlock = (row: Brew) => {
    const displayName = row.taster1 || (row.rate_for == null ? "you" : config.taster2 || "partner");
    const rowStars = row.stars ?? 0;
    const scales = [
      { label: "Acidity", value: row.acidity, low: "Flat", high: "Bright" },
      { label: "Sweetness", value: row.sweetness, low: "Dry", high: "Syrupy" },
      { label: "Body", value: row.body, low: "Light", high: "Heavy" },
      { label: "Clarity", value: row.clarity, low: "Muddy", high: "Clean" },
    ].flatMap((s) => (s.value != null && s.value > 0 ? [{ ...s, value: s.value }] : []));

    return (
      <div key={row.id}>
        {row.stars == null ? (
          <div style={{ fontSize: 13, color: "var(--ink-faint)", fontStyle: "italic" }}>
            Waiting on {displayName} to rate…
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", gap: 4 }}>
                {[1, 2, 3, 4, 5].map((i) => {
                  const full = i <= rowStars;
                  const half = !full && (i - 0.5 === rowStars);
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
              {/* Legacy two-slot (stars2 set, session_id null): show combined label */}
              {row.stars2 != null && (
                <span className="label" style={{ fontSize: 11 }}>
                  {row.taster1 || "you"} {row.stars} · {row.taster2 || config.taster2} {row.stars2}
                </span>
              )}
            </div>
            {scales.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div className="label" style={{ marginBottom: 8 }}>Tasting</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {scales.map((s) => {
                    const descriptor = s.value <= 2 ? s.low : s.value >= 4 ? s.high : `${s.low}–${s.high}`;
                    return (
                      <div key={s.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "7px 0" }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{s.label}</div>
                          <div className="label" style={{ fontSize: 9, marginTop: 2 }}>{descriptor}</div>
                        </div>
                        <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <span key={n} style={{ width: 18, height: 18, borderRadius: 6, background: n <= s.value ? "var(--accent)" : "var(--surface-3)" }} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {row.note && (
              <div style={{ marginTop: 12, fontSize: 14, color: "var(--ink-dim)", lineHeight: 1.55, fontStyle: "italic" }}>
                &ldquo;{row.note}&rdquo;
              </div>
            )}
          </>
        )}
      </div>
    );
  };

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
            <IconButton icon="edit" label="Edit brew" onClick={startEdit} iconSize={17} stroke={1.7} />
            <IconButton icon="close" label="Close" onClick={onClose} />
          </div>
        </div>

        {/* Shared recipe — one physical brew, shown once even for splits */}
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

        {isSplit ? (
          // Split session: tab per taster; pending sibling shows "waiting on…".
          <div style={{ marginTop: 18 }}>
            <Segmented
              options={tasterNames}
              value={tasterNames[activeIdx]}
              onChange={(v) => setActiveTaster(tasterNames.indexOf(v))}
            />
            <div style={{ marginTop: 16 }}>
              {renderTasterBlock(group![activeIdx])}
            </div>
          </div>
        ) : (
          // Solo or legacy two-slot brew — unchanged single-rating view.
          brew.stars != null && (
            <div style={{ marginTop: 18 }}>
              <div className="label" style={{ marginBottom: 8 }}>Rating</div>
              {renderTasterBlock(brew)}
            </div>
          )
        )}

        <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 10 }}>
          {brew.guest && (
            <div className="label" style={{ textAlign: "center", color: "var(--ink-faint)", paddingBottom: 2 }}>
              Made for a guest — no rating
            </div>
          )}
          {brew.pending && !brew.guest && onRate && (
            <button className="btn btn-accent" onClick={() => onRate(brew)}>
              <Icon name="star" size={19} stroke={1.7} /> Rate this brew
            </button>
          )}
          <button className={brew.pending && !brew.guest && onRate ? "btn btn-soft" : "btn btn-accent"} onClick={startEdit}>
            <Icon name="edit" size={19} stroke={1.7} /> Edit this brew
          </button>
          {onDelete && (
            isSplit && confirmingDelete ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 13.5, color: "var(--ink-dim)", textAlign: "center", lineHeight: 1.4 }}>
                  This was a split cup — deleting removes both ratings.
                </div>
                <button className="btn btn-soft" style={{ color: "var(--bad, #b65f4f)", borderColor: "var(--bad, #b65f4f)" }} onClick={() => { onDelete(brew.id); setConfirmingDelete(false); onClose(); }}>
                  Delete both cups
                </button>
                <button className="btn btn-ghost" onClick={() => setConfirmingDelete(false)}>Cancel</button>
              </div>
            ) : (
              <button
                className="btn btn-ghost"
                onClick={() => {
                  if (isSplit) { setConfirmingDelete(true); return; }
                  onDelete(brew.id);
                  onClose();
                }}
              >
                Delete
              </button>
            )
          )}
        </div>
      </div>
    </Sheet>
  );
}

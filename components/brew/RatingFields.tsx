"use client";
import { useState } from "react";
import { Icon, Stars, Scale5 } from "@/components/ui";

/**
 * Draft shape for the rating block. Every field is non-null with a sentinel for
 * "unset" (0 / "") — the nullable DB columns are the caller's concern, so the
 * widgets never have to reason about null. See `brewEditPatch` / StepRate.onSave
 * for the mapping back.
 */
export interface RatingDraft {
  stars: number;      // 0 = not rated
  stars2: number;     // 0 = no second taster
  taster2: string;
  acidity: number;    // 0 = unset, else 1–5
  sweetness: number;
  body: number;
  clarity: number;
  note: string;
}

export const EMPTY_RATING: RatingDraft = {
  stars: 0, stars2: 0, taster2: "",
  acidity: 0, sweetness: 0, body: 0, clarity: 0, note: "",
};

interface RatingFieldsProps {
  value: RatingDraft;
  onChange: (patch: Partial<RatingDraft>) => void;
  /** Name shown against the primary star row. */
  meName: string;
  /** Pre-filled name for the second taster slot when it's opened. */
  partnerName?: string;
  /** Split brews rate each cup on its own row, so the legacy second slot is
   *  meaningless there — hide it rather than offer two competing mechanisms. */
  allowSecondTaster?: boolean;
}

/**
 * Stars + second taster + the four sensory scales + tasting note. Shared by the
 * log flow (StepRate) and the edit sheet (BrewDetail); before this, the scales
 * and the second taster were capture-only — once logged there was no way to
 * change them short of deleting the brew.
 */
export function RatingFields({ value: v, onChange, meName, partnerName, allowSecondTaster = true }: RatingFieldsProps) {
  // Progressive disclosure, but pre-expanded when the brew already carries the
  // value — an edit must never hide data the user is trying to reach.
  const [secondOpen, setSecondOpen] = useState(() => v.stars2 > 0);
  const [noteOpen, setNoteOpen] = useState(() => v.note.length > 0);

  return (
    <>
      <div className="card" style={{ padding: "8px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 0" }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>{meName}</span>
          <Stars value={v.stars} onChange={(n) => onChange({ stars: n })} size={34} gap={10} />
        </div>
        {allowSecondTaster && secondOpen && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: "1px solid var(--line)" }}>
            <input
              value={v.taster2}
              onChange={(e) => onChange({ taster2: e.target.value })}
              style={{ background: "none", border: "none", outline: "none", color: "var(--ink)", fontFamily: "var(--font-ui)", fontSize: 16, fontWeight: 600, width: 84, minWidth: 0, padding: 0 }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Stars value={v.stars2} onChange={(n) => onChange({ stars2: n })} size={28} gap={6} />
              <button
                onClick={() => { setSecondOpen(false); onChange({ stars2: 0, taster2: "" }); }}
                style={{ background: "none", border: "none", color: "var(--ink-faint)", cursor: "pointer", display: "flex" }}
              >
                <Icon name="close" size={15} stroke={2} />
              </button>
            </div>
          </div>
        )}
      </div>
      {allowSecondTaster && !secondOpen && (
        <button
          className="btn btn-ghost"
          onClick={() => { setSecondOpen(true); if (!v.taster2) onChange({ taster2: partnerName || "" }); }}
          style={{ marginTop: 8, height: 40, justifyContent: "flex-start", paddingLeft: 4, whiteSpace: "nowrap", color: "var(--ink-faint)" }}
        >
          <Icon name="plus" size={16} stroke={2} /> Add another taster
        </button>
      )}

      <div className="card" style={{ padding: "2px 16px", marginTop: 10 }}>
        <Scale5 label="Acidity"   value={v.acidity}   onChange={(n) => onChange({ acidity: n })}   lowTag="Flat"  highTag="Bright" />
        <div style={{ height: 1, background: "var(--line)" }} />
        <Scale5 label="Sweetness" value={v.sweetness} onChange={(n) => onChange({ sweetness: n })} lowTag="Dry"   highTag="Syrupy" />
        <div style={{ height: 1, background: "var(--line)" }} />
        <Scale5 label="Body"      value={v.body}      onChange={(n) => onChange({ body: n })}      lowTag="Light" highTag="Heavy" />
        <div style={{ height: 1, background: "var(--line)" }} />
        <Scale5 label="Clarity"   value={v.clarity}   onChange={(n) => onChange({ clarity: n })}   lowTag="Muddy" highTag="Clean" />
      </div>

      {noteOpen ? (
        <textarea
          autoFocus={!v.note}
          value={v.note}
          onChange={(e) => onChange({ note: e.target.value })}
          placeholder="Tasting note…"
          style={{
            width: "100%", marginTop: 14, minHeight: 70, resize: "none", padding: 14, borderRadius: 16,
            background: "var(--surface)", border: "1px solid var(--line)", color: "var(--ink)",
            fontFamily: "var(--font-ui)", fontSize: 16, outline: "none", boxSizing: "border-box",
          }}
        />
      ) : (
        <button className="btn btn-ghost" style={{ marginTop: 8, height: 40, justifyContent: "flex-start", paddingLeft: 4 }} onClick={() => setNoteOpen(true)}>
          <Icon name="edit" size={17} stroke={1.7} /> Add a tasting note
        </button>
      )}
    </>
  );
}

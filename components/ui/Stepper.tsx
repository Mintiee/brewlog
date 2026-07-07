"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

interface StepperProps {
  icon: string;
  label: string;
  value: number;
  unit?: string;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  format?: (v: number) => string;
  /** Reduce vertical padding (8px vs 12px) for space-constrained screens. */
  dense?: boolean;
}

export function Stepper({ icon, label, value, unit, onChange, step = 1, min = 0, max = 999, format, dense }: StepperProps) {
  // Latest props live on a ref so the hold-to-repeat timers (which run outside
  // React's render cycle) always step from the current value/bounds instead of
  // a stale closure captured when the hold began. Updated in an effect (not
  // during render) since refs are only safe to write outside render.
  const latest = useRef({ value, onChange, step, min, max });
  useEffect(() => { latest.current = { value, onChange, step, min, max }; });

  const stepOnce = (dir: 1 | -1) => {
    const { value, onChange, step, min, max } = latest.current;
    const next = dir > 0
      ? Math.min(max, +(value + step).toFixed(2))
      : Math.max(min, +(value - step).toFixed(2));
    onChange(next);
  };

  // Press-and-hold: a short delay before repeating, then repeat every ~120ms,
  // accelerating to ~50ms once the hold has run for ~1.5s. A plain tap (release
  // before the delay fires) never enters repeat mode, so it steps exactly once
  // via onClick; `didRepeat` suppresses that same click when a hold already did.
  const holdDelay = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTick = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Counts repeat ticks instead of reading the clock — ~12 ticks at the 120ms
  // cadence is ~1.5s, which is when we accelerate to the faster 50ms cadence.
  const tickCount = useRef(0);
  const didRepeat = useRef(false);

  const clearHold = () => {
    if (holdDelay.current) { clearTimeout(holdDelay.current); holdDelay.current = null; }
    if (holdTick.current) { clearTimeout(holdTick.current); holdTick.current = null; }
  };
  useEffect(() => clearHold, []);

  const scheduleTick = (dir: 1 | -1) => {
    tickCount.current += 1;
    const delay = tickCount.current > 12 ? 50 : 120;
    holdTick.current = setTimeout(() => {
      stepOnce(dir);
      scheduleTick(dir);
    }, delay);
  };

  const startHold = (dir: 1 | -1) => {
    didRepeat.current = false;
    tickCount.current = 0;
    clearHold();
    holdDelay.current = setTimeout(() => {
      didRepeat.current = true;
      stepOnce(dir);
      scheduleTick(dir);
    }, 500);
  };

  const clickOnce = (dir: 1 | -1) => {
    if (didRepeat.current) { didRepeat.current = false; return; }
    stepOnce(dir);
  };

  // Tap-to-type: swap the readout for a free-entry input. Free entry means the
  // typed value is only clamped to min/max — never snapped to a step multiple.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const closing = useRef(false);

  useEffect(() => {
    if (editing) { inputRef.current?.focus(); inputRef.current?.select(); }
  }, [editing]);

  const startEdit = () => {
    setDraft(format ? format(value) : String(value));
    setEditing(true);
  };

  const finishEdit = (commit: boolean) => {
    if (closing.current) return;
    closing.current = true;
    if (commit) {
      const parsed = parseFloat(draft);
      if (!Number.isNaN(parsed)) {
        const clamped = Math.min(max, Math.max(min, parsed));
        onChange(+clamped.toFixed(2));
      }
    }
    setEditing(false);
    queueMicrotask(() => { closing.current = false; });
  };

  // Hit target is 44x44 but a negative margin cancels the extra 14px out of the
  // flex layout, so the row footprint is unchanged; the 30x30 visual circle
  // lives on an inner span centered in that hit box, so nothing looks different.
  const hitStyle: React.CSSProperties = {
    width: 44, height: 44, margin: -7, background: "none", border: "none", padding: 0,
    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
    touchAction: "manipulation",
  };
  const circleStyle: React.CSSProperties = {
    width: 30, height: 30, borderRadius: "50%", background: "var(--surface-3)",
    border: "1px solid var(--line)", color: "var(--ink)",
    display: "flex", alignItems: "center", justifyContent: "center",
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, padding: dense ? "8px 0" : "12px 0", minWidth: 0 }}>
      <div style={{ color: "var(--ink-faint)", display: "flex", flexShrink: 0 }}>
        <Icon name={icon} size={18} stroke={1.6} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="label" style={{ marginBottom: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
        {editing ? (
          <input
            ref={inputRef}
            className="num"
            inputMode="decimal"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); finishEdit(true); }
              else if (e.key === "Escape") { e.preventDefault(); finishEdit(false); }
            }}
            onBlur={() => finishEdit(true)}
            style={{
              fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em",
              width: "100%", background: "none", border: "none", outline: "none",
              padding: 0, color: "var(--ink)",
            }}
          />
        ) : (
          <div className="num" onClick={startEdit} style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em", cursor: "text" }}>
            {format ? format(value) : value}
            {unit && <span style={{ fontSize: 11, color: "var(--ink-faint)", marginLeft: 2, fontWeight: 500 }}>{unit}</span>}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button
          style={hitStyle}
          aria-label="Decrease"
          onClick={() => clickOnce(-1)}
          onPointerDown={() => startHold(-1)}
          onPointerUp={clearHold}
          onPointerLeave={clearHold}
          onPointerCancel={clearHold}
        >
          <span style={circleStyle}><Icon name="minus" size={15} stroke={2} /></span>
        </button>
        <button
          style={hitStyle}
          aria-label="Increase"
          onClick={() => clickOnce(1)}
          onPointerDown={() => startHold(1)}
          onPointerUp={clearHold}
          onPointerLeave={clearHold}
          onPointerCancel={clearHold}
        >
          <span style={circleStyle}><Icon name="plus" size={15} stroke={2} /></span>
        </button>
      </div>
    </div>
  );
}

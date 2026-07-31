"use client";
import { useMemo, useState } from "react";
import { Icon, Sheet, SheetHeader, Stepper } from "@/components/ui";
import { distinctRoasters, roasterKey } from "@/lib/domain";
import type { Coffee, RoasterWindow } from "@/lib/types";

interface RoasterRestSheetProps {
  open: boolean;
  coffees: Coffee[];
  /** Household defaults, used for rows without an override and to seed new ones. */
  restDays: number;
  peakDays: number;
  windows: Record<string, RoasterWindow>;
  /** roasterKeys the user has hidden. Presentational only — windows still apply. */
  hidden: string[];
  onChange: (windows: Record<string, RoasterWindow>) => void;
  onHiddenChange: (hidden: string[]) => void;
  onClose: () => void;
}

interface Row {
  key: string;
  name: string;
  window: RoasterWindow | null;   // null = using the household default
}

/**
 * One row per roaster, expanding to steppers on tap.
 *
 * A flat list of always-open stepper cards got unreadable at more than two or three
 * roasters, so rows collapse, and the list is split three ways:
 *
 *   - roasters on the shelf (plus any carrying an override, so a window that is
 *     silently applying is never out of sight)
 *   - roasters whose bags are all finished — collapsed, an automatic split
 *   - roasters the user hid by hand — collapsed, and this one wins over the other
 *     two, because an explicit choice should beat a derived one
 *
 * A row with no override shows the household default and only becomes an override
 * once you actually move a stepper — so opening a row to look costs nothing.
 */
export function RoasterRestSheet({
  open, coffees, restDays, peakDays, windows, hidden, onChange, onHiddenChange, onClose,
}: RoasterRestSheetProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  const { shelf, past, hiddenRows } = useMemo(() => {
    const byName = (a: Row, b: Row) => a.name.localeCompare(b.name);
    const hiddenKeys = new Set(hidden);
    const onShelfKeys = new Set(
      distinctRoasters(coffees.filter((c) => !c.archived)).map(roasterKey),
    );
    const seen = new Set<string>();
    const shelf: Row[] = [];
    const past: Row[] = [];
    const hiddenRows: Row[] = [];

    const place = (row: Row) => {
      if (hiddenKeys.has(row.key)) hiddenRows.push(row);
      else if (onShelfKeys.has(row.key) || row.window) shelf.push(row);
      else past.push(row);
    };

    for (const name of distinctRoasters(coffees)) {
      const key = roasterKey(name);
      seen.add(key);
      place({ key, name, window: windows[key] ?? null });
    }
    // A window whose roaster has left the store entirely still needs a row to clear it.
    for (const [key, w] of Object.entries(windows)) {
      if (!seen.has(key)) { seen.add(key); place({ key, name: w.name, window: w }); }
    }
    // Likewise a hide for a roaster with no coffees and no window — otherwise it
    // would be unreachable and could never be undone.
    for (const key of hidden) {
      if (!seen.has(key)) hiddenRows.push({ key, name: key, window: null });
    }
    return { shelf: shelf.sort(byName), past: past.sort(byName), hiddenRows: hiddenRows.sort(byName) };
  }, [coffees, windows, hidden]);

  const setWindow = (key: string, name: string, patch: Partial<RoasterWindow>) => {
    const cur = windows[key] ?? { name, rest_days: restDays, peak_days: peakDays };
    onChange({ ...windows, [key]: { ...cur, name, ...patch } });
  };

  // Moving "Ready from" carries "Best until" with it, keeping the drink window the
  // same length: 28/56 set to 14 gives 14–42, not 14–56.
  const setRest = (row: Row, rest: number) => {
    const cur = row.window ?? { rest_days: restDays, peak_days: peakDays };
    const span = Math.max(1, cur.peak_days - cur.rest_days);
    setWindow(row.key, row.name, { rest_days: rest, peak_days: Math.min(365, rest + span) });
  };

  const clear = (key: string) => {
    const next = { ...windows };
    delete next[key];
    onChange(next);
  };

  const setHidden = (key: string, hide: boolean) => {
    onHiddenChange(hide ? [...hidden, key] : hidden.filter((k) => k !== key));
    setExpanded(null);   // the row is about to move groups; don't leave it open elsewhere
  };

  const footerBtn = (label: string, onClick: () => void, ariaLabel: string) => (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        background: "none", border: "none", padding: "10px 0 12px", cursor: "pointer",
        color: "var(--ink-faint)", fontSize: 11.5, fontWeight: 600, fontFamily: "var(--font-ui)",
      }}
    >
      {label}
    </button>
  );

  const renderRow = (row: Row) => {
    const isOpen = expanded === row.key;
    const isHidden = hidden.includes(row.key);
    const w = row.window ?? { rest_days: restDays, peak_days: peakDays };
    const overridden = row.window != null;
    return (
      <div key={row.key} className="card" style={{ padding: 0, marginBottom: 8, overflow: "hidden" }}>
        <button
          onClick={() => setExpanded(isOpen ? null : row.key)}
          aria-expanded={isOpen}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "13px 15px",
            background: "none", border: "none", color: "inherit", cursor: "pointer", textAlign: "left",
          }}
        >
          <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {row.name}
          </span>
          <span
            className="num"
            style={{ fontSize: 13, fontWeight: 600, flexShrink: 0, color: overridden ? "var(--accent)" : "var(--ink-faint)" }}
          >
            {w.rest_days}–{w.peak_days}d
          </span>
          <span style={{ display: "flex", flexShrink: 0, color: "var(--ink-faint)", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .16s ease" }}>
            <Icon name="chev" size={16} stroke={1.8} />
          </span>
        </button>

        {isOpen && (
          <div style={{ padding: "0 15px 4px", borderTop: "1px solid var(--line)" }}>
            <Stepper dense icon="timer" label="Ready from" value={w.rest_days} unit="days"
              step={1} min={1} max={364}
              onChange={(v) => setRest(row, Math.round(v))} />
            <div style={{ height: 1, background: "var(--line)" }} />
            <Stepper dense icon="timer" label="Best until" value={w.peak_days} unit="days"
              step={1} min={w.rest_days + 1} max={365}
              onChange={(v) => setWindow(row.key, row.name, { peak_days: Math.round(v) })} />
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
              {overridden && footerBtn(
                `Use default (${restDays}–${peakDays}d)`,
                () => clear(row.key),
                `Use the default window for ${row.name}`,
              )}
              {footerBtn(
                isHidden ? "Unhide" : "Hide",
                () => setHidden(row.key, !isHidden),
                `${isHidden ? "Unhide" : "Hide"} ${row.name}`,
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const group = (rows: Row[], shown: boolean, toggle: () => void, label: string) => {
    if (rows.length === 0) return null;
    // Say when a collapsed group holds live windows, so nothing applies out of sight.
    const withWindows = rows.filter((r) => r.window).length;
    return (
      <>
        <button
          onClick={toggle}
          aria-expanded={shown}
          style={{
            display: "flex", alignItems: "center", gap: 6, margin: "6px 0 10px", padding: "6px 0",
            background: "none", border: "none", cursor: "pointer", color: "var(--ink-faint)",
            fontFamily: "var(--font-ui)", fontSize: 11.5, fontWeight: 600, textAlign: "left",
          }}
        >
          <Icon name={shown ? "chevDown" : "chev"} size={14} stroke={1.8} />
          {shown ? "Hide" : `Show ${rows.length}`} · {label}
          {!shown && withWindows > 0 && (
            <span style={{ color: "var(--accent)" }}>· {withWindows} with a window</span>
          )}
        </button>
        {shown && rows.map(renderRow)}
      </>
    );
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="screen-pad" style={{ paddingTop: 6, paddingBottom: 18 }}>
        <SheetHeader title="Rest by roaster" onClose={onClose} />

        <div style={{ fontSize: 11.5, color: "var(--ink-faint)", lineHeight: 1.5, marginBottom: 13 }}>
          A roaster&rsquo;s window applies to every coffee from them, past and future. Moving
          &ldquo;Ready from&rdquo; keeps the window the same length.
        </div>

        {shelf.length === 0 && past.length === 0 && hiddenRows.length === 0 ? (
          <div style={{ fontSize: 11.5, color: "var(--ink-faint)", lineHeight: 1.5 }}>
            Add a coffee and its roaster will appear here.
          </div>
        ) : (
          shelf.map(renderRow)
        )}

        {group(past, showPast, () => setShowPast((v) => !v), "not on the shelf")}
        {group(hiddenRows, showHidden, () => setShowHidden((v) => !v), "hidden")}
      </div>
    </Sheet>
  );
}

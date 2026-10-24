"use client";
import { useMemo, useState } from "react";
import { Icon, Sheet, SheetHeader } from "@/components/ui";
import { normalizeText, type Facet } from "@/lib/domain/search";

interface RoasterPickerSheetProps {
  open: boolean;
  roasters: Facet[];
  /** roasterKey of the active filter, or null. */
  selected: string | null;
  onPick: (key: string | null) => void;
  onClose: () => void;
}

/** Every roaster on the shelf (finished bags included), most bags first, with a filter box. */
export function RoasterPickerSheet({ open, roasters, selected, onPick, onClose }: RoasterPickerSheetProps) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const n = normalizeText(q);
    return n ? roasters.filter((r) => normalizeText(r.name).includes(n)) : roasters;
  }, [q, roasters]);

  const close = () => { setQ(""); onClose(); };
  const pick = (key: string | null) => { onPick(key); close(); };

  return (
    <Sheet open={open} onClose={close}>
      <div className="screen-pad" style={{ paddingTop: 6, paddingBottom: 18 }}>
        <SheetHeader title="Roasters" onClose={close} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter roasters"
          aria-label="Filter roasters"
          style={{
            width: "100%", padding: "12px 14px", borderRadius: 13, background: "var(--surface)", border: "1px solid var(--line)",
            color: "var(--ink)", fontFamily: "var(--font-ui)", fontSize: 16, outline: "none", boxSizing: "border-box", marginBottom: 12,
          }}
        />
        {selected && (
          <button onClick={() => pick(null)} className="chip" style={{ marginBottom: 12 }}>
            Any roaster
          </button>
        )}
        <div style={{ border: "1px solid var(--line)", borderRadius: 14, overflow: "hidden" }}>
          {shown.map((r, i) => (
            <button
              key={r.key}
              onClick={() => pick(r.key)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "13px 15px", cursor: "pointer", textAlign: "left",
                background: "var(--surface)", border: "none", borderTop: i ? "1px solid var(--line)" : "none", color: "var(--ink)",
                fontFamily: "var(--font-ui)", fontSize: 15, fontWeight: r.key === selected ? 600 : 500,
              }}
            >
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
              <span className="mono" style={{ fontSize: 12, color: "var(--ink-faint)" }}>{r.count}</span>
              {r.key === selected && <Icon name="check" size={15} stroke={2.2} style={{ color: "var(--accent)" }} />}
            </button>
          ))}
          {shown.length === 0 && (
            <div className="label" style={{ padding: "14px 15px", color: "var(--ink-faint)" }}>No roaster matches</div>
          )}
        </div>
      </div>
    </Sheet>
  );
}

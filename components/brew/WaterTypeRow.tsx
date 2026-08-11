"use client";
import { useState } from "react";
import { Icon } from "@/components/ui";
import { Sheet } from "@/components/ui/Sheet";

interface WaterTypeRowProps {
  value: string;
  onChange: (v: string) => void;
  /** Household water list from Config.waters. */
  waters: string[];
}

/**
 * Tap-to-open water-type row plus its picker sheet. Shared by the log flow and
 * the edit sheet: the edit sheet used to carry `water_type` in its draft and
 * write it back on save with no control to set it, which silently stamped the
 * household default onto any brew whose water type was blank.
 */
export function WaterTypeRow({ value, onChange, waters }: WaterTypeRowProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "flex", alignItems: "center", gap: 12, width: "100%",
          padding: "11px 0", background: "none", border: "none",
          cursor: "pointer", color: "var(--ink)", textAlign: "left",
        }}
      >
        <span className="label" style={{ flex: 1 }}>Water</span>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{value || "—"}</span>
        <Icon name="chev" size={16} stroke={1.8} style={{ color: "var(--ink-faint)" }} />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)}>
        <div className="screen-pad" style={{ paddingTop: 6, paddingBottom: 8 }}>
          <div className="label" style={{ marginBottom: 6 }}>Water</div>
          {waters.map((w) => (
            <button
              key={w}
              onClick={() => { onChange(w); setOpen(false); }}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                width: "100%", padding: "14px 2px", background: "none", border: "none",
                borderBottom: "1px solid var(--line)", cursor: "pointer",
                color: "var(--ink)", fontSize: 16, fontWeight: 600, fontFamily: "var(--font-ui)",
              }}
            >
              {w}
              {value === w && <Icon name="check" size={18} stroke={2} style={{ color: "var(--accent)" }} />}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}

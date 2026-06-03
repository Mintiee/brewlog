"use client";
import { Icon } from "@/components/ui/Icon";

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  highlight?: boolean;
}

export function Field({ label, value, onChange, placeholder, highlight }: FieldProps) {
  const filled = (value || "").toString().trim().length > 0;
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <div className="label" style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 6, color: highlight && !filled ? "var(--accent)" : "var(--ink-faint)" }}>
        {label}
        {highlight && !filled && <span style={{ fontSize: 9, color: "var(--accent)" }}>· needs you</span>}
        {highlight && filled && <span style={{ color: "var(--good)", display: "inline-flex" }}><Icon name="check" size={11} stroke={2.4} /></span>}
      </div>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{
        width: "100%", padding: "12px 14px", borderRadius: 13, background: "var(--surface)",
        border: highlight && !filled ? "1px solid var(--accent)" : "1px solid var(--line)", color: "var(--ink)", fontFamily: "var(--font-ui)", fontSize: 15.5, outline: "none",
        boxShadow: highlight && !filled ? "0 0 0 3px var(--accent-soft)" : "none",
        boxSizing: "border-box",
      }} />
    </label>
  );
}

"use client";

/* Shared Settings form controls — section wrapper, text input, labelled row, toggle. */

export function SSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div className="label" style={{ marginBottom: 11 }}>{label}</div>
      {children}
    </div>
  );
}

export function SText({
  value,
  onChange,
  placeholder,
  mono,
  type,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  type?: string;
}) {
  return (
    <input
      value={value}
      type={type || "text"}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%",
        padding: "12px 14px",
        borderRadius: 13,
        background: "var(--surface)",
        border: "1px solid var(--line)",
        color: "var(--ink)",
        outline: "none",
        fontFamily: mono ? "var(--font-mono)" : "var(--font-ui)",
        fontSize: 16,
        boxSizing: "border-box",
      }}
    />
  );
}

export function SRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 0" }}>
      <span style={{ fontSize: 15, fontWeight: 500 }}>{label}</span>
      {children}
    </div>
  );
}

export function SToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      style={{
        width: 50,
        height: 30,
        borderRadius: 15,
        border: "none",
        cursor: "pointer",
        position: "relative",
        background: on ? "var(--accent)" : "var(--surface-3)",
        transition: "background .18s ease",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: on ? 23 : 3,
          width: 24,
          height: 24,
          borderRadius: "50%",
          background: "#fff",
          transition: "left .18s ease",
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
        }}
      />
    </button>
  );
}

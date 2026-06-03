"use client";

interface Scale5Props {
  label: string;
  value: number;  // 0 = unset, 1-5
  onChange: (n: number) => void;
  lowTag?: string;
  highTag?: string;
}

export function Scale5({ label, value, onChange, lowTag, highTag }: Scale5Props) {
  const descriptor = !value
    ? `${lowTag}–${highTag}`
    : value <= 2 ? lowTag
    : value >= 4 ? highTag
    : `${lowTag}–${highTag}`;

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "11px 0" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600 }}>{label}</div>
        {(lowTag || highTag) && (
          <div className="label" style={{ fontSize: 9, marginTop: 2 }}>{descriptor}</div>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            className="pip"
            onClick={() => onChange(n === value ? 0 : n)}
            style={{
              width: 22, height: 22, borderRadius: 7, border: "none", cursor: "pointer", padding: 0,
              background: n <= value ? "var(--accent)" : "var(--surface-3)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

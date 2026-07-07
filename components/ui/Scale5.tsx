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
          // Hit area is widened past the 22px pip with a matching negative margin so
          // the row footprint is unchanged. Horizontal padding is capped at 3px (28px
          // wide) so neighbouring hit areas meet at the midpoint of the 6px gap without
          // overlapping and swallowing each other's taps; vertical padding goes further
          // (44px tall) since nothing else constrains it there.
          <button
            key={n}
            aria-label={`${n}`}
            onClick={() => onChange(n === value ? 0 : n)}
            style={{
              width: 28, height: 44, margin: "-11px -3px", border: "none", cursor: "pointer",
              padding: 0, background: "none", display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <span className="pip" style={{
              width: 22, height: 22, borderRadius: 7,
              background: n <= value ? "var(--accent)" : "var(--surface-3)",
            }} />
          </button>
        ))}
      </div>
    </div>
  );
}

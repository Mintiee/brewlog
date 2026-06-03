"use client";

interface SegmentedProps<T> {
  options: T[];
  value: string;
  onChange: (v: string) => void;
  getKey?: (o: T) => string;
  getLabel?: (o: T) => string;
}

export function Segmented<T>({ options, value, onChange, getKey = (o) => String(o), getLabel = (o) => String(o) }: SegmentedProps<T>) {
  return (
    <div style={{
      display: "flex", gap: 6, background: "var(--surface-2)", padding: 5,
      borderRadius: 15, border: "1px solid var(--line)",
    }}>
      {options.map((o) => {
        const k = getKey(o);
        const on = k === value;
        return (
          <button key={k} onClick={() => onChange(k)} style={{
            flex: 1, padding: "9px 4px", borderRadius: 11, border: "none", cursor: "pointer",
            fontFamily: "var(--font-ui)", fontSize: 13.5, fontWeight: on ? 600 : 500,
            background: on ? "var(--ink)" : "transparent",
            color: on ? "var(--bg)" : "var(--ink-dim)",
            transition: "all .15s ease", whiteSpace: "nowrap",
          }}>{getLabel(o)}</button>
        );
      })}
    </div>
  );
}

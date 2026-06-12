"use client";
import { Field } from "@/components/shelf/Field";

interface SuggestFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  highlight?: boolean;
  /** Existing values to offer while typing (already filtered by the caller). */
  suggestions: string[];
}

/** Field with a chip row of existing values beneath it — tapping one adopts
 *  that spelling. Inline chips (not a dropdown) so it stacks safely inside
 *  sheets without z-index games. */
export function SuggestField({ label, value, onChange, placeholder, highlight, suggestions }: SuggestFieldProps) {
  return (
    <div>
      <Field label={label} value={value} onChange={onChange} placeholder={placeholder} highlight={highlight} />
      {suggestions.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: -4, marginBottom: 12 }}>
          <span className="label" style={{ alignSelf: "center" }}>on your shelf:</span>
          {suggestions.map((s) => (
            <button key={s} type="button" className="chip" onClick={() => onChange(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

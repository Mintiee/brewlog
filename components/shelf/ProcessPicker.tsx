"use client";
import { Segmented } from "@/components/ui/Segmented";

interface ProcessPickerProps {
  value: string;
  onChange: (v: string) => void;
}

const COMMON = ["Washed", "Natural"];

/**
 * Washed / Natural quick-picks plus an "Other" mode that reveals a free-text
 * field for anything uncommon (Honey, Anaerobic, Carbonic Maceration, …).
 * The parent supplies the "Process" label; this renders just the control.
 */
export function ProcessPicker({ value, onChange }: ProcessPickerProps) {
  const isOther = !COMMON.includes(value);
  const seg = isOther ? "Other" : value;

  function pick(choice: string) {
    if (choice === "Other") {
      if (!isOther) onChange(""); // entering Other mode — start with an empty field
    } else {
      onChange(choice);
    }
  }

  return (
    <div>
      <Segmented options={["Washed", "Natural", "Other"]} value={seg} onChange={pick} />
      {isOther && (
        <input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. Anaerobic Natural, Carbonic Maceration"
          style={{
            width: "100%", marginTop: 8, padding: "11px 14px", borderRadius: 13,
            background: "var(--surface)", border: "1px solid var(--line)", color: "var(--ink)",
            fontFamily: "var(--font-ui)", fontSize: 16, outline: "none", boxSizing: "border-box",
          }}
        />
      )}
    </div>
  );
}

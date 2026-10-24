"use client";

interface ScreenHeaderProps {
  /** Small mono line above the title — counts, status. */
  eyebrow: React.ReactNode;
  title: string;
  /** Round icon buttons, vertically centred on the title. */
  actions?: React.ReactNode;
}

/** Standard top-of-tab header: eyebrow, big title, optional actions on the title row. */
export function ScreenHeader({ eyebrow, title, actions }: ScreenHeaderProps) {
  return (
    <div className="screen-pad" style={{ paddingTop: 8, marginBottom: 18 }}>
      <div className="label" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{eyebrow}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 3, minHeight: 40 }}>
        <h1 className="h-ask">{title}</h1>
        {actions && <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>{actions}</div>}
      </div>
    </div>
  );
}

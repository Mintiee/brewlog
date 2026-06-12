"use client";
import { Icon } from "./Icon";

interface EmptyStateProps {
  icon: string;
  title: string;
  body?: string;
  /** Optional call-to-action (e.g. an "Add a coffee" button). */
  children?: React.ReactNode;
  iconSize?: number;
  titleSize?: number;
  /** Vertical/horizontal padding override, e.g. "50px 16px". */
  pad?: string;
}

/** Centered ghost-icon empty state used by Shelf / Log / pickers. */
export function EmptyState({ icon, title, body, children, iconSize = 44, titleSize = 16, pad = "50px 16px" }: EmptyStateProps) {
  return (
    <div style={{ textAlign: "center", padding: pad, color: "var(--ink-dim)" }}>
      <div style={{ color: "var(--ink-ghost)", display: "flex", justifyContent: "center", marginBottom: 12 }}>
        <Icon name={icon} size={iconSize} stroke={1.3} />
      </div>
      <div style={{ fontSize: titleSize, fontWeight: 600, color: "var(--ink)" }}>{title}</div>
      {body && <div style={{ fontSize: 13.5, marginTop: 6, lineHeight: 1.5 }}>{body}</div>}
      {children}
    </div>
  );
}

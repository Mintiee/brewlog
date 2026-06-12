"use client";
import { IconButton } from "./IconButton";

interface SheetHeaderProps {
  title: string;
  onClose: () => void;
  closeLabel?: string;
}

/** Standard sheet title row: h2 + round close button. */
export function SheetHeader({ title, onClose, closeLabel = "Close" }: SheetHeaderProps) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
      <h2 style={{ fontSize: 21, fontWeight: 600, letterSpacing: "-0.01em" }}>{title}</h2>
      <IconButton icon="close" label={closeLabel} onClick={onClose} />
    </div>
  );
}

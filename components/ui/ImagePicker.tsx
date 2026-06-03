"use client";
import { useRef, useState } from "react";
import { Icon } from "./Icon";

interface ImagePickerProps {
  onFile: (file: File, dataUrl: string) => void;
  preview?: string;
  height?: number;
}

const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/avif"];

export function ImagePicker({ onFile, preview, height = 200 }: ImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [err, setErr] = useState("");

  async function ingest(file: File) {
    setErr("");
    if (!ACCEPT.includes(file.type)) { setErr("Drop a PNG, JPEG, WebP, or AVIF image."); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      onFile(file, url);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div
      style={{
        position: "relative", width: "100%", height,
        borderRadius: 20, overflow: "hidden",
        border: `1.5px dashed ${over ? "var(--accent)" : "var(--line-2)"}`,
        background: over ? "var(--accent-soft)" : "var(--surface)",
        transition: "border-color .14s, background .14s",
        cursor: "pointer",
      }}
      onDragEnter={(e) => { e.preventDefault(); setOver(true); }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault(); setOver(false);
        const f = e.dataTransfer.files[0];
        if (f) ingest(f);
      }}
      onClick={() => inputRef.current?.click()}
    >
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Bag preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <span style={{ color: "var(--ink-ghost)" }}><Icon name="camera" size={36} stroke={1.4} /></span>
          <span style={{ fontWeight: 500, fontSize: 13.5, color: "var(--ink-dim)" }}>Drop a bag photo</span>
          <span style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>or <u style={{ textUnderlineOffset: 2 }}>browse files</u></span>
        </div>
      )}
      {err && (
        <div style={{ position: "absolute", left: 8, bottom: 8, right: 8, background: "rgba(20,10,4,0.85)", color: "#c9755f", fontSize: 11, padding: "4px 8px", borderRadius: 6 }}>{err}</div>
      )}
      <input ref={inputRef} type="file" accept={ACCEPT.join(",")} hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) ingest(f); e.target.value = ""; }} />
    </div>
  );
}

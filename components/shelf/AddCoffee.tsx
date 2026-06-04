"use client";
import { useState, useEffect } from "react";
import { originCode } from "@/lib/domain";
import { noteColor } from "@/lib/flavour";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { Segmented } from "@/components/ui/Segmented";
import { ImagePicker } from "@/components/ui/ImagePicker";
import { Field } from "./Field";
import type { Coffee } from "@/lib/types";

type Phase = "capture" | "scanning" | "review";
type Source = "photo" | "url" | "manual";

interface ReviewForm {
  roaster: string;
  name: string;
  origin: string;
  region: string;
  varietal: string;
  process: string;
  roast: string;
  roastedAt: string;        // ISO YYYY-MM-DD; defaults to today
  needsRoastDate: boolean;
  notes: string;
}

/** Local YYYY-MM-DD (not UTC) so the date picker matches the device's "today". */
function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** N days ago as local YYYY-MM-DD. */
function daysAgoIso(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface AddCoffeeProps {
  open: boolean;
  onClose: () => void;
  onAdd: (c: Coffee) => void;
  llmEnabled: boolean;
}

const ROAST_LEVELS = ["light", "medium-light", "medium", "medium-dark", "dark"];

export function AddCoffee({ open, onClose, onAdd, llmEnabled }: AddCoffeeProps) {
  const [phase, setPhase] = useState<Phase>(llmEnabled ? "capture" : "review");
  const [form, setForm] = useState<ReviewForm | null>(null);
  const [scanPct, setScanPct] = useState(0);
  const [url, setUrl] = useState("");
  const [source, setSource] = useState<Source>("photo");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (open) {
      if (llmEnabled) {
        setPhase("capture");
        setForm(null);
      } else {
        setPhase("review");
        setForm({ roaster: "", name: "", origin: "", region: "", varietal: "", process: "Washed", roast: "light", roastedAt: todayIso(), needsRoastDate: false, notes: "" });
        setSource("manual");
      }
      setScanPct(0);
      setUrl("");
      setPhotoDataUrl(undefined);
    }
  }, [open, llmEnabled]);

  async function runScan(fromUrl: boolean) {
    setSource(fromUrl ? "url" : "photo");
    setPhase("scanning");
    setScanPct(0);
    const tick = setInterval(() => setScanPct((p) => Math.min(95, p + 6 + Math.random() * 8)), 140);
    let data: Partial<ReviewForm> | null = null;
    try {
      const body = fromUrl
        ? JSON.stringify({ url: url.trim() })
        : JSON.stringify({ image: photoDataUrl });
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (res.ok) {
        data = await res.json();
      }
    } catch {
      data = null;
    }
    clearInterval(tick);
    setScanPct(100);
    setTimeout(() => {
      if (!data || !data.roaster) {
        // fall through to manual entry
        setForm({ roaster: "", name: "", origin: "", region: "", varietal: "", process: "Washed", roast: "light", roastedAt: todayIso(), needsRoastDate: false, notes: "" });
        setSource("manual");
      } else {
        const notes = Array.isArray((data as any).notes) ? (data as any).notes : [];
        const scannedDaysAgo = (data as any).roastDaysAgo;
        setForm({
          roaster: (data as any).roaster || "",
          name: (data as any).name || "",
          origin: (data as any).origin || "",
          region: (data as any).region || "",
          varietal: (data as any).varietal || "",
          process: (data as any).process || "Washed",
          roast: ROAST_LEVELS.includes((data as any).roast) ? (data as any).roast : "light",
          // A link rarely carries the roast date → default to today and flag for the user.
          roastedAt: fromUrl ? todayIso() : daysAgoIso(scannedDaysAgo != null ? Number(scannedDaysAgo) : 4),
          needsRoastDate: !!fromUrl,
          notes: notes.join(", "),
        });
      }
      setPhase("review");
    }, 420);
  }

  function startManual() {
    setSource("manual");
    setForm({ roaster: "", name: "", origin: "", region: "", varietal: "", process: "Washed", roast: "light", roastedAt: todayIso(), needsRoastDate: false, notes: "" });
    setPhase("review");
  }

  function commit() {
    if (!form) return;
    const notes = form.notes ? form.notes.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const roasted_at = form.roastedAt || todayIso();
    const c: Coffee = {
      id: crypto.randomUUID(),
      roaster: form.roaster || "Unknown",
      name: form.name || "Untitled",
      origin: form.origin || "—",
      region: form.region || form.origin || "—",
      varietal: form.varietal || "—",
      process: (form.process || "Washed") as Coffee["process"],
      roast: "light",
      roasted_at,
      rest_days: 28,
      peak_days: 56,
      grams: 250,
      frozen_grams: 0,
      archived: false,
      notes,
      color: notes[0] ? noteColor(notes[0]) : "#cf9a5a",
      cc: originCode(form.origin),
    };
    onAdd(c);
    onClose();
  }

  const set = (k: keyof ReviewForm) => (v: string | number) =>
    setForm((f) => f ? { ...f, [k]: v } : f);

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="screen-pad" style={{ paddingTop: 6, minHeight: 420 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h2 style={{ fontSize: 21, fontWeight: 600, letterSpacing: "-0.01em" }}>
            {phase === "review" ? "Confirm details" : "Add a coffee"}
          </h2>
          <button onClick={onClose} style={{ background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: "50%", width: 34, height: 34, color: "var(--ink-dim)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="close" size={18} stroke={1.9} />
          </button>
        </div>

        {phase === "capture" && (
          <div>
            <div style={{ position: "relative" }}>
              <ImagePicker
                onFile={(_file, dataUrl) => setPhotoDataUrl(dataUrl)}
                preview={photoDataUrl}
                height={200}
              />
            </div>
            <button className="btn btn-accent" style={{ marginTop: 14 }} onClick={() => runScan(false)}>
              <Icon name="camera" size={21} stroke={1.7} /> Scan bag
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 9, margin: "16px 2px 14px", color: "var(--ink-faint)" }}>
              <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
              <span className="label">or paste a link</span>
              <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
            </div>
            <div style={{ display: "flex", gap: 9 }}>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="roaster.com/shop/…"
                inputMode="url"
                style={{
                  flex: 1, minWidth: 0, padding: "0 14px", height: 52, borderRadius: 13,
                  background: "var(--surface)", border: "1px solid var(--line)",
                  color: "var(--ink)", fontFamily: "var(--font-ui)", fontSize: 15, outline: "none",
                }}
              />
              <button
                className="btn"
                onClick={() => runScan(true)}
                disabled={!url.trim()}
                style={{
                  background: url.trim() ? "var(--ink)" : "var(--surface-2)",
                  color: url.trim() ? "var(--bg)" : "var(--ink-faint)",
                  width: 52, height: 52, borderRadius: 13, flexShrink: 0, border: "1px solid var(--line)",
                }}
              >
                <Icon name="chev" size={20} stroke={2} />
              </button>
            </div>

            <button className="btn btn-ghost" style={{ marginTop: 16, width: "100%" }} onClick={startManual}>Enter manually</button>

            <div style={{ display: "flex", gap: 8, marginTop: 14, color: "var(--ink-faint)", fontSize: 12.5, lineHeight: 1.5 }}>
              <Icon name="spark" size={15} stroke={1.6} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Snap the bag or paste a product link — roaster, origin, varietal &amp; process fill in for you. (A link won&apos;t have the roast date, so you&apos;ll add that.)</span>
            </div>
          </div>
        )}

        {phase === "scanning" && (
          <div style={{ padding: "30px 0 50px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ position: "relative", width: 150, height: 188, borderRadius: 16, background: "var(--surface-2)", border: "1px solid var(--line)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "var(--ink-ghost)" }}><Icon name={source === "url" ? "log" : "shelf"} size={56} stroke={1.3} /></span>
              <div style={{ position: "absolute", left: 0, right: 0, height: 3, background: "var(--accent)", boxShadow: "0 0 16px 3px var(--accent)", top: `${scanPct}%`, transition: "top .14s linear" }} />
            </div>
            <div className="num" style={{ fontSize: 15, color: "var(--accent)", marginTop: 22, fontWeight: 600 }}>
              {source === "url" ? "Reading page" : "Reading bag"}… {Math.round(scanPct)}%
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink-faint)", marginTop: 6 }}>Extracting roaster, origin &amp; process</div>
          </div>
        )}

        {phase === "review" && form && (() => {
          const missing = {
            roaster: !(form.roaster || "").trim(),
            name: !(form.name || "").trim(),
            origin: !(form.origin || "").trim(),
            roast: !!form.needsRoastDate,
          };
          const missingCount = Object.values(missing).filter(Boolean).length;
          const fromSrc = source === "url" ? "the link" : source === "photo" ? "the bag" : null;
          return (
            <div>
              {!llmEnabled && (
                <div style={{ display: "flex", gap: 8, marginBottom: 16, padding: "10px 13px", borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--ink-faint)", fontSize: 12.5 }}>
                  <Icon name="key" size={15} stroke={1.6} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>Add an AI key in Settings to scan bags &amp; links</span>
                </div>
              )}
              {source !== "manual" && (
                <div style={{ display: "flex", gap: 11, alignItems: "flex-start", marginBottom: 18, padding: 13, borderRadius: 14, background: missingCount ? "var(--accent-soft)" : "var(--surface)", border: `1px solid ${missingCount ? "var(--accent)" : "var(--line)"}` }}>
                  <span style={{ color: missingCount ? "var(--accent)" : "var(--good)", flexShrink: 0, marginTop: 1 }}>
                    <Icon name={missingCount ? "spark" : "check"} size={17} stroke={1.8} />
                  </span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{missingCount ? `Got most of it from ${fromSrc}` : `Read it all from ${fromSrc}`}</div>
                    <div style={{ fontSize: 12.5, color: "var(--ink-dim)", marginTop: 2, lineHeight: 1.45 }}>
                      {missingCount
                        ? `Just ${missingCount} ${missingCount === 1 ? "thing" : "things"} to fill in — they're highlighted below.`
                        : "Looks right? Tap any field to tweak it."}
                    </div>
                  </div>
                </div>
              )}
              <Field label="Roaster" value={form.roaster} onChange={set("roaster")} placeholder="Roaster" highlight={source !== "manual"} />
              <Field label="Coffee" value={form.name} onChange={set("name")} placeholder="Name / lot" highlight={source !== "manual"} />
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}><Field label="Origin" value={form.origin} onChange={set("origin")} placeholder="Country" highlight={source !== "manual"} /></div>
                <div style={{ flex: 1.3 }}><Field label="Region" value={form.region} onChange={set("region")} placeholder="Region" /></div>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}><Field label="Varietal" value={form.varietal} onChange={set("varietal")} placeholder="Varietal" /></div>
                <div style={{ flex: 1 }}>
                  <div className="label" style={{ marginBottom: 6 }}>Process</div>
                  <Segmented options={["Washed", "Natural", "Honey"]} value={form.process} onChange={set("process")} />
                </div>
              </div>
              <div style={{
                marginBottom: 12,
                padding: missing.roast ? "2px 14px 8px" : 0,
                borderRadius: 14,
                border: missing.roast ? "1px solid var(--accent)" : "none",
                background: missing.roast ? "var(--accent-soft)" : "transparent",
                boxShadow: missing.roast ? "0 0 0 3px var(--accent-soft)" : "none",
              }}>
                <div className="label" style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon name="timer" size={13} stroke={1.8} /> {missing.roast ? "Roasted · needs you" : "Roast date"}
                </div>
                <input
                  type="date"
                  value={form.roastedAt}
                  max={todayIso()}
                  onChange={(e) => setForm((f) => f ? { ...f, roastedAt: e.target.value, needsRoastDate: false } : f)}
                  style={{
                    width: "100%", padding: "12px 14px", borderRadius: 13,
                    background: "var(--surface)", border: "1px solid var(--line)",
                    color: "var(--ink)", outline: "none",
                    fontFamily: "var(--font-mono)", fontSize: 15, boxSizing: "border-box",
                  }}
                />
                {missing.roast && (
                  <div style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--accent)", fontSize: 12, fontWeight: 600, marginTop: -2 }}>
                    <Icon name="timer" size={14} stroke={1.8} /> Not on {fromSrc} — set your roast date
                  </div>
                )}
              </div>
              <Field label="Tasting notes" value={form.notes} onChange={set("notes")} placeholder="comma, separated" />
              <button
                className="btn btn-accent"
                style={{ marginTop: 8, opacity: missingCount ? 0.5 : 1 }}
                disabled={!!missingCount}
                onClick={commit}
              >
                <Icon name={missingCount ? "spark" : "plus"} size={20} stroke={2} />
                {missingCount ? `${missingCount} to fill in` : "Add to shelf"}
              </button>
            </div>
          );
        })()}
      </div>
    </Sheet>
  );
}

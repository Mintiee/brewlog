"use client";
import { useState, useEffect, useMemo } from "react";
import { todayISO, daysAgoISO, roasterSuggestions } from "@/lib/domain";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { SheetHeader } from "@/components/ui/SheetHeader";
import { ProcessPicker } from "./ProcessPicker";
import { ImagePicker } from "@/components/ui/ImagePicker";
import { Field } from "./Field";
import { SuggestField } from "@/components/ui/SuggestField";
import { Stepper } from "@/components/ui/Stepper";
import { ROAST_ENUM, toCoffee } from "@/lib/import/materialize";
import type { ImportedCoffee } from "@/lib/import/types";
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
  grams: number;            // bag size; 250 is a real default, never "blank"
  notes: string;
}

/** All four entry points (open, clear, scan failure, manual) start here, so the
 *  defaults can't drift apart. A function, not a const: todayISO() must be read
 *  when the form opens, not once at module load. */
function blankForm(): ReviewForm {
  return {
    roaster: "", name: "", origin: "", region: "", varietal: "", process: "Washed",
    roast: "light", roastedAt: todayISO(), needsRoastDate: false, grams: 250, notes: "",
  };
}

interface AddCoffeeProps {
  open: boolean;
  onClose: () => void;
  onAdd: (c: Coffee) => void;
  llmEnabled: boolean;
  /** Existing shelf — used to suggest and canonicalise roaster names. */
  coffees?: Coffee[];
}

// A scan/manual entry in progress is thrown away today if the sheet closes and
// reopens (e.g. backgrounding mid-scan, or a fat-fingered close). Persist the
// review-phase draft (and its source) to sessionStorage so it survives that —
// cleared on a successful save or an explicit "Clear" from the restored banner.
// v2: ReviewForm gained `grams`, and a v1 draft would restore it as undefined
// straight into the Stepper. Bumping the key retires those drafts instead.
const DRAFT_KEY = "addcoffee:draft:v2";

/** Coalesce per-keystroke draft writes. */
const DRAFT_DEBOUNCE_MS = 300;

interface AddCoffeeDraft {
  form: ReviewForm;
  source: Source;
}

function loadDraft(): AddCoffeeDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AddCoffeeDraft;
  } catch {
    return null;
  }
}

function saveDraft(draft: AddCoffeeDraft) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // best-effort — private mode etc.
  }
}

function clearDraftStorage() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // best-effort
  }
}

export function AddCoffee({ open, onClose, onAdd, llmEnabled, coffees = [] }: AddCoffeeProps) {
  const [phase, setPhase] = useState<Phase>(llmEnabled ? "capture" : "review");
  const [form, setForm] = useState<ReviewForm | null>(null);
  const [scanPct, setScanPct] = useState(0);
  const [url, setUrl] = useState("");
  const [source, setSource] = useState<Source>("photo");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | undefined>(undefined);
  const [draftRestored, setDraftRestored] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const draft = loadDraft();
      if (draft) {
        setForm(draft.form);
        setSource(draft.source);
        setPhase("review");
        setDraftRestored(true);
      } else if (llmEnabled) {
        setPhase("capture");
        setForm(null);
        setDraftRestored(false);
      } else {
        setPhase("review");
        setForm(blankForm());
        setSource("manual");
        setDraftRestored(false);
      }
      setScanPct(0);
      setUrl("");
      setPhotoDataUrl(undefined);
      setScanError(null);
    }
  }, [open, llmEnabled]);

  // Persist the review-phase draft as it's edited.
  //
  // Debounced: saveDraft is JSON.stringify + a synchronous sessionStorage write, and
  // this effect runs on every keystroke in every field. Storage writes block the main
  // thread, so typing a roaster name used to pay one per character. The cleanup also
  // flushes on unmount/close, so nothing is lost by waiting.
  useEffect(() => {
    if (phase !== "review" || !form) return;
    const draft = { form, source };
    const t = setTimeout(() => saveDraft(draft), DRAFT_DEBOUNCE_MS);
    return () => { clearTimeout(t); saveDraft(draft); };
  }, [phase, form, source]);

  // roasterSuggestions -> distinctRoasters builds a nested Map over every coffee from
  // scratch on each call, and this sat inline in the JSX — so it re-ran on every
  // render of the form, i.e. every keystroke in every field, not just the roaster one.
  const roasterOptions = useMemo(
    () => (form ? roasterSuggestions(form.roaster, coffees) : []),
    [form, coffees],
  );

  function clearDraft() {
    clearDraftStorage();
    setDraftRestored(false);
    setScanError(null);
    if (llmEnabled) {
      setPhase("capture");
      setForm(null);
    } else {
      setPhase("review");
      setForm(blankForm());
      setSource("manual");
    }
  }

  // `dataUrl` is passed in rather than read from state: the photo scan starts in the
  // same tick as setPhotoDataUrl, and reading the state there would send `{ image:
  // undefined }` — a 400 from /api/extract that used to surface as a blank form.
  async function runScan(fromUrl: boolean, dataUrl?: string) {
    setSource(fromUrl ? "url" : "photo");
    setScanError(null);
    setPhase("scanning");
    setScanPct(0);
    const tick = setInterval(() => setScanPct((p) => Math.min(95, p + 6 + Math.random() * 8)), 140);
    let data: Partial<ReviewForm> | null = null;
    try {
      const body = fromUrl
        ? JSON.stringify({ url: url.trim() })
        : JSON.stringify({ image: dataUrl });
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
    // Just long enough for the scan line to finish travelling to 100% — its transition
    // is `top .14s linear` (see the scanPct style below), so this matches the animation
    // rather than padding it. It used to be 420ms, i.e. 3x the animation, which was
    // dead time bolted onto the end of a request the user had already waited on.
    setTimeout(() => {
      if (!data || !data.roaster) {
        // Fall through to manual entry, but say so. Source becomes "manual" on
        // purpose: nothing was read, so the "Got most of it from the bag" banner
        // and the scanned-field highlights would both be lying. The error banner
        // below is gated on scanError alone, so it survives that switch.
        setForm(blankForm());
        setSource("manual");
        setScanError(fromUrl
          ? "Couldn't read that link — fill it in below"
          : "Couldn't read that bag — fill it in below");
      } else {
        const notes = Array.isArray((data as any).notes) ? (data as any).notes : [];
        const scannedDaysAgo = (data as any).roastDaysAgo;
        setForm({
          // Spread the blank first so fields a scan never returns (bag size) keep
          // their default rather than being forgotten when ReviewForm grows.
          ...blankForm(),
          roaster: (data as any).roaster || "",
          name: (data as any).name || "",
          origin: (data as any).origin || "",
          region: (data as any).region || "",
          varietal: Array.isArray((data as any).varietals)
            ? (data as any).varietals.filter(Boolean).join(", ")
            : ((data as any).varietal || ""),
          process: (data as any).process || "Washed",
          roast: ROAST_ENUM.includes((data as any).roast) ? (data as any).roast : "light",
          // A link rarely carries the roast date → default to today and flag for the user.
          roastedAt: fromUrl ? todayISO() : daysAgoISO(scannedDaysAgo != null ? Number(scannedDaysAgo) : 4),
          needsRoastDate: !!fromUrl,
          notes: notes.join(", "),
        });
      }
      setPhase("review");
    }, 140);
  }

  function startManual() {
    setSource("manual");
    setForm(blankForm());
    setPhase("review");
  }

  function commit() {
    if (!form) return;
    const notes = form.notes ? form.notes.split(",").map((s) => s.trim()).filter(Boolean) : [];
    // Hand the entered fields to the shared create path rather than assembling a
    // Coffee here — toCoffee owns canonicalRoaster, parseVarietals, originCode and
    // the rest/peak defaults, and this used to be a copy of it that drifted.
    const imported: ImportedCoffee = {
      roaster: form.roaster,
      name: form.name,
      origin: form.origin,
      region: form.region,
      varietal: form.varietal,
      process: form.process,
      roast: form.roast,
      roasted_at: form.roastedAt || todayISO(),
      grams: form.grams,
      notes,
    };
    onAdd(toCoffee(imported, coffees));
    clearDraftStorage();
    setDraftRestored(false);
    onClose();
  }

  const set = (k: keyof ReviewForm) => (v: string | number) =>
    setForm((f) => f ? { ...f, [k]: v } : f);

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="screen-pad" style={{ paddingTop: 6, minHeight: 420 }}>
        <SheetHeader title={phase === "review" ? "Confirm details" : "Add a coffee"} onClose={onClose} />

        {phase === "capture" && (
          <div>
            <div style={{ position: "relative" }}>
              <ImagePicker
                // Picking the photo *is* the scan — there's nothing to confirm in
                // between, and the old "Scan bag" button could be tapped with no
                // photo at all, POSTing an empty body for a 400 and a blank form.
                onFile={(_file, dataUrl) => { setPhotoDataUrl(dataUrl); runScan(false, dataUrl); }}
                preview={photoDataUrl}
                height={200}
              />
            </div>

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
                  color: "var(--ink)", fontFamily: "var(--font-ui)", fontSize: 16, outline: "none",
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
              <span>Add a bag photo and it reads itself — roaster, origin, varietal &amp; process fill in for you. A product link works too, but won&apos;t have the roast date, so you&apos;ll add that.</span>
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
              {scanError && (
                <div style={{ display: "flex", gap: 11, alignItems: "flex-start", marginBottom: 16, padding: 13, borderRadius: 14, background: "var(--accent-soft)", border: "1px solid var(--accent)" }}>
                  <span style={{ color: "var(--accent)", flexShrink: 0, marginTop: 1 }}>
                    <Icon name="spark" size={17} stroke={1.8} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{scanError}</div>
                    <button
                      // Without a way back to capture, one bad photo (or a link the
                      // page blocked) can only be escaped by closing the whole sheet.
                      onClick={() => { setPhase("capture"); setPhotoDataUrl(undefined); setScanError(null); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", fontFamily: "var(--font-ui)", fontSize: 12.5, fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 2, padding: 0, marginTop: 3 }}
                    >
                      Try another photo or link
                    </button>
                  </div>
                </div>
              )}
              {draftRestored && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 14, padding: "9px 13px", borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--ink-faint)", fontSize: 12.5 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Icon name="timer" size={14} stroke={1.6} /> Restored your unsaved draft
                  </span>
                  <button
                    onClick={clearDraft}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-faint)", fontFamily: "var(--font-ui)", fontSize: 12.5, fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 2, padding: 0 }}
                  >
                    Clear
                  </button>
                </div>
              )}
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
              <SuggestField
                label="Roaster"
                value={form.roaster}
                onChange={set("roaster")}
                placeholder="Roaster"
                highlight={source !== "manual"}
                suggestions={roasterOptions}
              />
              <Field label="Coffee" value={form.name} onChange={set("name")} placeholder="Name / lot" highlight={source !== "manual"} />
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}><Field label="Origin" value={form.origin} onChange={set("origin")} placeholder="Country" highlight={source !== "manual"} /></div>
                <div style={{ flex: 1.3 }}><Field label="Region" value={form.region} onChange={set("region")} placeholder="Region" /></div>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}><Field label="Varietal" value={form.varietal} onChange={set("varietal")} placeholder="Varietal" /></div>
                <div style={{ flex: 1 }}>
                  <div className="label" style={{ marginBottom: 6 }}>Process</div>
                  <ProcessPicker value={form.process} onChange={set("process")} />
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
                  max={todayISO()}
                  onChange={(e) => setForm((f) => f ? { ...f, roastedAt: e.target.value, needsRoastDate: false } : f)}
                  style={{
                    width: "100%", padding: "12px 14px", borderRadius: 13,
                    background: "var(--surface)", border: "1px solid var(--line)",
                    color: "var(--ink)", outline: "none",
                    fontFamily: "var(--font-mono)", fontSize: 16, boxSizing: "border-box",
                  }}
                />
                {missing.roast && (
                  <div style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--accent)", fontSize: 12, fontWeight: 600, marginTop: -2 }}>
                    <Icon name="timer" size={14} stroke={1.8} /> Not on {fromSrc} — set your roast date
                  </div>
                )}
              </div>
              <Stepper
                icon="scale"
                label="Bag size"
                value={form.grams}
                unit="g"
                step={25}
                min={0}
                max={2000}
                onChange={(v) => setForm((f) => f ? { ...f, grams: v } : f)}
              />
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

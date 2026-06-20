"use client";
import { useState, useCallback, useEffect } from "react";
import { AppProvider, useApp, type AppData } from "@/lib/store/AppContext";
import { rateBelongsTo } from "@/lib/domain";
import { Icon, Splash } from "@/components/ui";
import { BrewFlow } from "@/components/brew/BrewFlow";
import { Shelf } from "@/components/shelf/Shelf";
import { History } from "@/components/palate/History";
import { Settings } from "@/components/settings/Settings";
import type { Coffee } from "@/lib/types";

type Tab = "brew" | "shelf" | "palate" | "settings";

/** Minimum time the splash stays on screen once mounted (ms) — tune to taste. */
const SPLASH_FLOOR_MS = 1200;

const TABS = [
  { id: "brew" as Tab,   icon: "brew",  label: "Brew" },
  { id: "shelf" as Tab,  icon: "shelf", label: "Shelf" },
  { id: "palate" as Tab, icon: "log",   label: "Log" },
];

function TabBar({ active, onChange, pendingCount }: { active: Tab; onChange: (t: Tab) => void; pendingCount: number }) {
  return (
    <div style={{
      position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 40,
      background: "color-mix(in srgb, var(--bg) 82%, transparent)",
      backdropFilter: "blur(18px) saturate(160%)",
      WebkitBackdropFilter: "blur(18px) saturate(160%)",
      borderTop: "1px solid var(--line)",
    }}>
      {/* Icon row — fixed height, icons centered within it. Top padding gives the
          icons clearance from the bar's top border (the stack nearly fills --tab-h). */}
      <div style={{ minHeight: "var(--tab-h)", display: "flex", alignItems: "center", paddingTop: 6 }}>
        {TABS.map((t) => {
          const on = t.id === active;
          const badge = t.id === "brew" && pendingCount > 0 ? pendingCount : 0;
          return (
            <button key={t.id} onClick={() => onChange(t.id)} style={{
              flex: 1, background: "none", border: "none", cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              color: on ? "var(--ink)" : "var(--ink-faint)", transition: "color .15s ease",
            }}>
              <span
                className="tabicon"
                style={{ transform: on ? "translateY(-1px) scale(1.08)" : "none", lineHeight: 0, position: "relative" }}
              >
                <Icon name={t.icon} size={25} stroke={on ? 1.9 : 1.6} />
                {badge > 0 && (
                  <span style={{
                    position: "absolute", top: -5, right: -9, minWidth: 16, height: 16, padding: "0 4px",
                    borderRadius: 8, background: "var(--accent)", color: "#1a0f06",
                    fontSize: 10.5, fontWeight: 700, lineHeight: "16px", textAlign: "center",
                    fontFamily: "var(--font-ui)", boxShadow: "0 0 0 2px var(--bg)",
                  }}>{badge}</span>
                )}
              </span>
              <span style={{ fontSize: 10.5, fontWeight: on ? 600 : 500, letterSpacing: "0.01em" }}>{t.label}</span>
            </button>
          );
        })}
      </div>
      {/* Safe-area spacer — transparent so it shows the nav bar's single translucent
          + blurred background (an inherited bg would double the layer and look more opaque). */}
      <div style={{ height: "min(env(safe-area-inset-bottom, 0px), 8px)", background: "transparent" }} />
    </div>
  );
}

function Shell() {
  const { coffees, brews, config, profile, members, llmEnabled, ready, addCoffee, updateCoffee, setConfig, lastError, clearError, undoState } = useApp();
  const [tab, setTab] = useState<Tab>("brew");
  const [prevTab, setPrevTab] = useState<Tab>("brew");
  const [brewResetKey, setBrewResetKey] = useState(0);
  const [brewStart, setBrewStart] = useState<{ coffee: Coffee; nonce: number } | null>(null);
  const [brewStep, setBrewStep] = useState("what");

  // Only brews that are mine to rate — ones I logged (and haven't sent away) or
  // that were handed to me. Brews I sent to someone else drop off my badge.
  const pendingCount = brews.filter((b) => b.pending && !b.guest && rateBelongsTo(b, profile, members)).length;

  // Tabs are statically imported (instant, flicker-free switching). Render them
  // on the client only via this mounted gate: the data is seeded from server
  // props, but the tab UIs do date-relative rendering (e.g. the "Recently" strip
  // in StepWhat uses `new Date()`), so SSR-ing them would risk hydration
  // mismatches. Server output is the Splash — identical to loading.tsx.
  const [mounted, setMounted] = useState(false);
  // Minimum splash display so it reads as a deliberate splash, not a flash.
  // Data is usually already seeded, so without this the splash vanishes in ~1
  // frame. The clock starts at first client paint; total on-screen time is
  // server TTFB + this floor.
  const [floorDone, setFloorDone] = useState(false);
  useEffect(() => {
    setMounted(true);
    const t = setTimeout(() => setFloorDone(true), SPLASH_FLOOR_MS);
    return () => clearTimeout(t);
  }, []);

  const gotoTab = useCallback((t: Tab) => {
    if (t === "brew") setBrewResetKey((k) => k + 1);
    setTab(t);
  }, []);

  const openSettings = () => { setPrevTab(tab); setTab("settings"); };
  const closeSettings = () => setTab(prevTab || "brew");

  const brewThis = useCallback((coffee: Coffee) => {
    setBrewStart({ coffee, nonce: Date.now() });
    setTab("brew");
  }, []);

  const { llmEnabled: ctxLlmEnabled } = useApp();
  const [localLlmEnabled, setLocalLlmEnabled] = useState(ctxLlmEnabled);

  const handleSetAiKey = async (key: string) => {
    const res = await fetch("/api/ai-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Failed to save key"); }
    const { provider } = await res.json();
    setLocalLlmEnabled(true);
    return provider;
  };
  const handleRemoveAiKey = async () => {
    await fetch("/api/ai-key", { method: "DELETE" });
    setLocalLlmEnabled(false);
  };
  const effectiveLlmEnabled = localLlmEnabled || ctxLlmEnabled;

  const users = [profile];

  if (!ready || !mounted || !floorDone) {
    return <Splash />;
  }

  return (
    <div
      className="brew-root"
      style={{ position: "fixed", inset: 0, background: "var(--bg)" }}
    >
      {tab === "brew" && (
        <BrewFlow
          resetKey={brewResetKey}
          startCoffee={brewStart}
          onStep={setBrewStep}
          onGotoShelf={() => gotoTab("shelf")}
        />
      )}
      {tab === "shelf" && (
        <Shelf
          coffees={coffees}
          brews={brews}
          onAdd={addCoffee}
          onBrew={brewThis}
          onUpdate={updateCoffee}
          llmEnabled={effectiveLlmEnabled}
        />
      )}
      {tab === "palate" && (
        <History
          brews={brews}
          coffees={coffees}
          config={config}
          llmEnabled={effectiveLlmEnabled}
        />
      )}
      {tab === "settings" && (
        <Settings
          config={config}
          onConfig={setConfig}
          onClose={closeSettings}
          profile={profile}
          users={users}
          onSwitchUser={() => {}}
          onAddUser={() => {}}
          onRenameUser={() => {}}
          llmEnabled={effectiveLlmEnabled}
          onSetAiKey={handleSetAiKey}
          onRemoveAiKey={handleRemoveAiKey}
        />
      )}

      <TabBar active={tab} onChange={gotoTab} pendingCount={pendingCount} />

      {(lastError || undoState) && (
        <div style={{
          position: "absolute", bottom: "calc(var(--tab-h) + env(safe-area-inset-bottom, 0px) + 14px)",
          left: 16, right: 16, zIndex: 50,
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          {undoState && (
            <div style={{
              background: "var(--surface-2)", border: "1px solid var(--line)",
              color: "var(--ink)", borderRadius: 12, padding: "11px 14px",
              fontSize: 13, fontWeight: 500, lineHeight: 1.4,
              display: "flex", alignItems: "center", gap: 10,
              boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
            }}>
              <span style={{ flex: 1 }}>{undoState.message}</span>
              <button
                onClick={undoState.undo}
                style={{
                  background: "var(--accent-soft)", border: "none", cursor: "pointer", color: "var(--accent)",
                  borderRadius: 8, padding: "4px 12px", fontSize: 12.5, fontWeight: 700, flexShrink: 0,
                  fontFamily: "var(--font-ui)",
                }}
              >
                Undo
              </button>
            </div>
          )}
          {lastError && (
        <div style={{
          background: "color-mix(in srgb, var(--bad, #b65f4f) 92%, transparent)",
          color: "#fff", borderRadius: 12, padding: "11px 14px",
          fontSize: 13, fontWeight: 500, lineHeight: 1.4,
          display: "flex", alignItems: "flex-start", gap: 10,
          boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
        }}>
          <span style={{ flex: 1 }}>{lastError.message}</span>
          {lastError.retry && (
            <button
              onClick={lastError.retry}
              style={{
                background: "rgba(255,255,255,0.18)", border: "none", cursor: "pointer", color: "#fff",
                borderRadius: 8, padding: "3px 10px", fontSize: 12.5, fontWeight: 600, flexShrink: 0,
              }}
            >
              Retry
            </button>
          )}
          <button onClick={clearError} aria-label="Dismiss" style={{ background: "none", border: "none", cursor: "pointer", color: "#fff", lineHeight: 0, flexShrink: 0, marginTop: 1 }}>
            <Icon name="close" size={15} stroke={2} />
          </button>
        </div>
          )}
        </div>
      )}

      {tab === "brew" && brewStep === "what" && (
        <button
          onClick={openSettings}
          aria-label="Settings"
          style={{
            position: "absolute", top: 60, right: 16, zIndex: 45,
            width: 38, height: 38, borderRadius: "50%",
            background: "var(--surface)", color: "var(--ink-dim)",
            border: "1px solid var(--line)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
          }}
        >
          <Icon name="gear" size={19} stroke={1.8} />
        </button>
      )}

      {/* iOS ignores the manifest's portrait orientation, so we gate landscape
          on touch phones with a CSS-only overlay (see .rotate-lock in globals). */}
      <div className="rotate-lock" aria-hidden="true">
        <span className="rotate-lock-glyph">⟲</span>
        <div className="rotate-lock-title">Rotate to portrait</div>
        <div className="rotate-lock-sub">Brew is designed to be held upright.</div>
      </div>
    </div>
  );
}

export function AppShell({ initialData }: { initialData?: AppData }) {
  return (
    <AppProvider initialData={initialData}>
      <Shell />
    </AppProvider>
  );
}

"use client";
import { useState, useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { AppProvider, useApp, type AppData } from "@/lib/store/AppContext";
import { rateBelongsTo } from "@/lib/domain";
import { Icon, Splash } from "@/components/ui";
import { BrewFlow } from "@/components/brew/BrewFlow";
import { Shelf } from "@/components/shelf/Shelf";
import { History } from "@/components/palate/History";
import dynamic from "next/dynamic";
import type { Coffee } from "@/lib/types";

/**
 * Settings is a tab the user opens deliberately, and it transitively pulls in
 * ImportSheet -> lib/import/* -> papaparse (~45 KB) for a feature behind
 * Settings -> Import. Splitting it keeps all of that out of the initial download.
 * It's warmed on idle below, so the first open is still instant in practice.
 *
 * The three primary tabs stay statically imported on purpose — see the comment on
 * the mounted gate; switching between them must not flicker.
 */
const Settings = dynamic(() => import("@/components/settings/Settings").then((m) => m.Settings), {
  ssr: false,
  loading: () => <div className="screen" />,
});

type Tab = "brew" | "shelf" | "palate" | "settings";

/** No-op subscribe for the hydration probe below — the value can never change. */
const subscribeNever = () => () => {};

/**
 * Minimum time the splash stays on screen once mounted (ms).
 *
 * This is an anti-flash floor, not a brand moment. Data is normally already seeded
 * from the server, so without any floor the splash would vanish within a frame and
 * read as a flicker. It used to be 1200ms, which sat on top of server TTFB on every
 * single launch and was the app's largest single source of perceived slowness — it
 * also delayed every below-the-fold image request by the same amount, since the
 * `mounted` gate below keeps tab content (and therefore its <img> tags) out of the
 * DOM until the floor lifts.
 */
const SPLASH_FLOOR_MS = 300;

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
  const { coffees, brews, recipes, config, profile, members, llmEnabled, ready, addCoffee, updateCoffee, setConfig, updateRecipe, deleteRecipe, lastError, clearError, undoState, queuedCount, setAiKey, removeAiKey } = useApp();
  const [tab, setTab] = useState<Tab>("brew");
  const [prevTab, setPrevTab] = useState<Tab>("brew");
  const [brewResetKey, setBrewResetKey] = useState(0);
  const [brewStart, setBrewStart] = useState<{ coffee: Coffee; nonce: number } | null>(null);
  const [brewStep, setBrewStep] = useState("what");

  // Only brews that are mine to rate — ones I logged (and haven't sent away) or
  // that were handed to me. Brews I sent to someone else drop off my badge.
  // Memoised: this scans every brew, and Shell re-renders on any state change.
  const pendingCount = useMemo(
    () => brews.filter((b) => b.pending && !b.guest && rateBelongsTo(b, profile, members)).length,
    [brews, profile, members],
  );

  // The three primary tabs are statically imported (instant, flicker-free switching)
  // but rendered on the client only, via this gate: the data is seeded from server
  // props, yet the tab UIs do date-relative rendering (e.g. the "Recently" strip in
  // StepWhat uses `new Date()`), so SSR-ing them would risk hydration mismatches.
  // Server output is the Splash — identical to loading.tsx.
  //
  // This is the canonical useSyncExternalStore hydration probe: it never subscribes,
  // and simply reports false on the server and true on the client. It replaced a
  // useState flipped by setMounted(true) inside an effect — a cascading-render
  // anti-pattern that cost an extra render pass on every launch.
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);

  // See SPLASH_FLOOR_MS. The clock starts at first client paint, so total on-screen
  // splash time is server TTFB + this floor.
  const [floorDone, setFloorDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFloorDone(true), SPLASH_FLOOR_MS);
    return () => clearTimeout(t);
  }, []);

  // Warm the split chunks once the app is idle, so opening Settings doesn't wait on
  // a network round-trip. This only primes the module cache; it renders nothing.
  useEffect(() => {
    const warm = () => { void import("@/components/settings/Settings"); };
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    if (typeof w.requestIdleCallback === "function") { w.requestIdleCallback(warm); return; }
    const t = setTimeout(warm, 2000);
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
          llmEnabled={llmEnabled}
        />
      )}
      {tab === "palate" && (
        <History
          brews={brews}
          coffees={coffees}
          config={config}
          llmEnabled={llmEnabled}
        />
      )}
      {tab === "settings" && (
        <Settings
          config={config}
          onConfig={setConfig}
          onClose={closeSettings}
          profile={profile}
          recipes={recipes}
          onUpdateRecipe={updateRecipe}
          onDeleteRecipe={deleteRecipe}
          llmEnabled={llmEnabled}
          onSetAiKey={setAiKey}
          onRemoveAiKey={removeAiKey}
        />
      )}

      <TabBar active={tab} onChange={gotoTab} pendingCount={pendingCount} />

      {(lastError || undoState || queuedCount > 0) && (
        <div style={{
          position: "absolute", bottom: "calc(var(--tab-h) + env(safe-area-inset-bottom, 0px) + 14px)",
          left: 16, right: 16, zIndex: 50,
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          {queuedCount > 0 && (
            <div style={{
              background: "var(--surface-2)", border: "1px solid var(--line)",
              color: "var(--ink-dim)", borderRadius: 12, padding: "9px 13px",
              fontSize: 12.5, fontWeight: 500, lineHeight: 1.4,
              display: "flex", alignItems: "center", gap: 8,
              boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
            }}>
              <span className="dot" style={{ width: 6, height: 6, background: "var(--accent)", flexShrink: 0 }} />
              <span>{queuedCount === 1 ? "1 change" : `${queuedCount} changes`} saved offline — will sync</span>
            </div>
          )}
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

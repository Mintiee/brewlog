"use client";
import { useState, useCallback } from "react";
import { AppProvider, useApp } from "@/lib/store/AppContext";
import { Icon } from "@/components/ui";
import { BrewFlow } from "@/components/brew/BrewFlow";
import { Shelf } from "@/components/shelf/Shelf";
import { History } from "@/components/palate/History";
import { Settings } from "@/components/settings/Settings";
import type { Coffee } from "@/lib/types";

type Tab = "brew" | "shelf" | "palate" | "settings";

const TABS = [
  { id: "brew" as Tab,   icon: "brew",  label: "Brew" },
  { id: "shelf" as Tab,  icon: "shelf", label: "Shelf" },
  { id: "palate" as Tab, icon: "log",   label: "Palate" },
];

function TabBar({ active, onChange, pendingCount }: { active: Tab; onChange: (t: Tab) => void; pendingCount: number }) {
  return (
    <div style={{
      position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 40,
      height: "var(--tab-h)", paddingBottom: 22,
      display: "flex", alignItems: "center",
      background: "color-mix(in srgb, var(--bg) 82%, transparent)",
      backdropFilter: "blur(18px) saturate(160%)",
      WebkitBackdropFilter: "blur(18px) saturate(160%)",
      borderTop: "1px solid var(--line)",
    }}>
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
  );
}

function Shell() {
  const { coffees, brews, config, profile, llmEnabled, addCoffee, updateCoffee, setConfig } = useApp();
  const [tab, setTab] = useState<Tab>("brew");
  const [prevTab, setPrevTab] = useState<Tab>("brew");
  const [brewResetKey, setBrewResetKey] = useState(0);
  const [brewStart, setBrewStart] = useState<{ coffee: Coffee; nonce: number } | null>(null);
  const [brewStep, setBrewStep] = useState("what");

  const pendingCount = brews.filter((b) => b.pending).length;

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
          brews={brews.filter((b) => !b.pending)}
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
    </div>
  );
}

export function AppShell() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}

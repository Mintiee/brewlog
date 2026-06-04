"use client";
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import type { Coffee, Brew, Config, Profile } from "@/lib/types";
import { SEED_COFFEES, SEED_BREWS, SEED_CONFIG } from "@/lib/domain/seed";
import { createClient } from "@/lib/supabase/browser";
import {
  fetchCoffees, fetchBrews, fetchConfig, fetchProfile,
  insertBrew, updateBrew, deleteBrew, upsertCoffee, upsertConfig,
  fetchAiKeyStatus, fetchLearnedNotes,
} from "@/lib/db";
import { setLearnedNotes } from "@/lib/flavour";
import { setRestWindow, setServingGrams } from "@/lib/domain";

/** Push household-wide settings into the domain module's freshness/serving knobs. */
function applyConfigToDomain(c: Config) {
  setRestWindow(c.rest_days);
  setServingGrams(c.serving_grams);
}

interface AppState {
  coffees: Coffee[];
  brews: Brew[];
  config: Config;
  profile: Profile;
  llmEnabled: boolean;
  aiProvider?: string;
  ready: boolean;          // true once data has loaded (or seeded)
}

interface AppActions {
  addCoffee: (c: Coffee) => void;
  updateCoffee: (c: Coffee) => void;
  startBrew: (b: Brew) => void;
  rateBrew: (id: string, rating: Partial<Brew>) => void;
  dismissBrew: (id: string) => void;
  setConfig: (c: Config) => void;
  setProfile: (p: Profile) => void;
}

const AppContext = createContext<(AppState & AppActions) | null>(null);

const SEED_PROFILE: Profile = { id: "me", household_id: "seed", name: "You" };

export function AppProvider({ children }: { children: ReactNode }) {
  const [coffees, setCoffees] = useState<Coffee[]>(SEED_COFFEES);
  const [brews, setBrews] = useState<Brew[]>(SEED_BREWS);
  const [config, setConfigState] = useState<Config>(SEED_CONFIG);
  const [profile, setProfileState] = useState<Profile>(SEED_PROFILE);
  const [llmEnabled, setLlmEnabled] = useState(false);
  const [aiProvider, setAiProvider] = useState<string | undefined>();
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  // Check auth + load data
  useEffect(() => {
    const sb = createClient();
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setReady(true); return; }
      setAuthed(true);
      try {
        const [p, c, b, cfg, aiStatus, notes] = await Promise.all([
          fetchProfile(),
          fetchCoffees(),
          fetchBrews(),
          fetchConfig(),
          fetchAiKeyStatus(),
          fetchLearnedNotes(),
        ]);
        if (p) setProfileState(p);
        if (c.length) setCoffees(c);
        if (b.length) setBrews(b);
        if (cfg) { setConfigState(cfg); applyConfigToDomain(cfg); }
        if (aiStatus?.set) { setLlmEnabled(true); setAiProvider(aiStatus.provider); }
        if (notes) setLearnedNotes(notes as Record<string, import("@/lib/flavour").FlavourFamily>);
      } catch { /* fall through to seed data */ }
      setReady(true);
    });

    // Listen for auth state changes (sign in / sign out)
    const { data: { subscription } } = sb.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setCoffees(SEED_COFFEES); setBrews(SEED_BREWS); setConfigState(SEED_CONFIG);
        applyConfigToDomain(SEED_CONFIG);
        setProfileState(SEED_PROFILE); setLlmEnabled(false); setAuthed(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ---- Optimistic mutations (update local state immediately; sync to DB if authed) ----

  const addCoffee = useCallback((c: Coffee) => {
    setCoffees((prev) => [c, ...prev]);
    if (authed) upsertCoffee(c).catch(console.error);
  }, [authed]);

  const updateCoffee = useCallback((c: Coffee) => {
    setCoffees((prev) => prev.map((x) => x.id === c.id ? c : x));
    if (authed) upsertCoffee(c).catch(console.error);
  }, [authed]);

  const startBrew = useCallback((b: Brew) => {
    setBrews((prev) => [b, ...prev]);
    // Insert WITH the client-generated UUID so later rating updates (updateBrew by id)
    // match the same row — otherwise rated_at never persists and the brew reappears
    // as pending after a refresh.
    if (authed) insertBrew(b).catch(console.error);
  }, [authed]);

  const rateBrew = useCallback((id: string, rating: Partial<Brew>) => {
    const patch = { ...rating, pending: false, rated_at: String(Date.now()) };
    setBrews((prev) => prev.map((x) => x.id === id ? { ...x, ...patch } : x));
    if (authed) updateBrew(id, patch).catch(console.error);
  }, [authed]);

  const dismissBrew = useCallback((id: string) => {
    setBrews((prev) => prev.filter((x) => x.id !== id));
    if (authed) deleteBrew(id).catch(console.error);
  }, [authed]);

  const setConfig = useCallback((c: Config) => {
    setConfigState(c);
    applyConfigToDomain(c);
    if (authed && profile.household_id) upsertConfig(c, profile.household_id).catch(console.error);
  }, [authed, profile.household_id]);

  const setProfile = useCallback((p: Profile) => setProfileState(p), []);

  return (
    <AppContext.Provider value={{
      coffees, brews, config, profile, llmEnabled, aiProvider, ready,
      addCoffee, updateCoffee, startBrew, rateBrew, dismissBrew, setConfig, setProfile,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be inside AppProvider");
  return ctx;
}

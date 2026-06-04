"use client";
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import type { Coffee, Brew, Config, Profile } from "@/lib/types";
import { SEED_CONFIG } from "@/lib/domain/seed";
import { createClient } from "@/lib/supabase/browser";
import {
  fetchCoffees, fetchBrews, fetchConfig, fetchProfile,
  insertBrew, updateBrew as dbUpdateBrew, deleteBrew, upsertCoffee, upsertConfig,
  fetchAiKeyStatus, fetchLearnedNotes,
} from "@/lib/db";
import { setLearnedNotes } from "@/lib/flavour";
import { setRestWindow, setServingGrams, setPeakWindow } from "@/lib/domain";

/** Push household-wide settings into the domain module's freshness/serving knobs. */
function applyConfigToDomain(c: Config) {
  setRestWindow(c.rest_days);
  if (c.peak_days) setPeakWindow(c.peak_days);
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
  lastError: string | null; // last swallowed DB error, shown as a banner
}

interface AppActions {
  addCoffee: (c: Coffee) => void;
  updateCoffee: (c: Coffee) => void;
  startBrew: (b: Brew) => void;
  rateBrew: (id: string, rating: Partial<Brew>) => void;
  updateBrew: (id: string, patch: Partial<Brew>) => void;
  dismissBrew: (id: string) => void;
  setConfig: (c: Config) => void;
  setProfile: (p: Profile) => void;
  clearError: () => void;
}

const AppContext = createContext<(AppState & AppActions) | null>(null);

const SEED_PROFILE: Profile = { id: "me", household_id: "seed", name: "You" };

export function AppProvider({ children }: { children: ReactNode }) {
  const [coffees, setCoffees] = useState<Coffee[]>([]);
  const [brews, setBrews] = useState<Brew[]>([]);
  const [config, setConfigState] = useState<Config>(SEED_CONFIG);
  const [profile, setProfileState] = useState<Profile>(SEED_PROFILE);
  const [llmEnabled, setLlmEnabled] = useState(false);
  const [aiProvider, setAiProvider] = useState<string | undefined>();
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

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
        // Authed: adopt the fetched data even when empty — an authed user with no
        // coffees/brews should see an empty shelf/journal, NOT the seed/dummy fallback.
        setCoffees(c);
        setBrews(b);
        if (cfg) { setConfigState(cfg); applyConfigToDomain(cfg); }
        if (aiStatus?.set) { setLlmEnabled(true); setAiProvider(aiStatus.provider); }
        if (notes) setLearnedNotes(notes as Record<string, import("@/lib/flavour").FlavourFamily>);
      } catch { /* fall through to seed data */ }
      setReady(true);
    });

    // Listen for auth state changes (sign in / sign out)
    const { data: { subscription } } = sb.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setCoffees([]); setBrews([]); setConfigState(SEED_CONFIG);
        applyConfigToDomain(SEED_CONFIG);
        setProfileState(SEED_PROFILE); setLlmEnabled(false); setAuthed(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ---- Optimistic mutations (update local state immediately; sync to DB if authed) ----

  const addCoffee = useCallback((c: Coffee) => {
    // Ensure household_id is always set — upsertCoffee will forward it to coffeeToRow.
    const coffee = { ...c, household_id: profile.household_id };
    setCoffees((prev) => [coffee, ...prev]);
    if (authed) upsertCoffee(coffee).catch((err) => {
      console.error("[addCoffee] upsert failed:", err);
      const detail = err?.message ?? err?.code ?? String(err);
      setLastError(`Coffee save failed: ${detail}`);
    });
  }, [authed, profile.household_id]);

  const updateCoffee = useCallback((c: Coffee) => {
    const coffee = { ...c, household_id: c.household_id || profile.household_id };
    setCoffees((prev) => prev.map((x) => x.id === c.id ? coffee : x));
    if (authed) upsertCoffee(coffee).catch(console.error);
  }, [authed, profile.household_id]);

  const startBrew = useCallback((b: Brew) => {
    setBrews((prev) => [b, ...prev]);
    // Insert WITH the client-generated UUID so later rating updates (updateBrew by id)
    // match the same row — otherwise rated_at never persists and the brew reappears
    // as pending after a refresh.
    if (!authed) {
      console.error("[startBrew] not authed — brew saved locally only and will be lost on reload");
      return;
    }
    insertBrew(b).catch((err) => {
      console.error("[startBrew] insert failed — brew saved locally only and will be lost on reload:", err);
      const detail = err?.message ?? err?.code ?? String(err);
      setLastError(`Brew insert failed: ${detail}`);
    });
  }, [authed]);

  const rateBrew = useCallback((id: string, rating: Partial<Brew>) => {
    const patch = { ...rating, pending: false, rated_at: String(Date.now()) };
    setBrews((prev) => prev.map((x) => x.id === id ? { ...x, ...patch } : x));
    if (authed) dbUpdateBrew(id, patch).catch(console.error);
  }, [authed]);

  // Pure patch — no forced pending/rated_at (use for BrewDetail edits, not the rating flow).
  const updateBrew = useCallback((id: string, patch: Partial<Brew>) => {
    setBrews((prev) => prev.map((x) => x.id === id ? { ...x, ...patch } : x));
    if (authed) dbUpdateBrew(id, patch).catch(console.error);
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

  const clearError = useCallback(() => setLastError(null), []);

  return (
    <AppContext.Provider value={{
      coffees, brews, config, profile, llmEnabled, aiProvider, ready, lastError,
      addCoffee, updateCoffee, startBrew, rateBrew, updateBrew, dismissBrew, setConfig, setProfile, clearError,
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

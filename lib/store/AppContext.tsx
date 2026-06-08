"use client";
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import type { Coffee, Brew, Config, Profile } from "@/lib/types";
import { SEED_CONFIG } from "@/lib/domain/seed";
import { createClient } from "@/lib/supabase/browser";
import {
  fetchCoffees, fetchBrews, fetchConfig, fetchProfile, fetchHouseholdProfiles,
  insertBrew, updateBrew as dbUpdateBrew, deleteBrew, upsertCoffee, upsertConfig,
  fetchAiKeyStatus, fetchLearnedNotes,
} from "@/lib/db";
import { setLearnedNotes } from "@/lib/flavour";
import { setRestWindow, setServingGrams, setPeakWindow, activeGrams } from "@/lib/domain";

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
  members: Profile[];      // all profiles in the household (self + others)
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
  /** Delete a brew and all session siblings (for journal/recent-strip deletes). */
  dismissBrewSession: (id: string) => void;
  setConfig: (c: Config) => void;
  setProfile: (p: Profile) => void;
  clearError: () => void;
}

const AppContext = createContext<(AppState & AppActions) | null>(null);

const SEED_PROFILE: Profile = { id: "me", household_id: "seed", name: "You" };

/** Server-prefetched payload (built in app/page.tsx) used to seed initial state. */
export interface AppData {
  profile: Profile | null;
  coffees: Coffee[];
  brews: Brew[];
  config: Config | null;
  aiStatus: { set: boolean; provider?: string } | null;
  notes: Record<string, string>;
}

export function AppProvider({ children, initialData }: { children: ReactNode; initialData?: AppData }) {
  // When the server prefetched data, push config/notes into the domain modules
  // once (during the first render, via the initializer) so freshness/serving
  // calculations are already correct on first paint — no blank screen, no client
  // round-trips on first load.
  useState(() => {
    if (initialData?.config) applyConfigToDomain(initialData.config);
    if (initialData?.notes) setLearnedNotes(initialData.notes as Record<string, import("@/lib/flavour").FlavourFamily>);
  });

  const [coffees, setCoffees] = useState<Coffee[]>(initialData?.coffees ?? []);
  const [brews, setBrews] = useState<Brew[]>(initialData?.brews ?? []);
  const [config, setConfigState] = useState<Config>(initialData?.config ?? SEED_CONFIG);
  const [profile, setProfileState] = useState<Profile>(initialData?.profile ?? SEED_PROFILE);
  const [members, setMembers] = useState<Profile[]>(initialData?.profile ? [initialData.profile] : []);
  const [llmEnabled, setLlmEnabled] = useState(!!initialData?.aiStatus?.set);
  const [aiProvider, setAiProvider] = useState<string | undefined>(initialData?.aiStatus?.provider);
  const [ready, setReady] = useState(!!initialData);
  const [authed, setAuthed] = useState(!!initialData?.profile);
  const [lastError, setLastError] = useState<string | null>(null);

  // Check auth + load data — only when the server did NOT prefetch (demo/unauthed
  // path, or Supabase unconfigured). The authed first-load path is fully seeded above.
  useEffect(() => {
    const sb = createClient();
    if (!initialData) {
      // getSession() reads the cookie locally (no network round-trip); RLS still
      // enforces real access on the queries below.
      sb.auth.getSession().then(async ({ data: { session } }) => {
        const user = session?.user;
        if (!user) { setReady(true); return; }
        setAuthed(true);
        try {
          const [p, c, b, cfg, aiStatus, notes, mem] = await Promise.all([
            fetchProfile(user.id),
            fetchCoffees(),
            fetchBrews(),
            fetchConfig(),
            fetchAiKeyStatus(),
            fetchLearnedNotes(),
            fetchHouseholdProfiles(),
          ]);
          if (p) setProfileState(p);
          if (mem.length) setMembers(mem);
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
    }

    // Listen for auth state changes (sign in / sign out)
    const { data: { subscription } } = sb.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setCoffees([]); setBrews([]); setConfigState(SEED_CONFIG);
        applyConfigToDomain(SEED_CONFIG);
        setProfileState(SEED_PROFILE); setMembers([]); setLlmEnabled(false); setAuthed(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Re-pull household data (brews + coffees) — server is the source of truth.
  // Used by the foreground refresh so a brew sent from another device appears
  // without a full reload. Local optimistic writes have persisted by then.
  const refresh = useCallback(async () => {
    if (!authed) return;
    try {
      const [c, b] = await Promise.all([fetchCoffees(), fetchBrews()]);
      setCoffees(c);
      setBrews(b);
    } catch { /* transient — keep current state */ }
  }, [authed]);

  // On the seeded first-load path the household members aren't prefetched, so
  // pull them once; and refresh data whenever the app returns to the foreground
  // (throttled), so handed-off brews surface without a manual reload.
  useEffect(() => {
    if (!authed) return;
    fetchHouseholdProfiles().then((m) => { if (m.length) setMembers(m); }).catch(() => {});
    let last = Date.now();
    const onForeground = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last < 10000) return; // throttle bursts of focus/visibility events
      last = Date.now();
      refresh();
    };
    document.addEventListener("visibilitychange", onForeground);
    window.addEventListener("focus", onForeground);
    return () => {
      document.removeEventListener("visibilitychange", onForeground);
      window.removeEventListener("focus", onForeground);
    };
  }, [authed, refresh]);

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
    // Rating always clears the handoff flag — once rated it's no longer "awaiting"
    // anyone, and the rater is recorded as taster1 by the caller (StepRate).
    const patch = { ...rating, pending: false, rated_at: String(Date.now()), rate_for: null };
    setBrews((prev) => prev.map((x) => x.id === id ? { ...x, ...patch } : x));
    if (authed) dbUpdateBrew(id, patch).catch(console.error);
  }, [authed]);

  // Pure patch — no forced pending/rated_at (use for BrewDetail edits, not the rating flow).
  const updateBrew = useCallback((id: string, patch: Partial<Brew>) => {
    setBrews((prev) => prev.map((x) => x.id === id ? { ...x, ...patch } : x));
    if (authed) dbUpdateBrew(id, patch).catch(console.error);
  }, [authed]);

  const dismissBrew = useCallback((id: string) => {
    const brew = brews.find((x) => x.id === id);
    const nextBrews = brews.filter((x) => x.id !== id);
    setBrews(nextBrews);
    // Bug 1c: if deleting this brew restores beans to a finished bag, auto-return it.
    if (brew) {
      const coffee = coffees.find((c) => c.id === brew.coffee_id);
      if (coffee?.archived && activeGrams(coffee, nextBrews) > 0) {
        const restored = { ...coffee, household_id: coffee.household_id || profile.household_id, archived: false };
        setCoffees((prev) => prev.map((c) => c.id === coffee.id ? restored : c));
        if (authed) upsertCoffee(restored).catch(console.error);
      }
    }
    if (authed) deleteBrew(id).catch(console.error);
  }, [authed, brews, coffees, profile.household_id]);

  /** Deletes an entire session (both split-brew rows) by any sibling's id.
   *  Falls back to single-row delete when session_id is null (same as dismissBrew).
   *  Use this for journal/recent-strip deletes — NOT for discardRating, which must
   *  leave Kris's sibling row intact. */
  const dismissBrewSession = useCallback((id: string) => {
    const brew = brews.find((x) => x.id === id);
    const idsToRemove = new Set(
      brew?.session_id
        ? brews.filter((x) => x.session_id === brew.session_id).map((x) => x.id)
        : [id],
    );
    const nextBrews = brews.filter((x) => !idsToRemove.has(x.id));
    setBrews(nextBrews);
    // Bug 1c: if the deletion restores beans to a finished bag, auto-return it.
    if (brew) {
      const coffee = coffees.find((c) => c.id === brew.coffee_id);
      if (coffee?.archived && activeGrams(coffee, nextBrews) > 0) {
        const restored = { ...coffee, household_id: coffee.household_id || profile.household_id, archived: false };
        setCoffees((prev) => prev.map((c) => c.id === coffee.id ? restored : c));
        if (authed) upsertCoffee(restored).catch(console.error);
      }
    }
    if (authed) idsToRemove.forEach((rid) => deleteBrew(rid).catch(console.error));
  }, [authed, brews, coffees, profile.household_id]);

  const setConfig = useCallback((c: Config) => {
    setConfigState(c);
    applyConfigToDomain(c);
    if (authed && profile.household_id) upsertConfig(c, profile.household_id).catch(console.error);
  }, [authed, profile.household_id]);

  const setProfile = useCallback((p: Profile) => setProfileState(p), []);

  const clearError = useCallback(() => setLastError(null), []);

  return (
    <AppContext.Provider value={{
      coffees, brews, config, profile, members, llmEnabled, aiProvider, ready, lastError,
      addCoffee, updateCoffee, startBrew, rateBrew, updateBrew, dismissBrew, dismissBrewSession, setConfig, setProfile, clearError,
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

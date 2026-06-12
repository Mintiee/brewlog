"use client";
import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import type { Coffee, Brew, Config, Profile } from "@/lib/types";
import { SEED_CONFIG } from "@/lib/domain/seed";
import { createClient } from "@/lib/supabase/browser";
import {
  fetchCoffees, fetchBrews, fetchConfig, fetchProfile, fetchHouseholdProfiles,
  insertBrew, updateBrew as dbUpdateBrew, deleteBrew, upsertCoffee, upsertConfig,
  fetchAiKeyStatus, fetchLearnedNotes,
} from "@/lib/db";
import { setLearnedNotes, coffeeColor } from "@/lib/flavour";
import { classifyUnknownNotes } from "@/lib/flavour/classify";
import { setRestWindow, setServingGrams, setPeakWindow, activeGrams } from "@/lib/domain";
import { persist, writesIdle, writesInFlight } from "@/lib/store/persist";

/** Push household-wide settings into the domain module's freshness/serving knobs. */
function applyConfigToDomain(c: Config) {
  setRestWindow(c.rest_days);
  if (c.peak_days) setPeakWindow(c.peak_days);
  setServingGrams(c.serving_grams);
}

/** A failed write surfaced to the UI. `retry` re-applies the optimistic
 *  state and re-runs the write (set by the persist pipeline). */
export interface AppError {
  message: string;
  retry?: () => void;
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
  /** False in local-only demo mode (no session) — writes don't reach a DB. */
  authed: boolean;
  lastError: AppError | null; // last failed DB write, shown as a banner
}

/** Mutations resolve true once the write is confirmed in the DB, false on
 *  final failure (state already rolled back, banner shown) or when unauthed
 *  (local-only demo mode). Callers may ignore the promise. */
interface AppActions {
  addCoffee: (c: Coffee) => Promise<boolean>;
  updateCoffee: (c: Coffee) => Promise<boolean>;
  startBrew: (b: Brew) => Promise<boolean>;
  rateBrew: (id: string, rating: Partial<Brew>) => Promise<boolean>;
  updateBrew: (id: string, patch: Partial<Brew>) => Promise<boolean>;
  dismissBrew: (id: string) => Promise<boolean>;
  /** Delete a brew and all session siblings (for journal/recent-strip deletes). */
  dismissBrewSession: (id: string) => Promise<boolean>;
  setConfig: (c: Config) => Promise<boolean>;
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
  const [lastError, setLastError] = useState<AppError | null>(null);

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
      // Never snapshot the server mid-write: wait for in-flight writes so the
      // fetch includes everything we've sent, and discard the result if a new
      // write started during the fetch (its data wouldn't be in the snapshot —
      // adopting it would clobber the optimistic state with stale rows).
      await writesIdle();
      const [c, b] = await Promise.all([fetchCoffees(), fetchBrews()]);
      if (writesInFlight() > 0) return; // next refresh reconciles
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

  // Send lexicon-missed tasting notes to the LLM (once each — classify.ts dedupes),
  // then recolour the coffees state so chips and tiles repaint with the learned
  // families. `coffee.color` is materialised per object, hence the remap.
  const learnNotes = useCallback(async (notes: string[]) => {
    if (!llmEnabled) return;
    const map = await classifyUnknownNotes(notes);
    if (!map) return;
    setCoffees((prev) => prev.map((c) => ({ ...c, color: coffeeColor(c.notes) })));
  }, [llmEnabled]);

  // One-time background sweep: classify unknown notes already on the shelf so
  // existing grey chips heal without an edit. Runs once the data + AI key state
  // have settled (learned notes are loaded before `ready` flips on both paths).
  const sweptRef = useRef(false);
  useEffect(() => {
    if (sweptRef.current || !ready || !authed || !llmEnabled) return;
    sweptRef.current = true;
    void learnNotes(coffees.flatMap((c) => c.notes ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once-guarded; coffees read at sweep time only
  }, [ready, authed, llmEnabled, learnNotes]);

  // ---- Optimistic mutations ----
  // Pattern: `apply` updates local state immediately; `persist` runs the DB
  // write with retry, and on final failure rolls back and surfaces a banner
  // with a Retry that re-applies the optimistic state and re-runs the write.

  const save = useCallback((
    label: string,
    write: () => Promise<unknown>,
    apply: () => void,
    rollback: () => void,
  ): Promise<boolean> => {
    apply();
    if (!authed) return Promise.resolve(false); // demo mode — local-only by design
    const run = (): Promise<boolean> => persist(label, write, {
      rollback,
      onError: (message) => setLastError({
        message,
        retry: () => { setLastError(null); apply(); void run(); },
      }),
    });
    return run();
  }, [authed]);

  const addCoffee = useCallback((c: Coffee) => {
    // Ensure household_id is always set — upsertCoffee will forward it to coffeeToRow.
    const coffee = { ...c, household_id: profile.household_id };
    void learnNotes(coffee.notes ?? []);
    return save(
      "Coffee save",
      () => upsertCoffee(coffee),
      () => setCoffees((prev) => [coffee, ...prev]),
      () => setCoffees((prev) => prev.filter((x) => x.id !== coffee.id)),
    );
  }, [save, profile.household_id, learnNotes]);

  const updateCoffee = useCallback((c: Coffee) => {
    const coffee = { ...c, household_id: c.household_id || profile.household_id };
    // Capture previous state for rollback before the optimistic update.
    let prev: Coffee | undefined;
    void learnNotes(coffee.notes ?? []);
    return save(
      "Coffee save",
      () => upsertCoffee(coffee),
      () => setCoffees((prev_) => {
        prev = prev_.find((x) => x.id === c.id) ?? prev;
        return prev_.map((x) => x.id === c.id ? coffee : x);
      }),
      () => { if (prev) setCoffees((cs) => cs.map((x) => x.id === c.id ? prev! : x)); },
    );
  }, [save, profile.household_id, learnNotes]);

  const startBrew = useCallback((b: Brew) => {
    if (!authed) {
      setBrews((prev) => [b, ...prev]);
      setLastError({ message: "Not signed in — this brew is only on this device and will be lost on reload" });
      return Promise.resolve(false);
    }
    // Insert WITH the client-generated UUID so later rating updates (updateBrew by id)
    // match the same row — otherwise rated_at never persists and the brew reappears
    // as pending after a refresh.
    return save(
      "Brew save",
      () => insertBrew(b),
      () => setBrews((prev) => [b, ...prev]),
      () => setBrews((prev) => prev.filter((x) => x.id !== b.id)),
    );
  }, [authed, save]);

  const rateBrew = useCallback((id: string, rating: Partial<Brew>) => {
    // Rating always clears the handoff flag — once rated it's no longer "awaiting"
    // anyone, and the rater is recorded as taster1 by the caller (StepRate).
    const patch = { ...rating, pending: false, rated_at: String(Date.now()), rate_for: null };
    let prev: Brew | undefined;
    return save(
      "Rating save",
      () => dbUpdateBrew(id, patch),
      () => setBrews((bs) => {
        prev = bs.find((x) => x.id === id) ?? prev;
        return bs.map((x) => x.id === id ? { ...x, ...patch } : x);
      }),
      // Restore the full prior row (not just pending/rated_at) so rate_for and
      // any earlier rating fields survive the rollback.
      () => { if (prev) setBrews((bs) => bs.map((x) => x.id === id ? prev! : x)); },
    );
  }, [save]);

  // Pure patch — no forced pending/rated_at (use for BrewDetail edits, not the rating flow).
  const updateBrew = useCallback((id: string, patch: Partial<Brew>) => {
    let prev: Brew | undefined;
    return save(
      "Brew update",
      () => dbUpdateBrew(id, patch),
      () => setBrews((bs) => {
        prev = bs.find((x) => x.id === id) ?? prev;
        return bs.map((x) => x.id === id ? { ...x, ...patch } : x);
      }),
      () => { if (prev) setBrews((bs) => bs.map((x) => x.id === id ? prev! : x)); },
    );
  }, [save]);

  /** Shared core for single / session deletes: removes the given brew rows and,
   *  if that restores beans to a finished bag (Bug 1c), un-archives the coffee.
   *  One persist call covers the delete(s) + restore so a partial failure rolls
   *  the whole thing back. */
  const deleteBrews = useCallback((ids: Set<string>, anchor: Brew | undefined) => {
    const prevBrews = brews;
    const prevCoffees = coffees;
    const nextBrews = brews.filter((x) => !ids.has(x.id));
    const coffee = anchor ? coffees.find((c) => c.id === anchor.coffee_id) : undefined;
    const restored = coffee?.archived && activeGrams(coffee, nextBrews) > 0
      ? { ...coffee, household_id: coffee.household_id || profile.household_id, archived: false }
      : null;
    return save(
      ids.size > 1 ? "Brew delete (both cups)" : "Brew delete",
      async () => {
        await Promise.all([...ids].map((rid) => deleteBrew(rid)));
        if (restored) await upsertCoffee(restored);
      },
      () => {
        setBrews(nextBrews);
        if (restored) setCoffees((cs) => cs.map((c) => c.id === restored.id ? restored : c));
      },
      () => { setBrews(prevBrews); if (restored) setCoffees(prevCoffees); },
    );
  }, [save, brews, coffees, profile.household_id]);

  const dismissBrew = useCallback((id: string) => {
    return deleteBrews(new Set([id]), brews.find((x) => x.id === id));
  }, [deleteBrews, brews]);

  /** Deletes an entire session (both split-brew rows) by any sibling's id.
   *  Falls back to single-row delete when session_id is null (same as dismissBrew).
   *  Use this for journal/recent-strip deletes — NOT for discardRating, which must
   *  leave Kris's sibling row intact. */
  const dismissBrewSession = useCallback((id: string) => {
    const brew = brews.find((x) => x.id === id);
    const ids = new Set(
      brew?.session_id
        ? brews.filter((x) => x.session_id === brew.session_id).map((x) => x.id)
        : [id],
    );
    return deleteBrews(ids, brew);
  }, [deleteBrews, brews]);

  const setConfig = useCallback((c: Config) => {
    const prev = config;
    return save(
      "Settings save",
      () => upsertConfig(c, profile.household_id),
      () => { setConfigState(c); applyConfigToDomain(c); },
      () => { setConfigState(prev); applyConfigToDomain(prev); },
    );
  }, [save, config, profile.household_id]);

  const setProfile = useCallback((p: Profile) => setProfileState(p), []);

  const clearError = useCallback(() => setLastError(null), []);

  return (
    <AppContext.Provider value={{
      coffees, brews, config, profile, members, llmEnabled, aiProvider, ready, authed, lastError,
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

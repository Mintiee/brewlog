"use client";
import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import type { Coffee, Brew, Config, Profile, SavedRecipe } from "@/lib/types";
import { SEED_CONFIG } from "@/lib/domain/seed";
import { createClient } from "@/lib/supabase/browser";
import {
  fetchCoffees, fetchBrews, fetchConfig, fetchProfile, fetchHouseholdProfiles,
  insertBrew, updateBrew as dbUpdateBrew, deleteBrew, upsertCoffee, upsertConfig,
  fetchAiKeyStatus, fetchLearnedNotes, fetchLearnedVarietals, insertCoffees,
  fetchRecipes, upsertRecipe as dbUpsertRecipe, deleteRecipe as dbDeleteRecipe,
} from "@/lib/db";
import { setLearnedNotes, coffeeColor } from "@/lib/flavour";
import { classifyUnknownNotes } from "@/lib/flavour/classify";
import { setLearnedVarietals, type LearnedVarietal } from "@/lib/varietal";
import { classifyUnknownVarietals } from "@/lib/varietal/classify";
import { setRestWindow, setServingGrams, setPeakWindow, activeGrams, sessionDeleteIds, shouldUnarchiveAfterDelete } from "@/lib/domain";
import { persist, writesIdle, writesInFlight } from "@/lib/store/persist";
import { drainOutbox } from "@/lib/store/outbox";
import type { WriteDescriptor } from "@/lib/db/writeExecutors";

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
  recipes: SavedRecipe[];
  config: Config;
  profile: Profile;
  members: Profile[];      // all profiles in the household (self + others)
  llmEnabled: boolean;
  aiProvider?: string;
  ready: boolean;          // true once data has loaded (or seeded)
  /** Bumped whenever the learned-notes map changes at runtime (LLM classifies a
   *  new note). Colour consumers depend on it via useCoffeeColor so tiles/chips
   *  repaint once learned families arrive — colours are computed at render time,
   *  never baked into the Coffee row (which would freeze a stale/SSR colour). */
  notesVersion: number;
  /** Bumped whenever the learned-varietals map changes at runtime (LLM
   *  canonicalises a new token) so stats groupings re-key. */
  varietalsVersion: number;
  /** False in local-only demo mode (no session) — writes don't reach a DB. */
  authed: boolean;
  lastError: AppError | null; // last failed DB write, shown as a banner
  /** Transient post-delete affordance ("Brew deleted — Undo"), auto-clears. */
  undoState: { message: string; undo: () => void } | null;
  /** Number of kitchen writes queued offline in the durable outbox, awaiting
   *  sync. Drives the subtle "queued — will sync" indicator. */
  queuedCount: number;
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
  /** Batch-import coffees. Optimistic prepend + single persist call so a failure
   *  rolls the entire batch back. Notes are classified after the write lands. */
  importCoffees: (coffees: Coffee[]) => Promise<boolean>;
  /** Save a new named recipe to the household library. */
  addRecipe: (r: SavedRecipe) => Promise<boolean>;
  /** Update an existing saved recipe (e.g. inline rename). */
  updateRecipe: (r: SavedRecipe) => Promise<boolean>;
  /** Delete a saved recipe from the library. */
  deleteRecipe: (id: string) => Promise<boolean>;
  /** Save a household AI key. Resolves the provider on success, throws on failure
   *  (matches the previous inline fetch's contract — callers surface the error). */
  setAiKey: (key: string) => Promise<string>;
  /** Remove the household AI key. Never throws — a failed DELETE just leaves the
   *  server-side key in place; llmEnabled reflects the client's optimistic intent. */
  removeAiKey: () => Promise<void>;
}

const AppContext = createContext<(AppState & AppActions) | null>(null);

const SEED_PROFILE: Profile = { id: "me", household_id: "seed", name: "You" };

/** Server-prefetched payload (built in app/page.tsx) used to seed initial state. */
export interface AppData {
  profile: Profile | null;
  coffees: Coffee[];
  brews: Brew[];
  recipes: SavedRecipe[];
  config: Config | null;
  aiStatus: { set: boolean; provider?: string } | null;
  notes: Record<string, string>;
  varietals: Record<string, LearnedVarietal>;
}

export function AppProvider({ children, initialData }: { children: ReactNode; initialData?: AppData }) {
  // When the server prefetched data, push config/notes into the domain modules
  // once (during the first render, via the initializer) so freshness/serving
  // calculations are already correct on first paint — no blank screen, no client
  // round-trips on first load.
  useState(() => {
    if (initialData?.config) applyConfigToDomain(initialData.config);
    if (initialData?.notes) setLearnedNotes(initialData.notes as Record<string, import("@/lib/flavour").FlavourFamily>);
    if (initialData?.varietals) setLearnedVarietals(initialData.varietals);
  });

  const [coffees, setCoffees] = useState<Coffee[]>(initialData?.coffees ?? []);
  const [brews, setBrews] = useState<Brew[]>(initialData?.brews ?? []);
  const [recipes, setRecipes] = useState<SavedRecipe[]>(initialData?.recipes ?? []);
  const [config, setConfigState] = useState<Config>(initialData?.config ?? SEED_CONFIG);
  const [profile, setProfileState] = useState<Profile>(initialData?.profile ?? SEED_PROFILE);
  const [members, setMembers] = useState<Profile[]>(initialData?.profile ? [initialData.profile] : []);
  const [llmEnabled, setLlmEnabled] = useState(!!initialData?.aiStatus?.set);
  const [aiProvider, setAiProvider] = useState<string | undefined>(initialData?.aiStatus?.provider);
  const [ready, setReady] = useState(!!initialData);
  const [notesVersion, setNotesVersion] = useState(0);
  const [varietalsVersion, setVarietalsVersion] = useState(0);
  const [authed, setAuthed] = useState(!!initialData?.profile);
  const [lastError, setLastError] = useState<AppError | null>(null);
  const [undoState, setUndoState] = useState<{ message: string; undo: () => void } | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          const [p, c, b, rec, cfg, aiStatus, notes, varietals, mem] = await Promise.all([
            fetchProfile(user.id),
            fetchCoffees(),
            fetchBrews(),
            // Degrade gracefully if the recipes table isn't migrated yet — a
            // rejection here must not sink the whole initial load (Promise.all
            // short-circuits), so swallow it to an empty library.
            fetchRecipes().catch((e) => { console.warn("fetchRecipes failed — recipes unavailable", e); return []; }),
            fetchConfig(),
            fetchAiKeyStatus(),
            fetchLearnedNotes(),
            // Degrade gracefully if migration 019 hasn't been applied yet.
            fetchLearnedVarietals().catch(() => ({})),
            fetchHouseholdProfiles(),
          ]);
          if (p) setProfileState(p);
          if (mem.length) setMembers(mem);
          // Authed: adopt the fetched data even when empty — an authed user with no
          // coffees/brews should see an empty shelf/journal, NOT the seed/dummy fallback.
          setCoffees(c);
          setBrews(b);
          setRecipes(rec);
          if (cfg) { setConfigState(cfg); applyConfigToDomain(cfg); }
          if (aiStatus?.set) { setLlmEnabled(true); setAiProvider(aiStatus.provider); }
          if (notes) { setLearnedNotes(notes as Record<string, import("@/lib/flavour").FlavourFamily>); setNotesVersion((v) => v + 1); }
          if (varietals && Object.keys(varietals).length) { setLearnedVarietals(varietals); setVarietalsVersion((v) => v + 1); }
        } catch { /* fall through to seed data */ }
        setReady(true);
      });
    }

    // Listen for auth state changes (sign in / sign out)
    const { data: { subscription } } = sb.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setCoffees([]); setBrews([]); setRecipes([]); setConfigState(SEED_CONFIG);
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
      const [c, b, rec] = await Promise.all([
        fetchCoffees(),
        fetchBrews(),
        fetchRecipes().catch((e) => { console.warn("fetchRecipes failed — recipes unavailable", e); return []; }),
      ]);
      if (writesInFlight() > 0) return; // next refresh reconciles
      setCoffees(c);
      setBrews(b);
      setRecipes(rec);
    } catch { /* transient — keep current state */ }
  }, [authed]);

  // Drain the durable offline outbox: run any writes that were queued while
  // offline, in order, then reconcile with the server. `drainOutbox` no-ops when
  // offline or already draining, and reports how many entries remain so the
  // "queued — will sync" indicator stays accurate.
  const syncOutbox = useCallback(async () => {
    if (!authed) return;
    const res = await drainOutbox({
      onPermanentError: (entry, err) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const e = err as any;
        setLastError({ message: `${entry.label} failed: ${e?.message ?? e?.code ?? String(err)}` });
      },
    });
    setQueuedCount(res.remaining);
    if (res.drained > 0) void refresh();
  }, [authed, refresh]);

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

  // Drain the outbox on app start, whenever the browser comes back online, and
  // when the app returns to the foreground — the three moments connectivity is
  // most likely to have just been restored.
  useEffect(() => {
    if (!authed) return;
    // Defer the initial drain a tick so it doesn't set state synchronously during
    // the effect (drainOutbox is async and only sets state after its await).
    const kick = setTimeout(() => void syncOutbox(), 0);
    const onOnline = () => void syncOutbox();
    const onVisible = () => { if (document.visibilityState === "visible") void syncOutbox(); };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(kick);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [authed, syncOutbox]);

  // Send lexicon-missed tasting notes to the LLM (once each — classify.ts dedupes).
  // classifyUnknownNotes merges validated families into the module learned map;
  // bumping notesVersion makes colour consumers (useCoffeeColor) repaint with the
  // learned families. Colours are computed at render time, not stored per coffee.
  const learnNotes = useCallback(async (notes: string[]) => {
    if (!llmEnabled) return;
    const map = await classifyUnknownNotes(notes);
    if (!map) return;
    setNotesVersion((v) => v + 1);
  }, [llmEnabled]);

  // Same flow for varietal tokens: alias-map misses go to the LLM once, and the
  // version bump re-keys the Palate varietal groupings with learned canonicals.
  const learnVarietals = useCallback(async (tokens: string[]) => {
    if (!llmEnabled) return;
    const map = await classifyUnknownVarietals(tokens);
    if (!map) return;
    setVarietalsVersion((v) => v + 1);
  }, [llmEnabled]);

  // One-time background sweep: classify unknown notes already on the shelf so
  // existing grey chips heal without an edit. Runs once the data + AI key state
  // have settled (learned notes are loaded before `ready` flips on both paths).
  const sweptRef = useRef(false);
  useEffect(() => {
    if (sweptRef.current || !ready || !authed || !llmEnabled) return;
    sweptRef.current = true;
    void learnNotes(coffees.flatMap((c) => c.notes ?? []));
    void learnVarietals(coffees.flatMap((c) => c.varietals ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once-guarded; coffees read at sweep time only
  }, [ready, authed, llmEnabled, learnNotes, learnVarietals]);

  // ---- Optimistic mutations ----
  // Pattern: `apply` updates local state immediately; `persist` runs the DB
  // write with retry, and on final failure rolls back and surfaces a banner
  // with a Retry that re-applies the optimistic state and re-runs the write.

  const save = useCallback((
    label: string,
    write: () => Promise<unknown>,
    apply: () => void,
    rollback: () => void,
    // Serialisable form of the write. When supplied, an offline failure enqueues
    // it to the durable outbox (keeping the optimistic state) instead of rolling
    // back — the kitchen flows pass this; other mutations stay on rollback.
    descriptor?: WriteDescriptor,
  ): Promise<boolean> => {
    apply();
    if (!authed) return Promise.resolve(false); // demo mode — local-only by design
    const run = (): Promise<boolean> => persist(label, write, {
      rollback,
      descriptor,
      onQueued: () => setQueuedCount((c) => c + 1),
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
    void learnVarietals(coffee.varietals ?? []);
    return save(
      "Coffee save",
      () => upsertCoffee(coffee),
      () => setCoffees((prev) => [coffee, ...prev]),
      () => setCoffees((prev) => prev.filter((x) => x.id !== coffee.id)),
      { kind: "upsertCoffee", payload: coffee },
    );
  }, [save, profile.household_id, learnNotes, learnVarietals]);

  const updateCoffee = useCallback((c: Coffee) => {
    const coffee = { ...c, household_id: c.household_id || profile.household_id };
    // Snapshot the previous row at CALL time (not inside apply()) — apply() re-runs
    // on Retry and would otherwise capture the already-applied value (R9).
    const prev = coffees.find((x) => x.id === c.id);
    void learnNotes(coffee.notes ?? []);
    void learnVarietals(coffee.varietals ?? []);
    return save(
      "Coffee save",
      () => upsertCoffee(coffee),
      () => setCoffees((cs) => cs.map((x) => x.id === c.id ? coffee : x)),
      () => { if (prev) setCoffees((cs) => cs.map((x) => x.id === c.id ? prev : x)); },
      { kind: "upsertCoffee", payload: coffee },
    );
  }, [save, coffees, profile.household_id, learnNotes, learnVarietals]);

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
      { kind: "insertBrew", payload: b },
    );
  }, [authed, save]);

  const rateBrew = useCallback((id: string, rating: Partial<Brew>) => {
    // Rating always clears the handoff flag — once rated it's no longer "awaiting"
    // anyone, and the rater is recorded as taster1 by the caller (StepRate).
    const patch = { ...rating, pending: false, rated_at: String(Date.now()), rate_for: null };
    // Snapshot the prior row at CALL time (see R9): apply() re-runs on Retry and
    // would otherwise capture the already-rated value.
    const prev = brews.find((x) => x.id === id);
    return save(
      "Rating save",
      () => dbUpdateBrew(id, patch),
      () => setBrews((bs) => bs.map((x) => x.id === id ? { ...x, ...patch } : x)),
      // Restore the full prior row (not just pending/rated_at) so rate_for and
      // any earlier rating fields survive the rollback.
      () => { if (prev) setBrews((bs) => bs.map((x) => x.id === id ? prev : x)); },
      { kind: "updateBrew", id, patch },
    );
  }, [save, brews]);

  // Pure patch — no forced pending/rated_at (use for BrewDetail edits, not the rating flow).
  const updateBrew = useCallback((id: string, patch: Partial<Brew>) => {
    // Snapshot the prior row at CALL time (see R9): apply() re-runs on Retry.
    const prev = brews.find((x) => x.id === id);
    return save(
      "Brew update",
      () => dbUpdateBrew(id, patch),
      () => setBrews((bs) => bs.map((x) => x.id === id ? { ...x, ...patch } : x)),
      () => { if (prev) setBrews((bs) => bs.map((x) => x.id === id ? prev : x)); },
      { kind: "updateBrew", id, patch },
    );
  }, [save, brews]);

  /** Shared core for single / session deletes: removes the given brew rows and,
   *  if that restores beans to a finished bag (Bug 1c), un-archives the coffee.
   *  One persist call covers the delete(s) + restore so a partial failure rolls
   *  the whole thing back. */
  const deleteBrews = useCallback((ids: Set<string>, anchor: Brew | undefined) => {
    const prevBrews = brews;
    const prevCoffees = coffees;
    const nextBrews = brews.filter((x) => !ids.has(x.id));
    const coffee = anchor ? coffees.find((c) => c.id === anchor.coffee_id) : undefined;
    const restored = coffee && shouldUnarchiveAfterDelete(coffee, nextBrews)
      ? { ...coffee, household_id: coffee.household_id || profile.household_id, archived: false }
      : null;
    const removed = brews.filter((x) => ids.has(x.id));
    const p = save(
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
    // Offer a 5s undo: restore local state, then (once the delete has actually
    // landed) re-insert the same rows and re-archive the bag if it was
    // auto-returned. Waiting on `p` keeps insert-after-delete ordering.
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoState({
      message: ids.size > 1 ? "Brews deleted" : "Brew deleted",
      undo: () => {
        setUndoState(null);
        void p.then((ok) => {
          setBrews(prevBrews);
          if (restored) setCoffees(prevCoffees);
          if (ok && authed) {
            void persist("Undo delete", async () => {
              await Promise.all(removed.map((b) => insertBrew(b)));
              if (restored && coffee) await upsertCoffee(coffee);
            }, { onError: (message, retry) => setLastError({ message, retry }) });
          }
        });
      },
    });
    undoTimer.current = setTimeout(() => setUndoState(null), 5000);
    return p;
  }, [save, authed, brews, coffees, profile.household_id]);

  const dismissBrew = useCallback((id: string) => {
    return deleteBrews(new Set([id]), brews.find((x) => x.id === id));
  }, [deleteBrews, brews]);

  /** Deletes an entire session (both split-brew rows) by any sibling's id.
   *  Falls back to single-row delete when session_id is null (same as dismissBrew).
   *  Use this for journal/recent-strip deletes — NOT for discardRating, which must
   *  leave Kris's sibling row intact. */
  const dismissBrewSession = useCallback((id: string) => {
    const brew = brews.find((x) => x.id === id);
    return deleteBrews(sessionDeleteIds(brews, id), brew);
  }, [deleteBrews, brews]);

  const importCoffees = useCallback((incoming: Coffee[]) => {
    if (!incoming.length) return Promise.resolve(true);
    // Inject household_id on every row (same pattern as addCoffee).
    const batch = incoming.map((c) => ({ ...c, household_id: profile.household_id }));
    void learnNotes(batch.flatMap((c) => c.notes ?? []));
    void learnVarietals(batch.flatMap((c) => c.varietals ?? []));
    return save(
      "Import coffees",
      () => insertCoffees(batch),
      () => setCoffees((prev) => [...batch, ...prev]),
      () => setCoffees((prev) => {
        const ids = new Set(batch.map((c) => c.id));
        return prev.filter((c) => !ids.has(c.id));
      }),
    );
  }, [save, profile.household_id, learnNotes, learnVarietals]);

  // ---- Recipes ----
  // Optimistic add/update/delete on the saved-recipe library. As with every
  // mutation here, the previous value is snapshotted OUTSIDE the re-runnable
  // apply() callback — apply() runs again on Retry, so capturing prev inside it
  // would overwrite the snapshot with the already-applied value (R9).

  const addRecipe = useCallback((r: SavedRecipe) => {
    const recipe = { ...r, household_id: r.household_id || profile.household_id };
    return save(
      "Recipe save",
      () => dbUpsertRecipe(recipe),
      () => setRecipes((prev) => [recipe, ...prev]),
      () => setRecipes((prev) => prev.filter((x) => x.id !== recipe.id)),
    );
  }, [save, profile.household_id]);

  const updateRecipe = useCallback((r: SavedRecipe) => {
    const recipe = { ...r, household_id: r.household_id || profile.household_id };
    const prev = recipes.find((x) => x.id === r.id);
    return save(
      "Recipe save",
      () => dbUpsertRecipe(recipe),
      () => setRecipes((rs) => rs.map((x) => x.id === r.id ? recipe : x)),
      () => { if (prev) setRecipes((rs) => rs.map((x) => x.id === r.id ? prev : x)); },
    );
  }, [save, recipes, profile.household_id]);

  const deleteRecipe = useCallback((id: string) => {
    const prev = recipes;
    return save(
      "Recipe delete",
      () => dbDeleteRecipe(id),
      () => setRecipes((rs) => rs.filter((x) => x.id !== id)),
      () => setRecipes(prev),
    );
  }, [save, recipes]);

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

  // Single owner of AI-key state: llmEnabled/aiProvider are updated here so no
  // other component needs its own shadow flag for "is AI on right now".
  const setAiKey = useCallback(async (key: string) => {
    const res = await fetch("/api/ai-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Failed to save key"); }
    const { provider } = await res.json();
    setLlmEnabled(true);
    setAiProvider(provider);
    return provider as string;
  }, []);

  const removeAiKey = useCallback(async () => {
    await fetch("/api/ai-key", { method: "DELETE" });
    setLlmEnabled(false);
    setAiProvider(undefined);
  }, []);

  return (
    <AppContext.Provider value={{
      coffees, brews, recipes, config, profile, members, llmEnabled, aiProvider, ready, notesVersion, varietalsVersion, authed, lastError, undoState, queuedCount,
      addCoffee, updateCoffee, startBrew, rateBrew, updateBrew, dismissBrew, dismissBrewSession, setConfig, setProfile, clearError, importCoffees,
      addRecipe, updateRecipe, deleteRecipe, setAiKey, removeAiKey,
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

/**
 * Returns a `coffeeColor` mapper that repaints when learned notes arrive.
 *
 * Coffee colours are derived from tasting notes at render time — never stored on
 * the Coffee row — so SSR can't bake a stale colour and there's no cross-request
 * module-global hazard. Calling useApp() subscribes the consuming component to
 * the context, so it re-renders (and recomputes colours at render) whenever app
 * state changes — including the notesVersion bump the provider fires when the
 * learned-notes map updates. coffeeColor is pure over notes + the module learned
 * map; the version bump is purely the repaint trigger.
 */
export function useCoffeeColor(): (notes: string[]) => string {
  useApp();
  return coffeeColor;
}

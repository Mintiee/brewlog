"use client";
import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
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
import { setRestWindow, setServingGrams, setPeakWindow, setRoasterWindows, sessionDeleteIds, shouldUnarchiveAfterDelete } from "@/lib/domain";
import { persist, writesIdle, writesInFlight } from "@/lib/store/persist";
import { drainOutbox } from "@/lib/store/outbox";
import { createStore, type Store } from "@/lib/store/createStore";
import type { WriteDescriptor } from "@/lib/db/writeExecutors";

/** Push household-wide settings into the domain module's freshness/serving knobs. */
function applyConfigToDomain(c: Config) {
  setRestWindow(c.rest_days);
  if (c.peak_days) setPeakWindow(c.peak_days);
  setServingGrams(c.serving_grams);
  setRoasterWindows(c.roaster_rest);
}

/** A failed write surfaced to the UI. `retry` re-applies the optimistic
 *  state and re-runs the write (set by the persist pipeline). */
export interface AppError {
  message: string;
  retry?: () => void;
}

export interface AppState {
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
export interface AppActions {
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

/**
 * Internal plumbing shared by the hooks below.
 *
 * The store and the actions object are both created once and never replaced, so this
 * context value is constant for the provider's lifetime — nothing re-renders because
 * of the context itself. Components subscribe to *data* through useApp/useAppSelector,
 * which go through useSyncExternalStore.
 */
interface AppContextValue {
  store: Store<AppState>;
  actions: AppActions;
}

const AppContext = createContext<AppContextValue | null>(null);

const SEED_PROFILE: Profile = { id: "me", household_id: "seed", name: "You" };

/** How long settings writes are coalesced for. Short enough that a lost flush is
 *  near-impossible, long enough to collapse a slider drag into one upsert. */
const CONFIG_DEBOUNCE_MS = 400;

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

function initialState(initialData?: AppData): AppState {
  return {
    coffees: initialData?.coffees ?? [],
    brews: initialData?.brews ?? [],
    recipes: initialData?.recipes ?? [],
    config: initialData?.config ?? SEED_CONFIG,
    profile: initialData?.profile ?? SEED_PROFILE,
    members: initialData?.profile ? [initialData.profile] : [],
    llmEnabled: !!initialData?.aiStatus?.set,
    aiProvider: initialData?.aiStatus?.provider,
    ready: !!initialData,
    notesVersion: 0,
    varietalsVersion: 0,
    authed: !!initialData?.profile,
    lastError: null,
    undoState: null,
    queuedCount: 0,
  };
}

/** Subscribe the provider itself to a single field, for use in effect deps. */
function useAuthed(store: Store<AppState>): boolean {
  const read = () => store.get().authed;
  return useSyncExternalStore(store.subscribe, read, read);
}

export function AppProvider({ children, initialData }: { children: ReactNode; initialData?: AppData }) {
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** In-flight settings burst — see setConfig. */
  const configBurst = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    before: Config | null;
    latest: Config | null;
    waiters: ((ok: boolean) => void)[];
  }>({ timer: null, before: null, latest: null, waiters: [] });

  // Created once, via useState's lazy initialiser (the sanctioned way to do run-once
  // work during the first render — a ref would have to be read during render, which
  // React's lint rules correctly reject). When the server prefetched data, this also
  // pushes config/notes into the domain modules before anything reads them, so
  // freshness/serving calculations are already correct on first paint — no blank
  // screen, no client round-trips on first load.
  const [store] = useState<Store<AppState>>(() => {
    if (initialData?.config) applyConfigToDomain(initialData.config);
    if (initialData?.notes) setLearnedNotes(initialData.notes as Record<string, import("@/lib/flavour").FlavourFamily>);
    if (initialData?.varietals) setLearnedVarietals(initialData.varietals);
    return createStore(initialState(initialData));
  });

  // Every action below is built exactly once and reads current state through
  // `store.get()` at call time rather than closing over it. That keeps action
  // identities stable for the provider's lifetime, which is what lets React.memo on
  // the row components actually prevent re-renders — previously ~8 of the 16 action
  // identities changed after every single write, because their useCallback deps
  // listed `coffees` / `brews` / `recipes`.
  const { actions, internals } = useMemo(() => {
    /** Replace whole slices. */
    const patch = (p: Partial<AppState>) => store.set((s) => ({ ...s, ...p }));
    /** Update one slice from its previous value. */
    const update = <K extends keyof AppState>(key: K, fn: (prev: AppState[K]) => AppState[K]) =>
      store.set((s) => ({ ...s, [key]: fn(s[key]) }));

    const setLastError = (e: AppError | null) => patch({ lastError: e });

    // ---- Optimistic mutations ----
    // Pattern: `apply` updates local state immediately; `persist` runs the DB
    // write with retry, and on final failure rolls back and surfaces a banner
    // with a Retry that re-applies the optimistic state and re-runs the write.

    const save = (
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
      if (!store.get().authed) return Promise.resolve(false); // demo mode — local-only by design
      const run = (): Promise<boolean> => persist(label, write, {
        rollback,
        descriptor,
        onQueued: () => update("queuedCount", (c) => c + 1),
        onError: (message) => setLastError({
          message,
          retry: () => { setLastError(null); apply(); void run(); },
        }),
      });
      return run();
    };

    // Send lexicon-missed tasting notes to the LLM (once each — classify.ts dedupes).
    // classifyUnknownNotes merges validated families into the module learned map;
    // bumping notesVersion makes colour consumers (useCoffeeColor) repaint with the
    // learned families. Colours are computed at render time, not stored per coffee.
    const learnNotes = async (notes: string[]) => {
      if (!store.get().llmEnabled) return;
      const map = await classifyUnknownNotes(notes);
      if (!map) return;
      update("notesVersion", (v) => v + 1);
    };

    // Same flow for varietal tokens: alias-map misses go to the LLM once, and the
    // version bump re-keys the Palate varietal groupings with learned canonicals.
    const learnVarietals = async (tokens: string[]) => {
      if (!store.get().llmEnabled) return;
      const map = await classifyUnknownVarietals(tokens);
      if (!map) return;
      update("varietalsVersion", (v) => v + 1);
    };

    const addCoffee = (c: Coffee) => {
      // Ensure household_id is always set — upsertCoffee will forward it to coffeeToRow.
      const coffee = { ...c, household_id: store.get().profile.household_id };
      void learnNotes(coffee.notes ?? []);
      void learnVarietals(coffee.varietals ?? []);
      return save(
        "Coffee save",
        () => upsertCoffee(coffee),
        () => update("coffees", (prev) => [coffee, ...prev]),
        () => update("coffees", (prev) => prev.filter((x) => x.id !== coffee.id)),
        { kind: "upsertCoffee", payload: coffee },
      );
    };

    const updateCoffee = (c: Coffee) => {
      const coffee = { ...c, household_id: c.household_id || store.get().profile.household_id };
      // Snapshot the previous row at CALL time (not inside apply()) — apply() re-runs
      // on Retry and would otherwise capture the already-applied value (R9).
      const prev = store.get().coffees.find((x) => x.id === c.id);
      void learnNotes(coffee.notes ?? []);
      void learnVarietals(coffee.varietals ?? []);
      return save(
        "Coffee save",
        () => upsertCoffee(coffee),
        () => update("coffees", (cs) => cs.map((x) => x.id === c.id ? coffee : x)),
        () => { if (prev) update("coffees", (cs) => cs.map((x) => x.id === c.id ? prev : x)); },
        { kind: "upsertCoffee", payload: coffee },
      );
    };

    const startBrew = (b: Brew) => {
      if (!store.get().authed) {
        update("brews", (prev) => [b, ...prev]);
        setLastError({ message: "Not signed in — this brew is only on this device and will be lost on reload" });
        return Promise.resolve(false);
      }
      // Insert WITH the client-generated UUID so later rating updates (updateBrew by id)
      // match the same row — otherwise rated_at never persists and the brew reappears
      // as pending after a refresh.
      return save(
        "Brew save",
        () => insertBrew(b),
        () => update("brews", (prev) => [b, ...prev]),
        () => update("brews", (prev) => prev.filter((x) => x.id !== b.id)),
        { kind: "insertBrew", payload: b },
      );
    };

    const rateBrew = (id: string, rating: Partial<Brew>) => {
      // Rating always clears the handoff flag — once rated it's no longer "awaiting"
      // anyone, and the rater is recorded as taster1 by the caller (StepRate).
      const p = { ...rating, pending: false, rated_at: String(Date.now()), rate_for: null };
      // Snapshot the prior row at CALL time (see R9): apply() re-runs on Retry and
      // would otherwise capture the already-rated value.
      const prev = store.get().brews.find((x) => x.id === id);
      return save(
        "Rating save",
        () => dbUpdateBrew(id, p),
        () => update("brews", (bs) => bs.map((x) => x.id === id ? { ...x, ...p } : x)),
        // Restore the full prior row (not just pending/rated_at) so rate_for and
        // any earlier rating fields survive the rollback.
        () => { if (prev) update("brews", (bs) => bs.map((x) => x.id === id ? prev : x)); },
        { kind: "updateBrew", id, patch: p },
      );
    };

    // Pure patch — no forced pending/rated_at (use for BrewDetail edits, not the rating flow).
    const updateBrew = (id: string, p: Partial<Brew>) => {
      // Snapshot the prior row at CALL time (see R9): apply() re-runs on Retry.
      const prev = store.get().brews.find((x) => x.id === id);
      return save(
        "Brew update",
        () => dbUpdateBrew(id, p),
        () => update("brews", (bs) => bs.map((x) => x.id === id ? { ...x, ...p } : x)),
        () => { if (prev) update("brews", (bs) => bs.map((x) => x.id === id ? prev : x)); },
        { kind: "updateBrew", id, patch: p },
      );
    };

    /** Shared core for single / session deletes: removes the given brew rows and,
     *  if that restores beans to a finished bag (Bug 1c), un-archives the coffee.
     *  One persist call covers the delete(s) + restore so a partial failure rolls
     *  the whole thing back. */
    const deleteBrews = (ids: Set<string>, anchor: Brew | undefined) => {
      const { brews, coffees, profile, authed } = store.get();
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
          // One round-trip for the whole set rather than one DELETE per row.
          await deleteBrew([...ids]);
          if (restored) await upsertCoffee(restored);
        },
        () => {
          patch({ brews: nextBrews });
          if (restored) update("coffees", (cs) => cs.map((c) => c.id === restored.id ? restored : c));
        },
        () => { patch({ brews: prevBrews }); if (restored) patch({ coffees: prevCoffees }); },
      );
      // Offer a 5s undo: restore local state, then (once the delete has actually
      // landed) re-insert the same rows and re-archive the bag if it was
      // auto-returned. Waiting on `p` keeps insert-after-delete ordering.
      if (undoTimer.current) clearTimeout(undoTimer.current);
      patch({
        undoState: {
          message: ids.size > 1 ? "Brews deleted" : "Brew deleted",
          undo: () => {
            patch({ undoState: null });
            void p.then((ok) => {
              patch({ brews: prevBrews });
              if (restored) patch({ coffees: prevCoffees });
              if (ok && authed) {
                void persist("Undo delete", async () => {
                  await Promise.all(removed.map((b) => insertBrew(b)));
                  if (restored && coffee) await upsertCoffee(coffee);
                }, { onError: (message, retry) => setLastError({ message, retry }) });
              }
            });
          },
        },
      });
      undoTimer.current = setTimeout(() => patch({ undoState: null }), 5000);
      return p;
    };

    const dismissBrew = (id: string) =>
      deleteBrews(new Set([id]), store.get().brews.find((x) => x.id === id));

    /** Deletes an entire session (both split-brew rows) by any sibling's id.
     *  Falls back to single-row delete when session_id is null (same as dismissBrew).
     *  Use this for journal/recent-strip deletes — NOT for discardRating, which must
     *  leave Kris's sibling row intact. */
    const dismissBrewSession = (id: string) => {
      const { brews } = store.get();
      const brew = brews.find((x) => x.id === id);
      return deleteBrews(sessionDeleteIds(brews, id), brew);
    };

    const importCoffees = (incoming: Coffee[]) => {
      if (!incoming.length) return Promise.resolve(true);
      // Inject household_id on every row (same pattern as addCoffee).
      const batch = incoming.map((c) => ({ ...c, household_id: store.get().profile.household_id }));
      void learnNotes(batch.flatMap((c) => c.notes ?? []));
      void learnVarietals(batch.flatMap((c) => c.varietals ?? []));
      return save(
        "Import coffees",
        () => insertCoffees(batch),
        () => update("coffees", (prev) => [...batch, ...prev]),
        () => update("coffees", (prev) => {
          const ids = new Set(batch.map((c) => c.id));
          return prev.filter((c) => !ids.has(c.id));
        }),
      );
    };

    // ---- Recipes ----
    // Optimistic add/update/delete on the saved-recipe library. As with every
    // mutation here, the previous value is snapshotted OUTSIDE the re-runnable
    // apply() callback — apply() runs again on Retry, so capturing prev inside it
    // would overwrite the snapshot with the already-applied value (R9).

    const addRecipe = (r: SavedRecipe) => {
      const recipe = { ...r, household_id: r.household_id || store.get().profile.household_id };
      return save(
        "Recipe save",
        () => dbUpsertRecipe(recipe),
        () => update("recipes", (prev) => [recipe, ...prev]),
        () => update("recipes", (prev) => prev.filter((x) => x.id !== recipe.id)),
      );
    };

    const updateRecipe = (r: SavedRecipe) => {
      const recipe = { ...r, household_id: r.household_id || store.get().profile.household_id };
      const prev = store.get().recipes.find((x) => x.id === r.id);
      return save(
        "Recipe save",
        () => dbUpsertRecipe(recipe),
        () => update("recipes", (rs) => rs.map((x) => x.id === r.id ? recipe : x)),
        () => { if (prev) update("recipes", (rs) => rs.map((x) => x.id === r.id ? prev : x)); },
      );
    };

    const deleteRecipe = (id: string) => {
      const prev = store.get().recipes;
      return save(
        "Recipe delete",
        () => dbDeleteRecipe(id),
        () => update("recipes", (rs) => rs.filter((x) => x.id !== id)),
        () => patch({ recipes: prev }),
      );
    };

    // ---- Settings ----
    // upsertConfig writes the *entire* config row (grinder, brewers JSON, waters, …),
    // and setConfig is called on every change event — so dragging a slider used to fire
    // one full-row upsert per tick. The optimistic state is still applied immediately
    // (the UI must stay live under the finger); only the write is coalesced.
    //
    // The burst lives in a ref rather than closure variables: this closure is created
    // during render, and reassigning captured `let`s afterwards is the pattern React's
    // lint rules reject (it breaks under re-render).
    const cfg = configBurst.current;

    const flushConfig = () => {
      if (!cfg.timer) return;
      clearTimeout(cfg.timer);
      cfg.timer = null;

      const target = cfg.latest!;
      // Roll back to the value from before the whole burst, not the previous tick —
      // otherwise a failed write would strand the user mid-drag.
      const before = cfg.before!;
      const waiters = cfg.waiters;
      cfg.before = null; cfg.latest = null; cfg.waiters = [];

      void save(
        "Settings save",
        () => upsertConfig(target, store.get().profile.household_id),
        () => { patch({ config: target }); applyConfigToDomain(target); },
        () => { patch({ config: before }); applyConfigToDomain(before); },
      ).then((ok) => waiters.forEach((w) => w(ok)));
    };

    const setConfig = (c: Config): Promise<boolean> => {
      if (cfg.before === null) cfg.before = store.get().config;
      cfg.latest = c;
      // Apply now; persist shortly.
      patch({ config: c });
      applyConfigToDomain(c);

      if (cfg.timer) clearTimeout(cfg.timer);
      return new Promise<boolean>((resolve) => {
        cfg.waiters.push(resolve);
        cfg.timer = setTimeout(flushConfig, CONFIG_DEBOUNCE_MS);
      });
    };

    // Single owner of AI-key state: llmEnabled/aiProvider are updated here so no
    // other component needs its own shadow flag for "is AI on right now".
    const setAiKey = async (key: string) => {
      const res = await fetch("/api/ai-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Failed to save key"); }
      const { provider } = await res.json();
      patch({ llmEnabled: true, aiProvider: provider });
      return provider as string;
    };

    const removeAiKey = async () => {
      await fetch("/api/ai-key", { method: "DELETE" });
      patch({ llmEnabled: false, aiProvider: undefined });
    };

    // ---- Internal helpers ----
    // Not part of the public action surface, but they need the same stable identity
    // because the effects below list them as dependencies.

    // Re-pull household data (brews + coffees) — server is the source of truth.
    // Used by the foreground refresh so a brew sent from another device appears
    // without a full reload. Local optimistic writes have persisted by then.
    const refresh = async () => {
      if (!store.get().authed) return;
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
        patch({ coffees: c, brews: b, recipes: rec });
      } catch { /* transient — keep current state */ }
    };

    // Drain the durable offline outbox: run any writes that were queued while
    // offline, in order, then reconcile with the server. `drainOutbox` no-ops when
    // offline or already draining, and reports how many entries remain so the
    // "queued — will sync" indicator stays accurate.
    const syncOutbox = async () => {
      if (!store.get().authed) return;
      const res = await drainOutbox({
        onPermanentError: (entry, err) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const e = err as any;
          patch({ lastError: { message: `${entry.label} failed: ${e?.message ?? e?.code ?? String(err)}` } });
        },
      });
      patch({ queuedCount: res.remaining });
      if (res.drained > 0) void refresh();
    };

    const actions: AppActions = {
      addCoffee, updateCoffee, startBrew, rateBrew, updateBrew, dismissBrew, dismissBrewSession,
      setConfig,
      setProfile: (p: Profile) => patch({ profile: p }),
      clearError: () => patch({ lastError: null }),
      importCoffees, addRecipe, updateRecipe, deleteRecipe, setAiKey, removeAiKey,
    };

    return { actions, internals: { refresh, syncOutbox, learnNotes, learnVarietals, flushConfig } };
  }, [store, configBurst]);

  // `authed` flips asynchronously on the unseeded boot path (demo/unauthed -> session
  // resolves), and the effects below must re-run when it does. Subscribing to just
  // this one field is what makes them reactive again: reading store.get().authed
  // inside an effect whose deps never change would set nothing up. The provider
  // renders only `children`, whose identity is unchanged, so this re-render does not
  // propagate into the tree.
  const authed = useAuthed(store);

  // Check auth + load data — only when the server did NOT prefetch (demo/unauthed
  // path, or Supabase unconfigured). The authed first-load path is fully seeded above.
  useEffect(() => {
    const sb = createClient();
    const patch = (p: Partial<AppState>) => store.set((s) => ({ ...s, ...p }));

    if (!initialData) {
      // getSession() reads the cookie locally (no network round-trip); RLS still
      // enforces real access on the queries below.
      sb.auth.getSession().then(async ({ data: { session } }) => {
        const user = session?.user;
        if (!user) { patch({ ready: true }); return; }
        patch({ authed: true });
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
          // Authed: adopt the fetched data even when empty — an authed user with no
          // coffees/brews should see an empty shelf/journal, NOT the seed/dummy fallback.
          const next: Partial<AppState> = { coffees: c, brews: b, recipes: rec };
          if (p) next.profile = p;
          if (mem.length) next.members = mem;
          if (cfg) { next.config = cfg; applyConfigToDomain(cfg); }
          if (aiStatus?.set) { next.llmEnabled = true; next.aiProvider = aiStatus.provider; }
          if (notes) {
            setLearnedNotes(notes as Record<string, import("@/lib/flavour").FlavourFamily>);
            next.notesVersion = store.get().notesVersion + 1;
          }
          if (varietals && Object.keys(varietals).length) {
            setLearnedVarietals(varietals);
            next.varietalsVersion = store.get().varietalsVersion + 1;
          }
          patch(next);
        } catch { /* fall through to seed data */ }
        patch({ ready: true });
      });
    }

    // Listen for auth state changes (sign in / sign out)
    const { data: { subscription } } = sb.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        applyConfigToDomain(SEED_CONFIG);
        patch({
          coffees: [], brews: [], recipes: [], config: SEED_CONFIG,
          profile: SEED_PROFILE, members: [], llmEnabled: false, authed: false,
        });
      }
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run-once boot; store identity is constant
  }, []);

  // On the seeded first-load path the household members aren't prefetched, so
  // pull them once; and refresh data whenever the app returns to the foreground
  // (throttled), so handed-off brews surface without a manual reload.
  useEffect(() => {
    if (!authed) return;
    fetchHouseholdProfiles()
      .then((m) => { if (m.length) store.set((s) => ({ ...s, members: m })); })
      .catch(() => {});
    let last = Date.now();
    const onForeground = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last < 10000) return; // throttle bursts of focus/visibility events
      last = Date.now();
      internals.refresh();
    };
    document.addEventListener("visibilitychange", onForeground);
    window.addEventListener("focus", onForeground);
    return () => {
      document.removeEventListener("visibilitychange", onForeground);
      window.removeEventListener("focus", onForeground);
    };
  }, [authed, store, internals]);

  // A debounced settings write must not be lost if the app is backgrounded or closed
  // mid-burst. pagehide is the reliable signal on iOS, where unload never fires.
  useEffect(() => {
    const flush = () => internals.flushConfig();
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
      flush(); // provider unmounting — don't strand the write either
    };
  }, [internals]);

  // One-time background sweep: classify unknown notes already on the shelf so
  // existing grey chips heal without an edit. Runs once the data + AI key state
  // have settled (learned notes are loaded before `ready` flips on both paths).
  const sweptRef = useRef(false);
  const ready = useSyncExternalStore(store.subscribe, () => store.get().ready, () => store.get().ready);
  const llmEnabled = useSyncExternalStore(store.subscribe, () => store.get().llmEnabled, () => store.get().llmEnabled);
  useEffect(() => {
    if (sweptRef.current || !ready || !authed || !llmEnabled) return;
    sweptRef.current = true;

    // Deferred to idle: this fires unprompted on every boot when an AI key is set, and
    // classify.ts walks its chunks serially (deliberately — /api/classify-notes is
    // rate-limited per household with a token bucket, so firing the chunks in parallel
    // would burn the burst allowance on work nobody is waiting for). Nothing on screen
    // depends on the result, so it has no business competing with launch.
    const sweep = () => {
      const { coffees } = store.get();
      void internals.learnNotes(coffees.flatMap((c) => c.notes ?? []));
      void internals.learnVarietals(coffees.flatMap((c) => c.varietals ?? []));
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (typeof w.requestIdleCallback === "function") { w.requestIdleCallback(sweep, { timeout: 5000 }); return; }
    const t = setTimeout(sweep, 2000);
    return () => clearTimeout(t);
  }, [ready, authed, llmEnabled, store, internals]);

  // Drain the outbox on app start, whenever the browser comes back online, and
  // when the app returns to the foreground — the three moments connectivity is
  // most likely to have just been restored.
  useEffect(() => {
    if (!authed) return;
    // Defer the initial drain a tick so it doesn't set state synchronously during
    // the effect (drainOutbox is async and only sets state after its await).
    const kick = setTimeout(() => void internals.syncOutbox(), 0);
    const onOnline = () => void internals.syncOutbox();
    const onVisible = () => { if (document.visibilityState === "visible") void internals.syncOutbox(); };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(kick);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [authed, store, internals]);

  const value = useMemo(() => ({ store, actions }), [store, actions]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

function useCtx(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be inside AppProvider");
  return ctx;
}

/**
 * Subscribe to a slice of app state.
 *
 * The selector MUST return a primitive or an existing reference from state.
 * useSyncExternalStore compares snapshots with Object.is on every render, so a
 * selector that builds a new array or object (`s => s.brews.filter(...)`) would report
 * a change every time and loop forever. Derive in a useMemo downstream instead.
 */
export function useAppSelector<T>(selector: (s: AppState) => T): T {
  const { store } = useCtx();
  const read = () => selector(store.get());
  return useSyncExternalStore(store.subscribe, read, read);
}

/** The stable action object. Never changes identity, so it's safe in effect deps. */
export function useAppActions(): AppActions {
  return useCtx().actions;
}

/**
 * Whole-state access, kept for the many components that read several slices at once.
 *
 * This subscribes to *every* state change, so prefer useAppSelector in anything that
 * renders per-row. The returned object is memoised, so it stays referentially stable
 * between renders where nothing changed.
 */
export function useApp(): AppState & AppActions {
  const { store, actions } = useCtx();
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);
  return useMemo(() => ({ ...state, ...actions }), [state, actions]);
}

/**
 * Returns a `coffeeColor` mapper that repaints when learned notes arrive.
 *
 * Coffee colours are derived from tasting notes at render time — never stored on
 * the Coffee row — so SSR can't bake a stale colour and there's no cross-request
 * module-global hazard. coffeeColor is pure over notes + the module learned map; the
 * notesVersion subscription is purely the repaint trigger.
 *
 * Subscribing to notesVersion alone matters a lot: this hook is called by every shelf
 * row, journal card, CoffeePin and BrewDetail. It used to call useApp(), which meant
 * all of them re-rendered on any state change at all — including a queued-write
 * counter ticking.
 */
export function useCoffeeColor(): (notes: string[]) => string {
  useAppSelector((s) => s.notesVersion);
  return coffeeColor;
}

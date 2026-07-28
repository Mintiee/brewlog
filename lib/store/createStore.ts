/**
 * A minimal external store for useSyncExternalStore.
 *
 * Why not useState + context
 * --------------------------
 * AppProvider held 15 useState slots and handed a fresh object literal to a single
 * context. Every consumer therefore re-rendered on *any* state change — a queued-write
 * counter ticking re-rendered every shelf row and every journal card, because
 * useCoffeeColor subscribes each of them to the whole context.
 *
 * With an external store, components subscribe through a selector and only re-render
 * when their slice changes. It also makes the action identities permanently stable:
 * mutations read current state via `get()` at call time instead of closing over it, so
 * they no longer need `coffees`/`brews` in their useCallback deps — which is what makes
 * React.memo on the row components actually pay off.
 *
 * Deliberately tiny and dependency-free: no middleware, no devtools, no immer. The
 * mutation semantics (optimistic apply, rollback, retry, outbox) stay in AppContext.
 */
export interface Store<T> {
  /** Current snapshot. Stable identity until the next set() that actually changes it. */
  get: () => T;
  /**
   * Apply an update. The updater must return a NEW object when anything changed —
   * subscribers are notified only if the reference differs, so returning the same
   * object is the supported way to express "no change".
   */
  set: (updater: (prev: T) => T) => void;
  /** Subscribe to changes. Returns an unsubscribe function. */
  subscribe: (listener: () => void) => () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();

  return {
    get: () => state,

    set: (updater) => {
      const next = updater(state);
      if (Object.is(next, state)) return;
      state = next;
      // Copy before iterating: a listener may unsubscribe (or subscribe) during the
      // notify loop, and mutating the live Set mid-iteration would skip listeners.
      for (const l of [...listeners]) l();
    },

    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

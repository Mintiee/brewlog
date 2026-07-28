import { describe, it, expect, vi } from "vitest";
import { createStore } from "./createStore";

describe("createStore", () => {
  it("returns the initial snapshot", () => {
    const s = createStore({ n: 1 });
    expect(s.get()).toEqual({ n: 1 });
  });

  it("keeps snapshot identity stable between sets", () => {
    const s = createStore({ n: 1 });
    expect(s.get()).toBe(s.get());
  });

  it("notifies subscribers when the reference changes", () => {
    const s = createStore({ n: 1 });
    const spy = vi.fn();
    s.subscribe(spy);
    s.set((p) => ({ ...p, n: 2 }));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(s.get().n).toBe(2);
  });

  it("does not notify when the updater returns the same object", () => {
    // This is the documented no-op contract — mutations rely on it to bail out
    // without waking every subscriber in the app.
    const s = createStore({ n: 1 });
    const spy = vi.fn();
    s.subscribe(spy);
    s.set((p) => p);
    expect(spy).not.toHaveBeenCalled();
  });

  it("notifies for an equal-but-distinct object", () => {
    // useSyncExternalStore compares by identity, so a new reference must notify even
    // if it is structurally equal — anything else would drop legitimate updates.
    const s = createStore({ n: 1 });
    const spy = vi.fn();
    s.subscribe(spy);
    s.set(() => ({ n: 1 }));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("stops notifying after unsubscribe", () => {
    const s = createStore({ n: 1 });
    const spy = vi.fn();
    const off = s.subscribe(spy);
    off();
    s.set((p) => ({ ...p, n: 2 }));
    expect(spy).not.toHaveBeenCalled();
  });

  it("survives a listener unsubscribing during notification", () => {
    // React unsubscribes on unmount, which can happen inside a notify loop when one
    // component's update unmounts another. Iterating the live Set would skip listeners.
    const s = createStore({ n: 1 });
    const seen: string[] = [];
    const offA = s.subscribe(() => { seen.push("a"); offA(); });
    s.subscribe(() => { seen.push("b"); });
    s.set((p) => ({ ...p, n: 2 }));
    expect(seen).toEqual(["a", "b"]);

    seen.length = 0;
    s.set((p) => ({ ...p, n: 3 }));
    expect(seen).toEqual(["b"]);
  });

  it("sees the latest state inside a set updater", () => {
    // Mutations snapshot `prev` via get() at call time; sequential sets must compose.
    const s = createStore({ n: 0 });
    s.set((p) => ({ n: p.n + 1 }));
    s.set((p) => ({ n: p.n + 1 }));
    expect(s.get().n).toBe(2);
  });

  it("exposes the new state to a listener that reads get()", () => {
    const s = createStore({ n: 1 });
    let observed = -1;
    s.subscribe(() => { observed = s.get().n; });
    s.set(() => ({ n: 7 }));
    expect(observed).toBe(7);
  });
});

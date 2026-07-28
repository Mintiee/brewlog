import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openDatabase, idbRequest, resetConnections } from "./idb";

/**
 * A minimal IndexedDB stand-in. The point of these tests is the connection-reuse
 * contract, not IndexedDB semantics, so the fake only needs to count opens and let a
 * request resolve.
 */
function installFakeIndexedDB(opts: { failOpen?: boolean } = {}) {
  const state = { opens: 0, closed: 0, db: null as FakeDb | null };

  interface FakeReq { result: unknown; error: unknown; onsuccess: null | (() => void); onerror: null | (() => void) }

  class FakeDb {
    objectStoreNames = { contains: () => true };
    onversionchange: null | (() => void) = null;
    onclose: null | (() => void) = null;
    createObjectStore() {}
    close() { state.closed++; }
    transaction() {
      return {
        error: null,
        onabort: null as null | (() => void),
        objectStore: () => ({
          get: (): FakeReq => {
            const req: FakeReq = { result: "value", error: null, onsuccess: null, onerror: null };
            queueMicrotask(() => req.onsuccess?.());
            return req;
          },
        }),
      };
    }
  }

  (globalThis as unknown as { indexedDB: unknown }).indexedDB = {
    open() {
      state.opens++;
      const db = new FakeDb();
      state.db = db;
      const req: Record<string, unknown> = {
        result: db, error: new Error("open failed"),
        onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null,
      };
      queueMicrotask(() => {
        if (opts.failOpen) (req.onerror as (() => void) | null)?.();
        else (req.onsuccess as (() => void) | null)?.();
      });
      return req;
    },
  };

  return state;
}

const upgrade = () => {};

beforeEach(() => resetConnections());
afterEach(() => {
  resetConnections();
  delete (globalThis as unknown as { indexedDB?: unknown }).indexedDB;
});

describe("openDatabase", () => {
  it("opens the database once across many sequential calls", async () => {
    // This is the whole point of the module: draining N outbox entries used to open
    // and close the database 2 + 2N times.
    const state = installFakeIndexedDB();
    for (let i = 0; i < 10; i++) await openDatabase("db", 1, upgrade);
    expect(state.opens).toBe(1);
  });

  it("shares a single open across concurrent callers", async () => {
    // Startup fires several operations at once; they must not race into N opens.
    const state = installFakeIndexedDB();
    await Promise.all(Array.from({ length: 8 }, () => openDatabase("db", 1, upgrade)));
    expect(state.opens).toBe(1);
  });

  it("returns the same connection object every time", async () => {
    installFakeIndexedDB();
    const a = await openDatabase("db", 1, upgrade);
    const b = await openDatabase("db", 1, upgrade);
    expect(a).toBe(b);
  });

  it("keeps separate connections per database name", async () => {
    const state = installFakeIndexedDB();
    await openDatabase("one", 1, upgrade);
    await openDatabase("two", 1, upgrade);
    expect(state.opens).toBe(2);
  });

  it("never leaves the connection closed between operations", async () => {
    const state = installFakeIndexedDB();
    const db = await openDatabase("db", 1, upgrade);
    await idbRequest(db, "store", "readonly", (s) => (s as unknown as { get: () => IDBRequest<string> }).get());
    await idbRequest(db, "store", "readonly", (s) => (s as unknown as { get: () => IDBRequest<string> }).get());
    expect(state.closed).toBe(0);
    expect(state.opens).toBe(1);
  });

  it("does not cache a failed open", async () => {
    // A transient failure must not poison the connection for the rest of the session.
    const state = installFakeIndexedDB({ failOpen: true });
    await expect(openDatabase("db", 1, upgrade)).rejects.toBeTruthy();
    await expect(openDatabase("db", 1, upgrade)).rejects.toBeTruthy();
    expect(state.opens).toBe(2);
  });

  it("reopens after another tab triggers a version change", async () => {
    // Holding the connection would block the other tab's upgrade forever.
    const state = installFakeIndexedDB();
    await openDatabase("db", 1, upgrade);
    state.db!.onversionchange!();
    await openDatabase("db", 1, upgrade);
    expect(state.opens).toBe(2);
    expect(state.closed).toBe(1);
  });

  it("reopens after the connection closes unexpectedly", async () => {
    const state = installFakeIndexedDB();
    await openDatabase("db", 1, upgrade);
    state.db!.onclose!();
    await openDatabase("db", 1, upgrade);
    expect(state.opens).toBe(2);
  });
});

describe("idbRequest", () => {
  it("resolves the request result", async () => {
    installFakeIndexedDB();
    const db = await openDatabase("db", 1, upgrade);
    const out = await idbRequest(db, "store", "readonly", (s) => (s as unknown as { get: () => IDBRequest<string> }).get());
    expect(out).toBe("value");
  });
});

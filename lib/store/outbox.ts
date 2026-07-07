/**
 * Durable offline write outbox.
 *
 * When a kitchen write (log/rate a brew, adjust a bag) can't reach the server
 * because the device is offline, persist() enqueues its serialisable descriptor
 * here instead of rolling the optimistic state back — so the write survives a
 * reload and syncs when connectivity returns. The queue is FIFO by enqueue time,
 * which preserves ordering that matters (a brew patch after its insert).
 *
 * Storage is IndexedDB (browser-only; SSR-guarded — getStorage() returns null
 * where indexedDB is absent). The storage backend is injectable so tests can run
 * against an in-memory shim (see setOutboxStorage).
 */
import type { WriteDescriptor } from "@/lib/db/writeExecutors";
import { executeWrite } from "@/lib/db/writeExecutors";
import { isPermanent } from "./persist";

export interface OutboxEntry {
  id: string;
  label: string;
  descriptor: WriteDescriptor;
  enqueuedAt: number;
}

/** Minimal persistence contract — the IDB backend and the test shim both satisfy it. */
export interface OutboxStorage {
  add(entry: OutboxEntry): Promise<void>;
  getAll(): Promise<OutboxEntry[]>;
  remove(id: string): Promise<void>;
}

const DB_NAME = "brew-outbox";
const STORE = "writes";

// ---- IndexedDB backend (browser only) ----

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = run(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
      }),
  );
}

function idbStorage(): OutboxStorage {
  return {
    add: (entry) => tx("readwrite", (s) => s.put(entry)).then(() => undefined),
    getAll: () => tx<OutboxEntry[]>("readonly", (s) => s.getAll()),
    remove: (id) => tx("readwrite", (s) => s.delete(id)).then(() => undefined),
  };
}

// ---- Backend resolution (SSR-safe, injectable) ----

let storageOverride: OutboxStorage | null = null;
let cachedStorage: OutboxStorage | null = null;

/** Inject a storage backend (tests use an in-memory shim). Pass null to reset. */
export function setOutboxStorage(storage: OutboxStorage | null): void {
  storageOverride = storage;
  cachedStorage = null;
}

/** The active backend, or null when IndexedDB isn't available (SSR / private mode). */
function getStorage(): OutboxStorage | null {
  if (storageOverride) return storageOverride;
  if (cachedStorage) return cachedStorage;
  if (typeof indexedDB === "undefined") return null;
  cachedStorage = idbStorage();
  return cachedStorage;
}

// ---- Public API ----

function randomId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `ob_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * Persist a write descriptor for later sync. Returns true if it was durably
 * enqueued, false when no storage backend exists (caller should fall back to the
 * rollback path).
 */
export async function enqueueWrite(descriptor: WriteDescriptor, label: string): Promise<boolean> {
  const storage = getStorage();
  if (!storage) return false;
  try {
    await storage.add({ id: randomId(), label, descriptor, enqueuedAt: Date.now() });
    return true;
  } catch (err) {
    console.error("[outbox] enqueue failed:", err);
    return false;
  }
}

/** Number of writes currently waiting to sync (0 if no backend). */
export async function outboxSize(): Promise<number> {
  const storage = getStorage();
  if (!storage) return 0;
  try {
    return (await storage.getAll()).length;
  } catch {
    return 0;
  }
}

let draining = false;

export interface DrainResult {
  /** Entries removed this pass (succeeded or permanently dropped). */
  drained: number;
  /** Entries still queued after this pass. */
  remaining: number;
}

/**
 * Attempt to flush the queue in FIFO order.
 * - success → remove and continue;
 * - permanent error (constraint/RLS/schema) → drop and surface via onPermanentError, continue;
 * - transient error → stop, leaving this and later entries for the next drain
 *   (preserves ordering — e.g. a brew patch must not run before its insert).
 * No-op (returns current size) when offline or another drain is in flight.
 */
export async function drainOutbox(handlers?: {
  onPermanentError?: (entry: OutboxEntry, err: unknown) => void;
}): Promise<DrainResult> {
  const storage = getStorage();
  if (!storage) return { drained: 0, remaining: 0 };
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { drained: 0, remaining: await outboxSize() };
  }
  if (draining) return { drained: 0, remaining: await outboxSize() };
  draining = true;
  try {
    const entries = (await storage.getAll()).sort(
      (a, b) => a.enqueuedAt - b.enqueuedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    let drained = 0;
    for (const entry of entries) {
      try {
        await executeWrite(entry.descriptor);
        await storage.remove(entry.id);
        drained++;
      } catch (err) {
        if (isPermanent(err)) {
          await storage.remove(entry.id);
          drained++;
          handlers?.onPermanentError?.(entry, err);
          continue; // drop the poison entry, keep draining the rest
        }
        break; // transient — retry on the next drain, preserving FIFO order
      }
    }
    return { drained, remaining: (await storage.getAll()).length };
  } finally {
    draining = false;
  }
}

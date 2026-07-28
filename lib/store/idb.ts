/**
 * A single, shared IndexedDB connection.
 *
 * The outbox used to call indexedDB.open() for every individual operation and close
 * the connection again on transaction complete, so a drain of N queued writes opened
 * and tore down the database 2 + 2N times. Opening is asynchronous and not free, and
 * it happens exactly when the app is busiest — coming back online with work to flush.
 *
 * This memoises the open request, so the connection is established once and reused.
 * The promise (not the database) is cached, so concurrent callers during startup share
 * one open request rather than racing to create several.
 */

/** Cached open request, keyed by database name. */
const connections = new Map<string, Promise<IDBDatabase>>();

/**
 * Open (or reuse) a database connection.
 *
 * `upgrade` runs only when the stored version is older than `version`.
 */
export function openDatabase(
  name: string,
  version: number,
  upgrade: (db: IDBDatabase) => void,
): Promise<IDBDatabase> {
  const existing = connections.get(name);
  if (existing) return existing;

  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = () => upgrade(req.result);
    req.onsuccess = () => {
      const db = req.result;
      // Another tab wants to upgrade the schema. Holding a connection open would
      // block it indefinitely, so stand aside and let the next call reopen.
      db.onversionchange = () => { db.close(); connections.delete(name); };
      // A connection can also die on its own (storage eviction, tab suspension);
      // dropping the cache entry means the next call transparently reconnects.
      db.onclose = () => { connections.delete(name); };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error(`IndexedDB upgrade for "${name}" is blocked by another tab`));
  });

  // Don't cache a failed open — otherwise one transient failure poisons the app for
  // the rest of the session.
  connections.set(name, opening);
  opening.catch(() => connections.delete(name));
  return opening;
}

/** Run one request against an object store and resolve its result. */
export function idbRequest<T>(
  db: IDBDatabase,
  store: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const request = run(transaction.objectStore(store));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    // The connection deliberately stays open — see the module comment.
    transaction.onabort = () => reject(transaction.error);
  });
}

/** Testing seam: forget any cached connections. */
export function resetConnections(): void {
  connections.clear();
}

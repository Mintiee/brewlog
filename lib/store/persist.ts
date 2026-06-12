/**
 * Shared write pipeline for optimistic mutations.
 *
 * Callers update local state first, then hand the DB write to persist().
 * persist retries transient failures (with one wait-for-online pass when the
 * browser is offline), and on final failure runs the caller's rollback and
 * surfaces the error with a retry affordance. No write fails silently.
 *
 * The in-flight counter lets the foreground refresh avoid snapshotting the
 * server mid-write (see AppContext.refresh).
 */

export interface PersistOptions {
  /** Restore the optimistic state when the write finally fails. */
  rollback?: () => void;
  /** Surface the failure. `retry` re-applies the optimistic state (caller's
   *  closure) and re-runs the write through persist again. */
  onError: (message: string, retry: () => void) => void;
  /** Transient-failure retries after the first attempt (default 2). */
  retries?: number;
}

const RETRY_DELAYS_MS = [600, 2500];
const ONLINE_WAIT_CAP_MS = 30_000;

let inflight = 0;
let idleWaiters: (() => void)[] = [];

export function writesInFlight(): number {
  return inflight;
}

/** Resolves when no writes are in flight (immediately if already idle). */
export function writesIdle(): Promise<void> {
  if (inflight === 0) return Promise.resolve();
  return new Promise((resolve) => idleWaiters.push(resolve));
}

function settleIdle() {
  if (inflight === 0 && idleWaiters.length) {
    const waiters = idleWaiters;
    idleWaiters = [];
    waiters.forEach((w) => w());
  }
}

/** Errors that retrying can never fix: constraint violations (23xxx), SQL/
 *  schema errors (42xxx), and PostgREST auth/JWT errors. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isPermanent(err: any): boolean {
  const code = String(err?.code ?? "");
  return /^23\d{3}$/.test(code) || /^42\w{3}$/.test(code) || /^PGRST3\d{2}$/.test(code);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Wait for the browser to come back online, capped so a long outage still
 *  fails the write (and surfaces the banner) rather than hanging forever. */
function waitForOnline(): Promise<void> {
  if (typeof navigator === "undefined" || navigator.onLine) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => { window.removeEventListener("online", done); clearTimeout(cap); resolve(); };
    const cap = setTimeout(done, ONLINE_WAIT_CAP_MS);
    window.addEventListener("online", done);
  });
}

/**
 * Run a DB write with retry/backoff. Returns true on success, false on final
 * failure (after rollback + onError have run). Never throws.
 */
export async function persist(
  label: string,
  write: () => Promise<unknown>,
  opts: PersistOptions,
): Promise<boolean> {
  const retries = opts.retries ?? RETRY_DELAYS_MS.length;
  inflight++;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let lastErr: any;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) {
        await waitForOnline();
        await sleep(RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)]);
      }
      try {
        await write();
        return true;
      } catch (err) {
        lastErr = err;
        if (isPermanent(err)) break;
      }
    }
    console.error(`[persist] ${label} failed:`, lastErr);
    opts.rollback?.();
    const detail = lastErr?.message ?? lastErr?.code ?? String(lastErr);
    opts.onError(`${label} failed: ${detail}`, () => { void persist(label, write, opts); });
    return false;
  } finally {
    inflight--;
    settleIdle();
  }
}

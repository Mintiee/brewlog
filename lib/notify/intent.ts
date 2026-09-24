/**
 * The page side of the notification-tap mailbox.
 *
 * On a tap, `notificationclick` in public/sw.js does two things. It writes the
 * route to a Cache Storage entry, then it focuses the open window and
 * postMessages the same route. The message is the fast path. The mailbox is the
 * one that works reliably: on iOS, a suspended home-screen app that is brought
 * forward by a tap comes back exactly as it was left. WebKit drops both the
 * postMessage and the openWindow URL, so the route only ever arrived on a cold
 * start. Here the page pulls the route itself every time it comes to the front
 * (see AppShell), so neither delivery has to succeed.
 *
 * A single tap can arrive by several paths (message, mailbox, launch URL), so
 * every intent carries an id and is claimed at most once.
 *
 * Keep INTENT_CACHE / INTENT_KEY in sync with public/sw.js.
 */

export const INTENT_CACHE = "brewlog-intent";
export const INTENT_KEY = "/__nudge-intent";

/** A tap older than this is from an earlier visit. Acting on it now would open a
 *  sheet the user never asked for. */
export const INTENT_MAX_AGE_MS = 10 * 60 * 1000;

export interface NudgeIntent {
  id: string;
  /** In-app route, e.g. "/?rate=<brewId>" or "/?log=1". */
  url: string;
  /** When the notification was tapped (ms epoch, the worker's clock). */
  at: number;
}

let lastClaimed: string | null = null;

/** Validate, age-check, and claim once. Returns null for anything malformed,
 *  stale, or already handled. */
export function claimNudgeIntent(raw: unknown, now = Date.now()): NudgeIntent | null {
  if (!raw || typeof raw !== "object") return null;
  const { id, url, at } = raw as Partial<NudgeIntent>;
  if (typeof id !== "string" || typeof url !== "string" || typeof at !== "number") return null;
  if (now - at > INTENT_MAX_AGE_MS || at - now > INTENT_MAX_AGE_MS) return null;
  if (id === lastClaimed) return null;
  lastClaimed = id;
  return { id, url, at };
}

/** Read and clear the mailbox. The entry is deleted even when it's rejected, so a
 *  stale or duplicate intent can't be picked up again on the next foreground. */
export async function takeNudgeIntent(now = Date.now()): Promise<NudgeIntent | null> {
  if (typeof caches === "undefined") return null;
  try {
    const cache = await caches.open(INTENT_CACHE);
    const res = await cache.match(INTENT_KEY);
    if (!res) return null;
    await cache.delete(INTENT_KEY);
    return claimNudgeIntent(await res.json(), now);
  } catch {
    return null; // Cache Storage unavailable (private mode, etc.). The message path still works.
  }
}

/** Test hook: forget which intent was last claimed. */
export function resetNudgeIntentClaims() {
  lastClaimed = null;
}

// Minimal service worker — enough to make brewlog installable on Android/desktop Chrome.
// (iOS installs via Add-to-Home-Screen and doesn't require this.)
//
// Strategy:
//  - Cross-origin requests (Supabase, etc.) are never intercepted — they pass straight through.
//  - Navigations: network-first with a timeout, falling back to the cached app shell
//    when offline *or* when the network is merely slow — see networkFirstNavigation.
//  - Same-origin static assets (hashed /_next/static/ chunks, /maps/ outlines, icons,
//    manifest): cache-first with a background revalidate (stale-while-revalidate), since
//    hashed assets are immutable and non-hashed ones are cheap to refresh silently.
//  - Everything else same-origin GET: runtime-cached as it's fetched, so a previously-visited
//    app keeps working offline (warm-offline). A full cold-offline precache of hashed Next
//    chunks would need a build-time asset manifest — out of scope here.
//
// Bump CACHE_VERSION whenever the caching strategy or precache list changes; old versioned
// caches are pruned on activate.

const CACHE_VERSION = "v6";
const CACHE = `brewlog-shell-${CACHE_VERSION}`;

// Notification-tap mailbox (see notificationclick below and lib/notify/intent.ts,
// which must use the same names). It isn't versioned and is never pruned: it holds
// one short-lived entry, not cached content.
const INTENT_CACHE = "brewlog-intent";
const INTENT_KEY = "/__nudge-intent";

// Country outline silhouettes for every code in ORIGIN_CODES (lib/domain/index.ts),
// vendored same-origin by scripts/fetch-outlines.mjs. Precached rather than left to
// runtime caching so a bag added later — for an origin whose outline was never
// displayed — still renders offline. ~67 KB brotli for the full set, fetched after
// `load` (see components/ServiceWorker.tsx), so it never competes with first paint.
// Keep in sync with public/maps/ and bump CACHE_VERSION when the set changes.
const OUTLINES = [
  "bi", "bo", "br", "cd", "cn", "co", "cr", "ec", "et", "gt", "hn", "id",
  "in", "ke", "mx", "ni", "pa", "pe", "pg", "rw", "sv", "tz", "ug", "ye",
].map((cc) => `/maps/${cc}.svg`);

const SHELL = ["/", ...OUTLINES];

const isStaticAsset = (url) =>
  url.pathname.startsWith("/_next/static/") ||
  url.pathname.startsWith("/maps/") ||
  url.pathname === "/manifest.webmanifest" ||
  url.pathname === "/icon-192.png" ||
  url.pathname === "/icon-512.png" ||
  url.pathname === "/apple-touch-icon.png" ||
  url.pathname === "/favicon.ico";

self.addEventListener("install", (event) => {
  // Per-entry rather than cache.addAll: addAll is all-or-nothing, so a single failed
  // outline would reject the whole batch and leave us with nothing precached — not
  // even the app shell. Each entry is allowed to fail independently; anything missed
  // here is picked up later by the runtime cache-first path.
  event.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(SHELL.map((url) => c.add(url).catch(() => {})))
    ).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE && k !== INTENT_CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function cacheFirstWithRevalidate(req) {
  return caches.open(CACHE).then((cache) =>
    cache.match(req).then((cached) => {
      const fetchAndUpdate = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => undefined);
      // Serve cached immediately if present; otherwise wait on the network.
      return cached || fetchAndUpdate || fetch(req);
    })
  );
}

/** How long a navigation waits for the network before falling back to cache (ms). */
const NAV_TIMEOUT_MS = 1500;

/**
 * Navigations: network-first, but only for NAV_TIMEOUT_MS.
 *
 * Plain network-first means a flaky connection blocks launch indefinitely — the
 * request neither succeeds nor fails, so the user stares at nothing while the app
 * shell sits in the cache, already usable. Racing against a timeout bounds that: a
 * healthy network still wins (it's well under 1.5s), and a bad one degrades to the
 * cached shell instead of hanging.
 *
 * The cached shell is genuinely useful rather than empty, because app/page.tsx
 * serialises its prefetched data into the HTML — so the fallback carries the last
 * known coffees/brews/config with it, and the client revalidates in the background
 * on the next foreground refresh.
 *
 * The network response is still cached when it eventually arrives, even if the
 * timeout already won the race, so the next launch starts from fresher data.
 *
 * Entries are keyed by path with the query dropped. The page ignores the query on
 * the server (deep links like /?rate=<id> are read on the client), so the HTML is
 * the same either way. Keying by the full URL stored one copy per notification,
 * and none of them was ever hit again.
 */
function networkFirstNavigation(req) {
  const key = new URL(req.url);
  key.search = "";
  const network = fetch(req)
    .then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(key.href, copy)).catch(() => {});
      }
      return res;
    });

  const cached = () => caches.match(key.href).then((hit) => hit || caches.match("/"));

  // Resolves to undefined on timeout, so the race below can tell "slow" from "done".
  const timeout = new Promise((resolve) => setTimeout(() => resolve(undefined), NAV_TIMEOUT_MS));

  return Promise.race([network.catch(() => undefined), timeout])
    .then((res) => res || cached().then((hit) => hit || network))
    // Offline with nothing cached: surface the real network error.
    .catch(() => cached().then((hit) => hit || network));
}

function runtimeCacheGet(req) {
  return fetch(req)
    .then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    })
    .catch(() => caches.match(req));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Never intercept cross-origin requests (Supabase, third-party APIs, etc.) — let the
  // browser handle them untouched so failures surface as real network errors, not a
  // JSON-parse error from an HTML shell fallback.
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(networkFirstNavigation(req));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirstWithRevalidate(req));
    return;
  }

  event.respondWith(runtimeCacheGet(req));
});

// ---------------------------------------------------------------------------
// Push nudges (see app/api/notify/run and lib/notify/*).
//
// Two kinds arrive here: "rate that brew?" and "log a coffee?". The payload is
// three short strings — title, body, and the in-app URL to open — so there is
// nothing to fetch and nothing to decode beyond JSON.
// ---------------------------------------------------------------------------

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return; // never show a notification we can't read
  }

  const { title, body, url, tag } = payload;
  if (!title) return;

  event.waitUntil(
    self.registration.showNotification(title, {
      body: body || "",
      // Same tag replaces rather than stacks, so a second tick can never leave
      // two copies of the same nudge on the lock screen.
      tag: tag || "brewlog",
      renotify: false,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  const intent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    url,
    at: Date.now(),
  };

  // Mailbox first, then the fast path. On iOS, a suspended home-screen app that is
  // brought forward by a tap comes back exactly as it was left: WebKit drops both
  // the postMessage and the openWindow URL. So the page also pulls this entry
  // whenever it comes to the front (AppShell, via lib/notify/intent.ts), and that
  // pull is what actually makes the tap land.
  const stash = caches
    .open(INTENT_CACHE)
    .then((c) =>
      c.put(
        INTENT_KEY,
        new Response(JSON.stringify(intent), { headers: { "Content-Type": "application/json" } })
      )
    )
    .catch(() => {});

  event.waitUntil(
    stash
      .then(() => self.clients.matchAll({ type: "window", includeUncontrolled: true }))
      .then((clients) => {
        // Prefer an already-open window: the app is a single client-side shell, so
        // reopening it would throw away in-progress state (a half-filled brew
        // draft, the current tab). Tell the live one where to go instead.
        for (const client of clients) {
          if (new URL(client.url).origin !== self.location.origin) continue;
          client.postMessage({ type: "brewlog:navigate", intent });
          return client.focus();
        }
        return self.clients.openWindow(url);
      })
  );
});

// Chrome rotates endpoints without warning. There is no session in here to
// re-authenticate with, so we can't re-register from the worker — but we can
// drop the stale endpoint so the next app open (which calls syncPushSubscription)
// creates a clean one rather than adding a second row.
self.addEventListener("pushsubscriptionchange", (event) => {
  const old = event.oldSubscription;
  if (!old) return;
  event.waitUntil(
    fetch(`/api/notify/subscribe?endpoint=${encodeURIComponent(old.endpoint)}`, {
      method: "DELETE",
      credentials: "include",
    }).catch(() => {})
  );
});

// Minimal service worker — enough to make brewlog installable on Android/desktop Chrome.
// (iOS installs via Add-to-Home-Screen and doesn't require this.)
//
// Strategy:
//  - Cross-origin requests (Supabase, etc.) are never intercepted — they pass straight through.
//  - Navigations: network-first, falling back to the cached app shell when offline.
//  - Same-origin static assets (hashed /_next/static/ chunks, /maps/ outlines, icons,
//    manifest): cache-first with a background revalidate (stale-while-revalidate), since
//    hashed assets are immutable and non-hashed ones are cheap to refresh silently.
//  - Everything else same-origin GET: runtime-cached as it's fetched, so a previously-visited
//    app keeps working offline (warm-offline). A full cold-offline precache of hashed Next
//    chunks would need a build-time asset manifest — out of scope here.
//
// Bump CACHE_VERSION whenever the caching strategy or precache list changes; old versioned
// caches are pruned on activate.

const CACHE_VERSION = "v3";
const CACHE = `brewlog-shell-${CACHE_VERSION}`;

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
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
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

function networkFirstNavigation(req) {
  return fetch(req)
    .then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    })
    .catch(() => caches.match(req).then((hit) => hit || caches.match("/")));
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

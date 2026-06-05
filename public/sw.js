// Minimal service worker — enough to make brewlog installable on Android/desktop Chrome.
// (iOS installs via Add-to-Home-Screen and doesn't require this.)
// A network-first passthrough with an offline fallback to the app shell.

const CACHE = "brewlog-shell-v1";
const SHELL = ["/"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
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

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Only handle GET navigations/assets; let everything else (POST to /api, auth) pass through.
  if (req.method !== "GET") return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        // Cache same-origin successful responses for offline use.
        if (res.ok && new URL(req.url).origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("/")))
  );
});

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Never cache the service worker itself, so updates ship immediately.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
      {
        // Country outlines: content is pinned to a mapsicon commit (see
        // scripts/fetch-outlines.mjs), so it effectively never changes — but the
        // filenames aren't content-hashed, so `immutable` would strand anyone
        // without a service worker on stale art if we ever re-pin. A day of
        // freshness plus a week of stale-while-revalidate gets the caching win
        // while still letting a re-pin propagate on its own.
        source: "/maps/:file*.svg",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
        ],
      },
    ];
  },
};

export default nextConfig;

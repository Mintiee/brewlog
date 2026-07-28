# Performance baseline

Captured before the performance/responsiveness pass (branch `perf/responsiveness-pass`).
Reproduce with the commands in [Method](#method); compare after each phase.

Next.js 16.2.7 (Turbopack) · React 19.2.4 · Node v24.14.0

---

## Client bundle — before

| Metric | Value |
|---|---|
| Total client JS | **1348.0 KB** across 15 files |
| Total client JS (gzipped) | **379.2 KB** |
| Font files | **10 woff2, 128.3 KB** |

### Largest chunks

| Size | Chunk | Contains |
|---|---|---|
| 272.4 KB | `2h9g7h02nrizg.js` | Supabase client |
| 272.4 KB | `01yho1zgahh3i.js` | Supabase client (duplicate fingerprint) |
| 227.3 KB | `3w8d8k_dca5rp.js` | |
| 198.0 KB | `3eh39a9dskcug.js` | |
| 186.4 KB | `2ilx-quq1xw35.js` | **papaparse** (confirmed via `ParserHandle`/`__parsed_extra` markers) |
| 110.0 KB | `0cz1d0mv5g_q7.js` | |
| 56.6 KB | `158myu8e_yme3.js` | |

Turbopack builds don't print a First Load JS table, so chunk bytes on disk are the
tracked metric. Route table for reference: `/` and all `/api/*` are dynamic (`ƒ`),
`/login` and `/_not-found` are static (`○`).

**Known waste in this baseline:**
- papaparse (~45 KB min) is in the eager bundle for a feature behind Settings → Import.
- 10 font files: `app/layout.tsx` passes explicit `weight` arrays to two *variable*
  Google fonts, forcing static per-weight cuts instead of 2 variable files.
- Zero `next/dynamic` / `React.lazy` / `Suspense` in the repo — 48 `'use client'`
  files in one monolithic tree.

---

## Launch timeline — before

Measured qualitatively from source; re-measure in DevTools before/after.

```
navigation
  └─ TTFB          app/page.tsx: await createClient()
                   → await supabase.auth.getUser()      ← full auth RTT, blocking
                   → await Promise.all([8 queries])     ← only 1 needs getUser's result
  └─ hydration     entire app is one client chunk
  └─ +1200 ms      AppShell.tsx:15 SPLASH_FLOOR_MS      ← artificial floor
  └─ tabs mount    first <img src="cdn.jsdelivr.net/..."> enters the DOM here
  └─ +DNS/TLS/RTT  country outline finally paints
```

Outline requests cannot begin until ~1.2 s after first client paint, because the
`mounted` gate (`AppShell.tsx:87,112`) means the server emits only `<Splash />` —
the preload scanner never sees the image URLs.

---

## Render cost — before

Hot paths, all unmemoised at baseline:

| Location | Cost |
|---|---|
| `components/ui/Icon.tsx:21` | Rebuilds a 44-entry JSX table **inside the component body** on every icon render. `StarsMini` = 5 icons/card; a ~270-card Journal ⇒ ~1,350 icons × 44 discarded entries. |
| `components/shelf/Shelf.tsx:31-53` | Zero `useMemo`. `coffeeStatus()` (3 full scans of `brews`) called **inside a sort comparator** at `:44-45`, twice per comparison. |
| `components/shelf/ShelfRow.tsx:18-21` | Each row recomputes `activeGrams` + `coffeeStatus` — 5 more full brew scans per row. |
| `components/brew/StepWhat.tsx:115-132` | `decorated` / `sortByDay` / `hasFrozen` / 14-day `byDay` loop, all per render; 30 s `setInterval` at `:109` forces re-render while anything is pending. |
| `lib/store/AppContext.tsx:561` | Context value is a fresh object literal every render; 15 state slots, no selectors. |
| whole repo | **Zero `React.memo`.** Every shelf row and journal card is a full-context subscriber (via `useCoffeeColor`, `:588`). |

Domain primitives nest and each rescans all brews (`lib/domain/index.ts:148-173`):
`coffeeStatus` → `frozenGramsOf` + `activeGrams` → `remainingGrams` ×3 → `gramsUsed` ×3.
Net shape is **O(coffees × brews)** per render, against a `limit(2000)` brew fetch
(`lib/db/index.ts:63`).

---

## Caching — before

| Layer | State |
|---|---|
| Country outlines | `cdn.jsdelivr.net/gh/djaiss/mapsicon`, unversioned (tracks default branch), cross-origin. `public/sw.js:90` refuses to cache cross-origin ⇒ never precached, never offline. |
| App data | Not cached client-side at all. Every cold boot refetches coffees + brews + recipes + config from Supabase. |
| Offline | Shell renders with **zero data**. |
| IndexedDB | Offline write outbox only (`lib/store/outbox.ts`), and it opens/closes the DB once per operation. |
| Learned notes/varietals | Unbounded `select` on a **globally shared cross-household table**, on every boot (`lib/db/index.ts:171,183`). |

`public/maps/` and `lib/assets/` exist but are empty and untracked — localisation was
scaffolded and abandoned.

---

## Method

```bash
npm run build

# total client JS + file count
find .next/static -name "*.js" -type f -printf "%s\n" \
  | awk '{s+=$1} END {printf "%.1f KB across %d files\n", s/1024, NR}'

# gzipped total
find .next/static -name "*.js" -type f -exec gzip -c {} \; | wc -c \
  | awk '{printf "%.1f KB\n", $1/1024}'

# largest chunks
find .next/static -name "*.js" -type f -printf "%s\t%p\n" | sort -rn | head -15 \
  | awk -F'\t' '{printf "%8.1f KB  %s\n", $1/1024, $2}'

# fonts
find .next/static -name "*.woff2" -printf "%s\n" \
  | awk '{s+=$1} END {printf "%d files, %.1f KB\n", NR, s/1024}'

# is papaparse in the client bundle?
grep -l "ParserHandle\|__parsed_extra" .next/static/chunks/*.js
```

Runtime checks (DevTools, throttled to Fast 3G):
1. Cold load — time from navigation to first country silhouette painted.
2. Reload with SW warm — confirm no network request for outlines.
3. Offline reload of the installed PWA — does the shell render with data?
4. React Profiler — commit count and duration for a tab switch to Shelf, and for a
   full Journal scroll. Check whether rows re-render on unrelated state changes.

---

## After

### Phase 3 — derive layer (measured)

Shelf's per-render derivation workload, old (nested per-coffee primitives, including
the in-comparator `coffeeStatus` and the per-row recompute) vs new (`buildCoffeeStats`).
Measured with a throwaway vitest benchmark, 20-100 iterations each, on the dev machine:

| Shelf size | Before | After | |
|---|---|---|---|
| 10 coffees × 200 brews | 0.19 ms | 0.040 ms | 5× |
| 30 coffees × 1000 brews | 1.98 ms | 0.078 ms | 25× |
| 40 coffees × 2000 brews | 4.23 ms | 0.093 ms | 46× |

The shape matters more than the ratio: the old path scales with coffees × brews, so it
degrades as the user logs more. The new path is O(B + C) and barely moves — 0.040 ms to
0.093 ms while the data grows 20×. On a mid-range phone the 4.23 ms figure is more like
15-20 ms, i.e. a dropped frame on every Shelf render, and Shelf re-rendered on every
context change.

The benchmark itself was deliberately not kept — wall-clock assertions are flaky in CI.
The durable guards are in `lib/domain/derive.test.ts`: a parity suite (84 assertions
across hand-written edge cases and 40 pseudo-random shelves) proving `buildCoffeeStats`
agrees with the primitives it replaces, and a deterministic complexity test that counts
property reads to prove the brew list is scanned exactly once regardless of coffee count.

### Phase 5 — code splitting (measured)

Before this pass the repo contained **zero** `next/dynamic` / `React.lazy` / `Suspense`
(verified by grep), so every module was in the eager client entry for `/`.

Eager set is now **427.7 KB across 8 chunks**, measured from
`.next/server/app/page_client-reference-manifest.js` (Turbopack doesn't emit
`app-build-manifest.json`, so that manifest is the source of truth for which chunks the
route actually pulls). Provably moved *off* it:

| Module | Chunk | Size |
|---|---|---|
| Settings tab + ImportSheet + `lib/import/*` + **papaparse** | `38vwk7by_yl46.js` | 51.8 KB |
| Stats stack (StatsView, BrewingTips, InsightCard, …) | `2cy6y70c_r12p.js` | 22.8 KB |
| CoffeeDetail + AddCoffee + BrewDetail | (out of the Shelf/BrewFlow chunk, which fell 92.6 → 59.9 KB) | 32.7 KB |

The three primary tabs stay statically imported deliberately — tab switching must not
flicker. Settings is warmed on `requestIdleCallback`, so the split costs nothing on
first open in practice.

Total client JS rose slightly (1348.0 → ~1356 KB) because splitting adds module
wrappers. That's the right trade: total bytes across all chunks is not what a user
waits for on launch — the eager set is.

Reproduce with `scripts/`-free one-liner:

```bash
node -e "const fs=require('fs');const m=fs.readFileSync('.next/server/app/page_client-reference-manifest.js','utf8');
const e=[...new Set(m.match(/static\/chunks\/[A-Za-z0-9_-]+\.js/g))];
console.log(e.length+' chunks, '+(e.reduce((s,c)=>s+fs.statSync('.next/'+c).size,0)/1024).toFixed(1)+' KB')"
```

### Phase 6 — caching (scope changed after a finding)

The plan called for an IndexedDB read-cache so offline wouldn't show an empty shell.
**That premise turned out to be wrong.** `public/sw.js` precaches `"/"` with
`cache.add()` (which sends cookies) and re-caches it on every successful navigation —
and `app/page.tsx` serialises `initialData` into that HTML. So the service worker cache
already holds a complete data snapshot: coffees, brews, recipes, config.

An IndexedDB cache would therefore have duplicated the SW cache while introducing a
real coherency problem: two snapshots on boot (the one baked into the served HTML and
the IDB one) with no clock-safe way to decide which is newer, since server and client
clocks differ. Dropped by agreement; the two changes that were actually worth making:

1. **Navigations are network-first with a 1500 ms timeout.** Plain network-first meant
   a flaky connection blocked launch indefinitely — neither succeeding nor failing —
   while a usable shell sat in the cache. A healthy network still wins the race; a bad
   one now degrades to the cached shell (with its embedded data) instead of hanging.
   The network response is still cached when it eventually lands.

2. **One shared IndexedDB connection** (`lib/store/idb.ts`). The outbox opened *and
   closed* the database for every operation, so draining N queued writes cost 2 + 2N
   open/close cycles — precisely when the device has just come back online and is
   trying to flush work. Nine tests cover the reuse contract, including concurrent
   callers sharing one open, not caching a failed open, and reopening when another tab
   triggers a version change.

_Remaining phases filled in as they land._

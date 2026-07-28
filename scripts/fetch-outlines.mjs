#!/usr/bin/env node
/**
 * Vendors the country outline silhouettes used by <OriginTile> into public/maps/.
 *
 * Why this exists
 * ---------------
 * OriginTile used to point <img> straight at cdn.jsdelivr.net/gh/djaiss/mapsicon.
 * That was cross-origin (so public/sw.js:90 deliberately refused to cache it — no
 * offline, no precache), unversioned (the URL tracked the repo's default branch, so
 * the artwork could change under us), and it put DNS + TLS on the critical path for
 * the first shelf paint. Serving the same files same-origin makes them cacheable,
 * precacheable, offline-capable, and pinned.
 *
 * Source
 * ------
 * djaiss/mapsicon, pinned to SOURCE_SHA below. The repo has been frozen by its
 * author since 2017 ("I won't update anymore this repository"), so the pin is stable.
 * Licence: "Do what you want with them as long as you mention me in your project.
 * Please don't resell them." Attribution lives in public/maps/LICENSE.md — keep it
 * there.
 *
 * Usage
 * -----
 *   node scripts/fetch-outlines.mjs          # write public/maps/
 *   node scripts/fetch-outlines.mjs --check  # verify vendored files are current, write nothing
 *
 * The country list is read out of lib/domain/index.ts so ORIGIN_CODES stays the
 * single source of truth — add an origin there and re-run this, don't hand-add SVGs.
 */

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOMAIN_TS = join(ROOT, "lib", "domain", "index.ts");
const OUT_DIR = join(ROOT, "public", "maps");
const SW_JS = join(ROOT, "public", "sw.js");

/** djaiss/mapsicon @ master, frozen 2017-07-22. Pinned so the artwork can't shift. */
const SOURCE_SHA = "33ba28808f8d32b5bae0ffada9cadd07073852e1";
const SOURCE_URL = (cc) =>
  `https://raw.githubusercontent.com/djaiss/mapsicon/${SOURCE_SHA}/all/${cc}/vector.svg`;

const CHECK_ONLY = process.argv.includes("--check");
const CONCURRENCY = 6;

/**
 * Pull the ISO-2 codes out of the ORIGIN_CODES object literal in lib/domain/index.ts.
 * Deliberately a text parse rather than an import: this script stays dependency-free
 * and runnable without a TS loader. It throws loudly if the literal's shape changes,
 * which is the behaviour we want — silently vendoring the wrong set would be worse.
 */
async function readOriginCodes() {
  const src = await readFile(DOMAIN_TS, "utf8");
  const block = src.match(/export const ORIGIN_CODES[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!block) {
    throw new Error(
      `Could not find the ORIGIN_CODES object literal in ${DOMAIN_TS}. ` +
      `If it was renamed or reformatted, update the regex in scripts/fetch-outlines.mjs.`,
    );
  }
  const codes = [...block[1].matchAll(/:\s*"([a-z]{2})"/g)].map((m) => m[1]);
  const unique = [...new Set(codes)];
  if (!unique.length) throw new Error("ORIGIN_CODES parsed to an empty list — refusing to continue.");
  return unique.sort();
}

/**
 * Strip potrace's prolog and rebuild a minimal SVG.
 *
 * Only structural waste is removed — the path geometry is passed through byte-for-byte.
 * mapsicon's coordinates are already integers (potrace emits a 10x space plus a
 * scale(0.1) transform, which is the precision trick already applied), so there are no
 * decimals to round off. Further shrinking would mean resampling the curves, which
 * needs a real geometry library and risks visibly mangling the silhouettes — not worth
 * it for artwork rendered at 30-56px behind a brightness(0) filter.
 */
function minifySvg(raw, cc) {
  const viewBox = raw.match(/viewBox="([^"]+)"/)?.[1];
  if (!viewBox) throw new Error(`[${cc}] no viewBox in source SVG`);

  // Normalise potrace's "1024.000000" / "0.100000" style numbers.
  const trimNums = (s) => s.replace(/(\d)\.0+(?=\D|$)/g, "$1").replace(/(\.\d*?)0+(?=\D|$)/g, "$1");

  let body = raw
    .slice(raw.indexOf("<svg"))                       // drop <?xml?> + <!DOCTYPE>
    .replace(/<svg[^>]*>/, "")                        // drop the open tag; rebuilt below
    .replace(/<\/svg>\s*$/, "")
    .replace(/<metadata>[\s\S]*?<\/metadata>/g, "")   // "Created by potrace ..."
    .replace(/<!--[\s\S]*?-->/g, "");

  body = trimNums(body)
    .replace(/\s+/g, " ")                             // newlines inside `d` are just separators
    .replace(/>\s+</g, "><")
    .replace(/\s+\/>/g, "/>")
    .replace(/fill="#000000"/g, 'fill="#000"')
    .trim();

  if (!/<path/.test(body)) throw new Error(`[${cc}] minified output contains no <path>`);

  const [, , w, h] = trimNums(viewBox).split(/\s+/);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${trimNums(viewBox)}"` +
    ` width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet">${body}</svg>\n`
  );
}

async function fetchOne(cc) {
  const res = await fetch(SOURCE_URL(cc));
  if (!res.ok) {
    throw new Error(
      `[${cc}] HTTP ${res.status} from mapsicon — is "${cc}" a real ISO-2 code that ` +
      `mapsicon covers? (It omits a handful of small island states.)`,
    );
  }
  const raw = await res.text();
  return { cc, raw, out: minifySvg(raw, cc) };
}

/** Bounded-concurrency map — keeps us polite to raw.githubusercontent.com. */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

/**
 * Rewrite the OUTLINES array in public/sw.js so the precache list can't drift from
 * ORIGIN_CODES. The service worker can't import from lib/, so the list has to be
 * duplicated there — but it doesn't have to be maintained by hand.
 */
function renderOutlinesArray(codes) {
  const lines = [];
  for (let i = 0; i < codes.length; i += 12) {
    lines.push("  " + codes.slice(i, i + 12).map((c) => `"${c}"`).join(", ") + ",");
  }
  return `const OUTLINES = [\n${lines.join("\n")}\n].map((cc) => \`/maps/\${cc}.svg\`);`;
}

async function syncServiceWorker(codes, { write }) {
  // Normalised for the same core.autocrlf reason as the SVG comparison above.
  const src = (await readFile(SW_JS, "utf8")).replace(/\r\n/g, "\n");
  const re = /const OUTLINES = \[[\s\S]*?\]\.map\(\(cc\) => `\/maps\/\$\{cc\}\.svg`\);/;
  if (!re.test(src)) {
    throw new Error(
      `Could not find the OUTLINES array in ${SW_JS}. If it was renamed or reformatted, ` +
      `update the regex in scripts/fetch-outlines.mjs.`,
    );
  }
  const next = src.replace(re, renderOutlinesArray(codes));
  if (next === src) return false;
  if (write) await writeFile(SW_JS, next, "utf8");
  return true;
}

async function main() {
  const codes = await readOriginCodes();
  console.log(`ORIGIN_CODES: ${codes.length} countries — ${codes.join(" ")}`);
  console.log(`Source: djaiss/mapsicon @ ${SOURCE_SHA.slice(0, 10)}\n`);

  const files = await mapLimit(codes, CONCURRENCY, fetchOne);

  if (CHECK_ONLY) {
    let drift = 0;
    // Compare content, not bytes: this repo runs with core.autocrlf=true, so Git
    // rewrites the checked-out files' line endings and a raw byte comparison would
    // report all 24 as drifted on Windows.
    const normalise = (s) => s.replace(/\r\n/g, "\n");
    for (const { cc, out } of files) {
      const path = join(OUT_DIR, `${cc}.svg`);
      const have = existsSync(path) ? normalise(await readFile(path, "utf8")) : null;
      if (have !== normalise(out)) {
        console.error(`DRIFT  ${cc}.svg  ${have === null ? "missing" : "differs from source"}`);
        drift++;
      }
    }
    const extra = existsSync(OUT_DIR)
      ? (await readdir(OUT_DIR)).filter((f) => f.endsWith(".svg") && !codes.includes(f.slice(0, -4)))
      : [];
    for (const f of extra) { console.error(`ORPHAN ${f}  not in ORIGIN_CODES`); drift++; }
    if (await syncServiceWorker(codes, { write: false })) {
      console.error("DRIFT  public/sw.js OUTLINES precache list is out of sync with ORIGIN_CODES");
      drift++;
    }
    if (drift) {
      console.error(`\n${drift} problem(s). Run: node scripts/fetch-outlines.mjs`);
      process.exit(1);
    }
    console.log(`All ${codes.length} vendored outlines match the pinned source, and sw.js is in sync.`);
    return;
  }

  await mkdir(OUT_DIR, { recursive: true });

  let before = 0, after = 0;
  console.log("  code      source    vendored    saved");
  console.log("  ----------------------------------------");
  for (const { cc, raw, out } of files.sort((a, b) => a.cc.localeCompare(b.cc))) {
    await writeFile(join(OUT_DIR, `${cc}.svg`), out, "utf8");
    const b = Buffer.byteLength(raw), a = Buffer.byteLength(out);
    before += b; after += a;
    console.log(`  ${cc}    ${kb(b).padStart(9)}   ${kb(a).padStart(9)}   ${(100 - (a / b) * 100).toFixed(0).padStart(4)}%`);
  }
  console.log("  ----------------------------------------");
  console.log(`  total ${kb(before).padStart(9)}   ${kb(after).padStart(9)}   ${(100 - (after / before) * 100).toFixed(0).padStart(4)}%`);
  console.log(`\nWrote ${files.length} files to public/maps/`);

  if (await syncServiceWorker(codes, { write: true })) {
    console.log("Updated the OUTLINES precache list in public/sw.js.");
    console.log("The precache set changed — bump CACHE_VERSION in public/sw.js.");
  } else {
    console.log("public/sw.js precache list already in sync.");
  }
}

main().catch((err) => {
  console.error(`\nfetch-outlines failed: ${err.message}`);
  process.exit(1);
});

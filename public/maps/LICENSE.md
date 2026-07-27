# Country outline silhouettes — attribution

The `.svg` files in this directory are country map silhouettes from **Mapsicon**,
created by **Régis Freyd** ([@djaiss](https://github.com/djaiss)).

- Source: <https://github.com/djaiss/mapsicon>
- Pinned commit: `33ba28808f8d32b5bae0ffada9cadd07073852e1` (2017-07-22)
- Vendored by: `scripts/fetch-outlines.mjs`

## Licence

The upstream project states its terms in its README:

> Do what you want with them as long as you mention me in your project.
> Please don't resell them - I forbid it!

This file is that mention. Brewlog uses the outlines as decorative origin markers and
does not sell them, separately or as part of the app. **Do not delete this file**, and
keep the attribution if these assets are moved.

## What was changed

Nothing in the artwork. `scripts/fetch-outlines.mjs` strips only structural overhead —
the XML prolog, the `<!DOCTYPE>`, potrace's `<metadata>` block, redundant trailing
zeros in the header numbers, and inter-tag whitespace. Every `<path d="…">` is passed
through byte-for-byte; the vendoring script's geometry check verifies this against the
pinned upstream commit.

## Refreshing

```bash
node scripts/fetch-outlines.mjs          # re-download and rewrite
node scripts/fetch-outlines.mjs --check  # verify against source, write nothing
```

The country list comes from `ORIGIN_CODES` in `lib/domain/index.ts`. Add an origin
there and re-run the script — don't hand-add files here. If the set of files changes,
bump `CACHE_VERSION` in `public/sw.js`, which precaches them.

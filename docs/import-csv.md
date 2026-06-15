# Coffee Import — CSV Schema & LLM Prompt

This document defines the CSV format used by Brewlog's CSV import path (Shelf → Import → CSV).
It mirrors the in-app "How to make this CSV" expander and is the source of truth for the
column schema. Code: `lib/import/csv.ts`, `lib/import/prompt.ts`.

---

## CSV Columns

| Column | Required | Notes |
|---|---|---|
| `roaster` | yes | Roaster name (e.g. `Five Senses`) |
| `name` | yes | Coffee name (e.g. `Ethiopia Kochere`) |
| `origin` | — | Country of origin (e.g. `Ethiopia`) |
| `region` | — | Growing region (e.g. `Yirgacheffe`) |
| `varietal` | — | Coffee variety (e.g. `Heirloom`, `Bourbon`) |
| `process` | — | Processing method (e.g. `Washed`, `Natural`, `Honey`) |
| `roast` | — | One of: `light`, `medium-light`, `medium`, `medium-dark`, `dark` |
| `roasted_at` | — | ISO date `YYYY-MM-DD` (e.g. `2025-10-01`). Defaults to today if absent. |
| `grams` | — | Bag weight in grams (e.g. `250`). Defaults to 250 if absent. |
| `notes` | — | Tasting descriptors, **semicolon-separated** (e.g. `cherry;jasmine;chocolate`) |

### Example row

```
roaster,name,origin,region,varietal,process,roast,roasted_at,grams,notes
Five Senses,Ethiopia Kochere,Ethiopia,Yirgacheffe,Heirloom,Washed,light,2025-10-01,250,cherry;jasmine;chocolate
```

### Header aliases

The parser accepts common alternative column names (case/space-insensitive):

| Accepted | Maps to |
|---|---|
| `coffee name`, `coffeename` | `name` |
| `country` | `origin` |
| `variety` | `varietal` |
| `processing` | `process` |
| `roast level`, `roastlevel` | `roast` |
| `roasted date`, `roastdate`, `roastedat` | `roasted_at` |
| `weight` | `grams` |
| `flavors`, `flavours`, `taste notes` | `notes` |

---

## LLM Prompt (for generating CSV from a coffee list)

Copy-paste this into ChatGPT or Claude, then append your coffee list:

```
Convert my coffee list into a CSV with these exact columns (one header row, then data rows — no extra text):

roaster,name,origin,region,varietal,process,roast,roasted_at,grams,notes

Rules:
- roast must be one of: light, medium-light, medium, medium-dark, dark
- roasted_at must be YYYY-MM-DD (e.g. 2025-10-01). Use today's date if unknown.
- grams is the bag weight in grams (e.g. 250). Use 250 if unknown.
- notes is a semicolon-separated list of tasting descriptors (e.g. cherry;chocolate;caramel). Leave blank if none.
- region is the growing region within the country (e.g. Yirgacheffe). Leave blank if not known.
- varietal is the coffee variety (e.g. Bourbon, Heirloom). Leave blank if not known.
- process is the processing method (e.g. Washed, Natural, Honey). Leave blank if not known.
- Leave any unknown field blank — do not make things up.
- Do not add extra columns or quotes around fields unless the field contains a comma.

Example row:
Five Senses,Ethiopia Kochere,Ethiopia,Yirgacheffe,Heirloom,Washed,light,2025-10-01,250,cherry;jasmine;chocolate

My coffees:
[paste your list here]
```

---

## Bean Conqueror Import

Brewlog also accepts Bean Conqueror's `.json` export directly (Settings → Backup & Export → Export JSON in the BC app). Only the `BEANS` array is read in v1; brews and equipment are ignored.

### Field mapping

| Bean Conqueror | Brewlog |
|---|---|
| `name` | `name` |
| `roaster` | `roaster` |
| `roastingDate` | `roasted_at` |
| `roast` (ROASTS_ENUM) | `roast` (normalized) |
| `weight` | `grams` |
| `finished` | `archived` |
| `bean_information[0].country` | `origin` |
| `bean_information[0].region` | `region` |
| `bean_information[0].variety` | `varietal` |
| `bean_information[0].processing` | `process` |
| `aromatics` + `cupped_flavor` | `notes` |

### Roast mapping

| Bean Conqueror ROASTS_ENUM | Brewlog |
|---|---|
| Cinnamon Roast, American Roast, New England Roast, Half City Roast | `light` |
| Moderate-Light Roast, City roast | `medium-light` |
| City+ Roast, Full City Roast | `medium` |
| Full City + Roast, Vienna Roast | `medium-dark` |
| French Roast, Italian Roast | `dark` |
| Unknown, Custom, anything else | `light` |

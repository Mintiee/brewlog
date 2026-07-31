-- ============================================================================
-- 020: Per-roaster rest windows
--
-- config.rest_days / peak_days (003, 005) are one household-wide pair applied to
-- every coffee. Rest time is really a roaster property — a light Nordic roaster
-- wants 10–14 days where a denser roast wants 21–28 — so a single global gets
-- half the shelf's "Ready in Nd" wrong.
--
-- roaster_rest maps a normalised roaster key to its own window:
--
--   { "five senses": { "name": "Five Senses", "rest_days": 14, "peak_days": 42 },
--     "ona":         { "name": "ONA Coffee",  "rest_days": 21, "peak_days": 49 } }
--
-- The key is roasterKey(name) from lib/domain/index.ts (lowercased, collapsed
-- whitespace, trailing "Coffee"/"Roasters"/… stripped), so "Five Senses" and
-- "Five Senses Coffee" share one override. `name` carries the display spelling
-- so an override survives the last bag from that roaster leaving the shelf.
-- Coffees whose roaster has no entry fall back to config.rest_days/peak_days.
--
-- No RLS change — config is already household-scoped (001_init.sql).
--
-- Apply BEFORE deploying the matching app code (upsertConfig emits the new
-- column; PostgREST rejects writes to unknown columns).
-- ============================================================================

alter table public.config
  add column if not exists roaster_rest jsonb not null default '{}'::jsonb;

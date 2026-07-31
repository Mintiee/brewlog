-- ============================================================================
-- 021: Hidden roasters in the rest-window editor
--
-- The "Rest by roaster" sheet (020) lists roasters on the shelf and tucks the
-- rest behind a reveal. That split is automatic; this adds a manual one, so any
-- roaster can be hidden from the list regardless of whether it's on the shelf.
--
-- Presentation only: a hidden roaster's window still applies to its coffees.
-- Entries are roasterKey(name) values, matching config.roaster_rest's keys.
--
-- Mirrors the existing config.waters text[] pattern. No RLS change — config is
-- already household-scoped (001_init.sql).
--
-- Apply BEFORE deploying the matching app code (upsertConfig emits the new
-- column; PostgREST rejects writes to unknown columns).
-- ============================================================================

alter table public.config
  add column if not exists hidden_roasters text[] not null default '{}';

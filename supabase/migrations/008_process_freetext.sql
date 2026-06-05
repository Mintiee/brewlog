-- =============================================================
-- BREW — migration 005: free-text coffee process
-- The process field was locked to Washed/Natural/Honey via a CHECK
-- constraint. Drop it so uncommon processes (Anaerobic, Carbonic
-- Maceration, honey variants, experimental…) can be recorded as
-- free text. Column stays NOT NULL DEFAULT 'Washed'.
-- =============================================================

alter table public.coffees
  drop constraint if exists coffees_process_check;

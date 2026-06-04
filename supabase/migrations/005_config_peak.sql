-- Add peak_days to the config table.
-- peak_days is the "best until" day — the end of the drink window.
-- Defaults to 56 to match the previously hard-coded value in lib/domain/index.ts.
alter table public.config
  add column if not exists peak_days integer not null default 56;

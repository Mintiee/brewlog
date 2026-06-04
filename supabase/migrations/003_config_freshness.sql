-- =============================================================
-- Configurable freshness window + serving size, and a cached
-- Palate insight (≤ once/day per household to cap LLM spend).
-- =============================================================

-- ---- Config: new household-wide knobs ----
alter table public.config add column if not exists rest_days     integer not null default 28;
alter table public.config add column if not exists serving_grams numeric not null default 12.5;

-- ---- Cached Palate insight (one row per household) ----
create table if not exists public.household_insight (
  household_id uuid primary key references public.households on delete cascade,
  text         text not null,
  generated_at timestamptz not null default now()
);

alter table public.household_insight enable row level security;

-- Members can read their household's cached insight.
create policy "household_insight_select" on public.household_insight for select
  using (household_id = public.my_household_id());

-- Writes happen only via the service-role API route (/api/insight),
-- which bypasses RLS — so no client insert/update/delete policy.

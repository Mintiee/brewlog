-- =============================================================
-- Weekly LLM-generated brewing tips cache (mirrors household_insight)
-- One row per household; refreshed at most once per week by /api/tips.
-- =============================================================

create table if not exists public.household_tips (
  household_id uuid primary key references public.households on delete cascade,
  tips         jsonb not null,           -- array of { icon, text }
  generated_at timestamptz not null default now()
);

alter table public.household_tips enable row level security;

-- Members can read their household's tips; writes happen via the service role
-- in the API route only (no insert/update/delete policy → blocked for clients).
create policy "household_tips_select" on public.household_tips for select
  using (household_id = public.my_household_id());

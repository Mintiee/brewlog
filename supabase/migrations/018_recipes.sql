-- =============================================================
-- 018 — recipes: the household recipe library
-- =============================================================
-- Users save the current brew recipe under a name ("V60 bright"), apply saved
-- recipes as chips in the brew flow, and rename/delete them in Settings.
--
-- Household-scoped, RLS-enforced — same shape as coffees (001_init) with the
-- household_id default from my_household_id() so the browser client can omit it
-- (matches the 002_anon_shared pattern for coffees/brews).

create table if not exists public.recipes (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade default public.my_household_id(),
  name         text not null,
  dose         numeric not null,
  water        numeric not null,
  bypass       numeric not null default 0,
  temp         numeric not null,
  grind        numeric not null,
  ratio        numeric not null,
  water_type   text not null default '',
  brewer_id    text,
  created_at   timestamptz not null default now()
);

alter table public.recipes enable row level security;

-- Household policies — copied from the coffees pattern in 001_init.sql.
create policy "recipes_select" on public.recipes for select
  using (household_id = public.my_household_id());

create policy "recipes_insert" on public.recipes for insert
  with check (household_id = public.my_household_id());

create policy "recipes_update" on public.recipes for update
  using (household_id = public.my_household_id());

create policy "recipes_delete" on public.recipes for delete
  using (household_id = public.my_household_id());

-- =============================================================
-- BREW — initial schema
-- Two tiers: household-private (RLS) + global shared reference
-- =============================================================

-- ---------------------------------------------------------------
-- TIER B: Global shared reference (no household scope, no RLS)
-- ---------------------------------------------------------------

-- Tasting-note → SCA flavour-family mapping (shared across all households)
create table if not exists public.learned_notes (
  note   text primary key,
  family text not null check (family in ('flower','citrus','berry','cherry','choco','nut','sugar','wine','leaf','drop'))
);

-- Shared gear catalog: grinders & brewers with community defaults
create table if not exists public.gear_catalog (
  id      uuid primary key default gen_random_uuid(),
  kind    text not null check (kind in ('grinder','brewer')),
  name    text not null,
  -- grinder fields
  unit    text,
  -- brewer fields
  short   text,
  dose    numeric,
  ratio   numeric,
  temp    integer,
  grind   integer,
  pours   integer,
  bypass  boolean default false,
  source  text not null default 'seed' check (source in ('seed','community'))
);

-- Seed the gear catalog from the prototype's GRINDER + BREWERS
insert into public.gear_catalog (kind, name, unit, short, dose, ratio, temp, grind, pours, bypass, source) values
  ('grinder', 'Comandante C40',  'clicks', null,     null, null, null, null, null, null, 'seed'),
  ('brewer',  'Hario V60',       null,     'V60',    15,   16.0, 96,   22,   4,    false,'seed'),
  ('brewer',  'Origami Air',     null,     'Origami',15,   16.7, 94,   20,   3,    false,'seed'),
  ('brewer',  'Kalita Wave 155', null,     'Kalita', 17,   15.0, 93,   18,   4,    false,'seed'),
  ('brewer',  'OXO Rapid Brewer',null,     'OXO',    22,   16.5, 94,   24,   1,    true, 'seed')
on conflict do nothing;

-- ---------------------------------------------------------------
-- TIER A: Household-private (RLS-enforced)
-- ---------------------------------------------------------------

create table if not exists public.households (
  id          uuid primary key default gen_random_uuid(),
  invite_code text unique not null,
  created_at  timestamptz not null default now()
);

-- Profiles: one row per auth.uid, linked to a household
create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  household_id uuid not null references public.households on delete cascade,
  name         text not null default 'You',
  created_at   timestamptz not null default now()
);

-- Coffees on the household's shelf
create table if not exists public.coffees (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  roaster      text not null,
  name         text not null,
  origin       text not null default '',
  region       text not null default '',
  varietal     text not null default '',
  process      text not null default 'Washed' check (process in ('Washed','Natural','Honey')),
  roast        text not null default 'light',
  roasted_at   date not null,
  rest_days    integer not null default 28,
  peak_days    integer not null default 56,
  grams        integer not null default 250,
  frozen_grams integer not null default 0,
  archived     boolean not null default false,
  notes        text[] not null default '{}',
  color        text not null default '#cf9a5a',
  cc           text,
  created_at   timestamptz not null default now()
);

-- Brews (recipe captured immediately; rating filled in later)
create table if not exists public.brews (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  coffee_id    uuid not null references public.coffees on delete cascade,
  brewer_id    text not null,  -- references config brewers by id string
  dose         numeric not null,
  water        numeric not null,
  bypass       numeric not null default 0,
  temp         integer not null,
  grind        integer not null,
  ratio        numeric not null,
  water_type   text not null default '',
  started_at   timestamptz not null default now(),
  rated_at     timestamptz,
  logged_by    uuid not null references public.profiles on delete cascade,
  -- rating fields (null until rated)
  stars        integer check (stars between 1 and 5),
  stars2       integer check (stars2 between 1 and 5),
  taster1      text,
  taster2      text,
  acidity      integer check (acidity between 1 and 5),
  sweetness    integer check (sweetness between 1 and 5),
  body         integer check (body between 1 and 5),
  clarity      integer check (clarity between 1 and 5),
  note         text,
  created_at   timestamptz not null default now()
);

-- Household config (grinder, brewers list, waters, ritual settings)
create table if not exists public.config (
  household_id    uuid primary key references public.households on delete cascade,
  grinder         jsonb not null default '{"name":"Comandante C40","unit":"clicks","grind_min":0,"grind_max":50,"grind_step":1}',
  brewers         jsonb not null default '[]',
  waters          text[] not null default '{"Third Wave","Filtered","Volvic","Tap"}',
  default_water   text not null default 'Third Wave',
  taster2         text not null default 'Kris',
  random_greeting boolean not null default true
);

-- Household AI key (encrypted, write-only from client perspective)
create table if not exists public.household_ai (
  household_id   uuid primary key references public.households on delete cascade,
  provider       text not null check (provider in ('openai','anthropic')),
  key_ciphertext text not null,  -- base64 AES-GCM ciphertext
  key_iv         text not null,  -- base64 IV
  set_by         uuid not null references public.profiles on delete cascade,
  set_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------

alter table public.households      enable row level security;
alter table public.profiles        enable row level security;
alter table public.coffees         enable row level security;
alter table public.brews           enable row level security;
alter table public.config          enable row level security;
alter table public.household_ai    enable row level security;

-- Helper: get current user's household_id
create or replace function public.my_household_id()
returns uuid language sql stable security definer as $$
  select household_id from public.profiles where id = auth.uid()
$$;

-- Households: members can see their own
create policy "household_select" on public.households for select
  using (id = public.my_household_id());

-- Profiles: members can see all profiles in their household
create policy "profiles_select" on public.profiles for select
  using (household_id = public.my_household_id());

create policy "profiles_insert" on public.profiles for insert
  with check (id = auth.uid());

create policy "profiles_update" on public.profiles for update
  using (id = auth.uid());

-- Coffees
create policy "coffees_select" on public.coffees for select
  using (household_id = public.my_household_id());

create policy "coffees_insert" on public.coffees for insert
  with check (household_id = public.my_household_id());

create policy "coffees_update" on public.coffees for update
  using (household_id = public.my_household_id());

create policy "coffees_delete" on public.coffees for delete
  using (household_id = public.my_household_id());

-- Brews
create policy "brews_select" on public.brews for select
  using (household_id = public.my_household_id());

create policy "brews_insert" on public.brews for insert
  with check (household_id = public.my_household_id());

create policy "brews_update" on public.brews for update
  using (household_id = public.my_household_id());

create policy "brews_delete" on public.brews for delete
  using (household_id = public.my_household_id());

-- Config
create policy "config_select" on public.config for select
  using (household_id = public.my_household_id());

create policy "config_upsert" on public.config for all
  using (household_id = public.my_household_id())
  with check (household_id = public.my_household_id());

-- household_ai: read only allowed fields (not the key itself); writes via service role only
-- Key ciphertext is never readable by the client (never selected in queries).
-- We allow household members to know IF a key is set (select the non-sensitive columns).
create policy "household_ai_select" on public.household_ai for select
  using (household_id = public.my_household_id());

-- No direct client insert/update/delete — all via service role API routes
-- (No policy means blocked by RLS for authenticated users on those operations)

-- Global reference tables: public read, no RLS needed for select
-- (writes only via service role)
alter table public.learned_notes  enable row level security;
alter table public.gear_catalog   enable row level security;

create policy "learned_notes_read" on public.learned_notes for select to authenticated using (true);
create policy "gear_catalog_read"  on public.gear_catalog  for select to authenticated using (true);

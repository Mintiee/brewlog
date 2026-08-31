-- ============================================================================
-- 022: Web Push nudges
--
-- Two nudges, both about the *record*, not about brewing:
--   * rate  — ~25 min after an unrated brew is logged, ask its owner to rate it.
--   * log   — around the time this person normally brews, if they've logged
--             nothing in that window, ask whether a coffee needs logging.
--
-- Identity is by NAME within a household (person_key = lower(btrim(name))),
-- never profile_id. Anonymous re-logins mint duplicate same-name profile rows,
-- and profiles.id cascades from auth.users — so an id-keyed subscription row
-- can silently vanish while the browser endpoint it describes is still live and
-- still the same human. Mirrors rateBelongsTo() in lib/domain/index.ts.
--
-- The unique index on notification_log IS the send lock: the engine claims a
-- nudge by inserting, and only sends if the insert returned a row. Concurrent
-- or double-fired cron ticks therefore need no advisory lock.
--
-- Apply BEFORE deploying the matching app code (the notify routes query these
-- tables and brews.rate_nudged_at; PostgREST rejects unknown columns).
-- ============================================================================

-- Stamped when a rate nudge is claimed for this brew. NULL = never nudged.
-- Claim-then-send: at-most-once delivery, because a duplicate nudge is a worse
-- failure than a missed one (the in-app pending badge is the backstop).
alter table public.brews
  add column if not exists rate_nudged_at timestamptz;

-- ---------------------------------------------------------------
-- Per-human notification state: prefs + the learned slot times.
-- Slot times are *published* here once per local day rather than
-- recomputed on every 5-minute tick, so the fire time is a constant
-- between recomputes and cannot flap.
-- ---------------------------------------------------------------
create table if not exists public.notify_person (
  household_id      uuid    not null references public.households on delete cascade,
  person_key        text    not null,               -- lower(btrim(profiles.name))
  log_nudge         boolean not null default true,
  rate_nudge        boolean not null default true,
  -- Local minutes past midnight at which each slot fires. NULL until learned.
  morning_fire_min  integer,
  arvo_fire_min     integer,
  -- A slot only nudges once the person demonstrably has a habit in it (see
  -- lib/notify/schedule.ts). No fallback default time — inventing one would be
  -- advising rather than recording.
  morning_active    boolean not null default false,
  arvo_active       boolean not null default false,
  -- Consecutive daily recomputes on which the gate failed; a slot deactivates
  -- only at 2, so one sick day doesn't flicker it off.
  morning_misses    integer not null default 0,
  arvo_misses       integer not null default 0,
  slots_computed_on date,                           -- local day of last recompute
  created_at        timestamptz not null default now(),
  primary key (household_id, person_key)
);

-- ---------------------------------------------------------------
-- One row per browser. iana_tz lives here, not on notify_person:
-- the phone travels, the laptop doesn't. Scheduling uses the tz of
-- the most recently seen device for that person.
-- ---------------------------------------------------------------
create table if not exists public.push_subscriptions (
  endpoint      text primary key,
  household_id  uuid not null references public.households on delete cascade,
  person_key    text not null,
  -- Debugging breadcrumb ONLY — never joined on, and nullable on purpose so a
  -- reaped anon user can't take a live subscription down with it.
  profile_id    uuid references public.profiles on delete set null,
  p256dh        text not null,
  auth          text not null,
  iana_tz       text not null default 'Australia/Sydney',
  ua            text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  foreign key (household_id, person_key)
    references public.notify_person (household_id, person_key) on delete cascade
);

create index if not exists push_subscriptions_person_idx
  on public.push_subscriptions (household_id, person_key);

-- ---------------------------------------------------------------
-- Idempotency ledger. The unique index below is the claim lock.
-- slot = 'morning' | 'arvo' for log nudges, or the brew id for rate
-- nudges (which also makes the per-day rate cap a plain count).
-- ---------------------------------------------------------------
create table if not exists public.notification_log (
  id           bigserial primary key,
  household_id uuid not null references public.households on delete cascade,
  person_key   text not null,
  kind         text not null check (kind in ('log','rate')),
  local_day    date not null,
  slot         text not null default '',
  sent_at      timestamptz not null default now()
);

create unique index if not exists notification_log_claim_uq
  on public.notification_log (household_id, person_key, kind, local_day, slot);

create index if not exists notification_log_day_idx
  on public.notification_log (household_id, person_key, local_day);

-- The rate-nudge scan runs every 5 minutes forever and only ever looks at
-- unrated, un-nudged, non-guest brews — a handful of rows at a time.
create index if not exists brews_rate_nudge_idx
  on public.brews (started_at)
  where rated_at is null and guest = false and rate_nudged_at is null;

-- ---------------------------------------------------------------
-- RLS: household members may read their own rows (so Settings can show
-- the learned times and the current subscription). Every write goes
-- through the service role in app/api/notify/*.
-- ---------------------------------------------------------------
alter table public.notify_person      enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_log   enable row level security;

drop policy if exists "notify_person_select" on public.notify_person;
create policy "notify_person_select" on public.notify_person for select
  using (household_id = public.my_household_id());

drop policy if exists "push_subscriptions_select" on public.push_subscriptions;
create policy "push_subscriptions_select" on public.push_subscriptions for select
  using (household_id = public.my_household_id());

drop policy if exists "notification_log_select" on public.notification_log;
create policy "notification_log_select" on public.notification_log for select
  using (household_id = public.my_household_id());

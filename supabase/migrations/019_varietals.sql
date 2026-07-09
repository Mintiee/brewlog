-- ============================================================================
-- 019: Multi-varietal support
--
-- coffees.varietal (single free-text string, multi-varietal packed with '·')
-- becomes coffees.varietals text[] — analogous to notes text[]. The legacy
-- varietal column is retained and dual-written by the app for rollback safety
-- (drop in a later migration once the array has bedded in).
--
-- Also adds learned_varietals: a global LLM-validated canonicalisation table
-- mirroring learned_notes (001_init.sql) — raw token → canonical spelling,
-- plus is_blend_label for catch-all mix terms (Heirloom, Landrace, Field
-- Blend…) which group as "{Origin} field blend" in stats.
--
-- Apply BEFORE deploying the matching app code (new coffeeToRow emits the
-- varietals column; PostgREST rejects writes to unknown columns).
-- ============================================================================

alter table public.coffees
  add column if not exists varietals text[] not null default '{}';

-- Backfill: split legacy varietal on '·' and ',', trim, drop empties and the
-- '—' placeholder sentinel, preserve order.
update public.coffees c
set varietals = coalesce((
  select array_agg(btrim(tok) order by ord)
  from unnest(regexp_split_to_array(c.varietal, '[·,]')) with ordinality as u(tok, ord)
  where btrim(tok) not in ('', '—')
), '{}')
where c.varietals = '{}';

-- Global varietal canonicalisation — copied from the learned_notes pattern in
-- 001_init.sql: no household scope, read-open to authenticated, writes only via
-- the service role (bypasses RLS) from /api/classify-varietals.
create table if not exists public.learned_varietals (
  raw            text primary key,           -- lowercased, trimmed token as printed on bags
  canonical      text not null,              -- standard cultivar spelling
  is_blend_label boolean not null default false
);

alter table public.learned_varietals enable row level security;

drop policy if exists "learned_varietals_read" on public.learned_varietals;
create policy "learned_varietals_read" on public.learned_varietals
  for select to authenticated using (true);

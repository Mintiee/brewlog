-- Fix: ensure any household member can update any brew in their household.
-- This is required for split-brew rating: the sibling row is created by Min
-- (logged_by = min.id) but rated by Kris (auth.uid() = kris.id). A policy
-- that gates on logged_by = auth.uid() would silently block Kris's rating
-- update. Drop and recreate to correct any drift from the dashboard.
drop policy if exists "brews_update" on public.brews;
create policy "brews_update" on public.brews for update
  using (household_id = public.my_household_id());

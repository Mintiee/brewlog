-- =============================================================
-- TEMP: anonymous-session mode (no email auth, single shared household)
-- Reversible — the real email-auth flow returns later. This migration only
-- adds column defaults so the browser client doesn't have to set them.
-- =============================================================

-- Inserts from the browser omit household_id / logged_by. Default them from the
-- current session so RLS with-checks pass and rows are correctly scoped.
-- (profiles.id == auth.uid(), so auth.uid() is a valid logged_by.)
alter table public.coffees alter column household_id set default public.my_household_id();
alter table public.brews   alter column household_id set default public.my_household_id();
alter table public.brews   alter column logged_by    set default auth.uid();

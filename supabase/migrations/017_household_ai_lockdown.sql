-- =============================================================
-- 017 — household_ai key lockdown
-- =============================================================
-- Problem: 001_init's "household_ai_select" RLS policy makes a household's
-- row visible to its members. RLS filters *rows*, not *columns*, and the
-- default table-level SELECT grant to `authenticated` exposes every column —
-- including key_ciphertext / key_iv. A member could therefore read the raw
-- encrypted key material with a plain client query.
--
-- Fix: keep row-level scoping (the app still needs to know IF a key is set and
-- by which provider), but restrict *column* access so only the non-sensitive
-- columns are selectable by clients. The encrypted key is henceforth readable
-- only via the service role (lib/llm/getKey), never by the anon/authenticated
-- client.
--
-- This is column-level GRANTs rather than dropping the select policy outright:
-- dropping the policy would hide the row entirely and break the client status
-- read (lib/db/index.ts fetchAiKeyStatus, which selects only `provider`).
-- With this approach fetchAiKeyStatus keeps working unchanged.
--
-- No table shape change → database.types.ts is unaffected.

-- Row scoping is unchanged; make the intent explicit and idempotent.
drop policy if exists "household_ai_select" on public.household_ai;
create policy "household_ai_select" on public.household_ai for select
  using (household_id = public.my_household_id());

-- Column lockdown: revoke the blanket table SELECT, then grant SELECT only on
-- the non-sensitive columns. key_ciphertext and key_iv are intentionally omitted
-- so any client attempt to select them fails with "permission denied for column".
revoke select on public.household_ai from authenticated;
grant  select (household_id, provider, set_by, set_at) on public.household_ai to authenticated;

-- anon never has a matching profile (my_household_id() is null) so RLS already
-- hides every row from it; revoke its column SELECT too for defence in depth.
revoke select on public.household_ai from anon;
grant  select (household_id, provider, set_by, set_at) on public.household_ai to anon;

-- Writes remain service-role only (no insert/update/delete policy exists), so
-- key material can only be set through the /api/ai-key route. Unchanged here.

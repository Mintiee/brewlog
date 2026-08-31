-- ============================================================================
-- Nudge scheduler — run ONCE in the Supabase SQL editor, after migration 022
-- and after the app has been deployed with the VAPID + NOTIFY_CRON_SECRET env
-- vars set.
--
-- This is deliberately NOT a migration: it references a Vault secret that only
-- exists in the live project, and it should not run against a fresh local DB.
--
-- Why pg_cron rather than Vercel Cron: on the Hobby plan a Vercel cron may run
-- at most once per day, with ±59 minutes of slop, and a more frequent cron
-- expression fails deployment outright. That cannot drive a 25-minute rate
-- nudge. pg_cron is on Supabase's free tier and runs at minute granularity.
-- (Side effect worth knowing: the 5-minute heartbeat counts as database
-- activity, so this project will no longer auto-pause for inactivity.)
-- ============================================================================

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net  with schema extensions;

-- 1. Store the shared secret. Use the same value as the app's NOTIFY_CRON_SECRET
--    env var. Vault keeps it out of cron.job.command, which is world-readable to
--    anyone with database access.
--
--    select vault.create_secret('<NOTIFY_CRON_SECRET>', 'notify_cron_secret');
--
--    To rotate later:
--    select vault.update_secret(
--      (select id from vault.secrets where name = 'notify_cron_secret'),
--      '<NEW_SECRET>');

-- 2. Schedule the tick. The route is idempotent (every send is preceded by an
--    atomic claim), so a duplicated or retried tick is harmless; a missed tick
--    is absorbed by the ±90-minute catch-up bound in lib/notify/schedule.ts.
select cron.schedule(
  'notify-run',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://coffeebrewlog.vercel.app/api/notify/run',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'notify_cron_secret'
      )
    ),
    body                 := '{}'::jsonb,
    timeout_milliseconds := 8000
  );
  $$
);

-- ---------------------------------------------------------------------------
-- Checking on it
-- ---------------------------------------------------------------------------
-- Did the tick fire?
--   select * from cron.job_run_details order by start_time desc limit 20;
--
-- What did the route say? (net.http_post is fire-and-forget; the response lands
-- here a moment later.)
--   select id, status_code, content from net._http_response order by created desc limit 20;
--
-- Pause / remove:
--   select cron.unschedule('notify-run');

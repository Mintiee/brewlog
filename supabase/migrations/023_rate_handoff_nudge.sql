-- ============================================================================
-- 023: Nudge the person a cup is *sent* to
--
-- 022 resolved a rate nudge to `rate_for ?? logged_by`, which is right for a cup
-- logged as the partner's from the start (the `partner` and `split` audiences
-- set rate_for at insert). It is wrong for the "send to rate" handoff, which is
-- an UPDATE on an existing row (StepWhat -> onSend -> updateBrew). That path
-- changed nothing the nudge query looks at, so:
--
--   * handed over within 25 min  -> the new owner was nudged (by luck)
--   * handed over after the tick had already nudged the logger -> rate_nudged_at
--     was stamped, so the new owner got nothing
--   * handed over 3h+ after the brew -> outside the freshness window, nobody
--     got anything
--
-- The middle case is the common one, and it silently dropped the single most
-- explicit "this is yours to rate" signal in the app.
--
-- Fix: stamp the moment of handoff and clear any nudge already sent for the
-- previous owner, so the row re-enters the queue for its new owner. A trigger
-- rather than client code, because the handoff can be written from more than one
-- screen (the queue's send button, a BrewDetail edit) and the offline outbox
-- replays writes verbatim — the stamp must be the server's clock, not the
-- client's.
--
-- Apply BEFORE deploying the matching app code.
-- ============================================================================

-- When this row was handed to its current rater. NULL = never handed off (it
-- belongs to whoever logged it, or was logged as the partner's from the start).
alter table public.brews
  add column if not exists rate_handed_at timestamptz;

create or replace function public.brews_stamp_handoff()
returns trigger
language plpgsql
as $$
begin
  -- Only a change *to* a real person counts. Rating a brew sets rate_for back to
  -- NULL (see rateBrew in lib/store/AppContext.tsx); that must not re-arm the
  -- nudge, or every rating would bounce back into the queue.
  if new.rate_for is distinct from old.rate_for and new.rate_for is not null then
    new.rate_handed_at := now();
    -- Re-arm: a nudge already sent to the previous owner must not block the new
    -- one. The claim in /api/notify/run is rate_nudged_at, so clearing it is what
    -- puts the row back in the queue.
    new.rate_nudged_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists brews_stamp_handoff on public.brews;
create trigger brews_stamp_handoff
  before update on public.brews
  for each row
  execute function public.brews_stamp_handoff();

-- Second hot query for the tick: handed-off cups awaiting their new owner.
create index if not exists brews_rate_handoff_idx
  on public.brews (rate_handed_at)
  where rated_at is null and guest = false and rate_nudged_at is null
    and rate_handed_at is not null;

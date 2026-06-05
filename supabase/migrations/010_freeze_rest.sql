-- Freezing pauses bean aging. Track a freeze/thaw timeline on the coffee so the
-- effective ("rest") age can subtract time spent frozen, and snapshot the
-- freeze-adjusted rest on each brew at log time for the rest-vs-rating stat.

alter table public.coffees
  add column if not exists frozen_at date,
  add column if not exists thawed_at date;

alter table public.brews
  add column if not exists rest_days integer;

-- One-off backfill: no freeze history was ever recorded, so assume any bag
-- currently in the freezer went in 40 days after roast (best estimate).
update public.coffees
  set frozen_at = roasted_at + 40
  where frozen_grams > 0 and frozen_at is null;

-- Backfill rest_days for existing brews from the (now-known) freeze timeline:
-- calendar days roast→brew, minus any frozen span up to the brew time.
update public.brews b
  set rest_days = greatest(0,
    (b.started_at::date - c.roasted_at)
    - case
        when c.frozen_at is not null and b.started_at::date > c.frozen_at
          then least(coalesce(c.thawed_at, b.started_at::date), b.started_at::date) - c.frozen_at
        else 0
      end
  )
  from public.coffees c
  where b.coffee_id = c.id and b.rest_days is null;

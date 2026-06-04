-- Allow half-star (0.5-step) ratings.
-- Change stars / stars2 from integer to numeric(2,1) and relax the check constraints.
-- Apply to the live project BEFORE deploying UI changes that write fractional stars.

alter table public.brews
  drop constraint if exists brews_stars_check,
  drop constraint if exists brews_stars2_check;

alter table public.brews
  alter column stars  type numeric(2,1) using stars::numeric,
  alter column stars2 type numeric(2,1) using stars2::numeric;

alter table public.brews
  add constraint brews_stars_check
    check (stars is null or (stars >= 0.5 and stars <= 5 and (stars * 2) = floor(stars * 2))),
  add constraint brews_stars2_check
    check (stars2 is null or (stars2 >= 0.5 and stars2 <= 5 and (stars2 * 2) = floor(stars2 * 2)));

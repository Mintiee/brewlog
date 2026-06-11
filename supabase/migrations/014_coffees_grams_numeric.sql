-- Fix: coffees.grams and frozen_grams were integer, but the app works in fractional
-- grams (12.5 g servings, numeric brew doses, 2.5 g stepper increments). A back-
-- computed bag size like 247.5 failed PostgREST's integer cast on upsert, silently
-- reverting any "Remaining" edit after a page reload.
-- Match brews.dose / brews.water which are already numeric. Existing whole-number
-- values are preserved exactly.
alter table public.coffees
  alter column grams       type numeric,
  alter column frozen_grams type numeric;

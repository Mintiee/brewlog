-- ============================================================================
-- 024: Producer / farm override
--
-- Bag names are meant to identify the farm or producer, so the app guesses the
-- producer from coffees.name to link bags from the same farm (producerKey in
-- lib/domain/search.ts). This column holds an explicit correction for when the
-- guess is wrong. NULL = keep guessing from the name.
--
-- Apply BEFORE deploying the matching app code. Ordinary writes survive either
-- order (coffeeToRow omits producer unless the coffee was read with the column
-- present), but saving an override before this has run is rejected by PostgREST.
-- ============================================================================

alter table public.coffees
  add column if not exists producer text;

-- =============================================================
-- BREW — migration 004: expand flavour family taxonomy
-- Aligns learned_notes CHECK constraint with the new wheel-
-- aligned families (yellowfruit, redfruit, roast, spice).
-- IMPORTANT: existing rows must be remapped BEFORE the constraint
-- is swapped, since learned_notes is global/shared across households.
-- =============================================================

-- 1. Remap retired "cherry" rows to "redfruit" (closest equivalent;
--    lexicon handles new notes correctly going forward).
update public.learned_notes
  set family = 'redfruit'
  where family = 'cherry';

-- 2. Swap the CHECK constraint to the new family list.
--    PostgreSQL auto-names inline CHECK constraints as <table>_<col>_check.
alter table public.learned_notes
  drop constraint if exists learned_notes_family_check;

alter table public.learned_notes
  add constraint learned_notes_family_check
  check (family in (
    'flower', 'citrus', 'yellowfruit', 'redfruit', 'berry',
    'choco', 'roast', 'nut', 'sugar', 'spice', 'wine', 'leaf', 'drop'
  ));

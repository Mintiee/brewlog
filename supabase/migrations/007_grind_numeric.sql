-- Widen grind from integer to numeric to support decimal grind steps
-- (e.g. a ZP6 on a 0–10 / 0.1-step scale).
alter table public.brews
  alter column grind type numeric(4,1) using grind::numeric;

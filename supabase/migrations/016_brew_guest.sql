-- Migration 016: add guest flag to brews
-- A guest brew records a cup made for a visitor — it never enters the rating queue
-- and is excluded from palate stats, but still draws down bean inventory.
alter table brews add column guest boolean not null default false;

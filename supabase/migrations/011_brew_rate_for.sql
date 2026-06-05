-- "Send to rate" handoff: direct a pending brew at a specific household member.
-- When rate_for is set, the brew leaves the sender's "waiting to rate" list and
-- appears only for that member; their rating becomes the brew's rating and
-- clears the flag. null = normal household-shared pending behaviour (unchanged).

alter table public.brews
  add column if not exists rate_for uuid references public.profiles on delete set null;

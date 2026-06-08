-- Double/split brew: one physical brew split between two drinkers becomes two
-- linked rows sharing a session_id, each independently rated through the normal
-- StepRate flow. null = ordinary single brew (unchanged behaviour).
-- The sibling row is created at log time with rate_for pointing at the partner;
-- the partner rates it on their own device exactly as they would any other brew.

alter table public.brews
  add column if not exists session_id uuid;

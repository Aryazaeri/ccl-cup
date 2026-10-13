-- Saved lineups (audit backlog item 4): a club entry's formation, who starts
-- in each slot and the bench, kept with the entry so it shows publicly and
-- reopens as saved. Players are referenced by id; ones who have since left
-- the squad are ignored when the lineup is shown.
alter table public.teams add column lineup jsonb
  check (lineup is null or (jsonb_typeof(lineup->'starters') = 'object' and jsonb_typeof(lineup->'bench') = 'array'));

-- Penalty shootout score for knockout matches level after normal time.
--
-- Both columns are null unless a shootout happened, and they are set or
-- cleared together so a half-entered shootout cannot be stored.

alter table public.matches
  add column if not exists home_penalties smallint check (home_penalties >= 0),
  add column if not exists away_penalties smallint check (away_penalties >= 0);

alter table public.matches
  add constraint matches_penalties_paired
  check ((home_penalties is null) = (away_penalties is null));

-- Align match and event persistence with the application.
--
-- Context: the client was writing `venue`, `kickoff`, `status` and `referee`
-- to public.matches and `team_name` / `player_name` to public.match_events.
-- None of those columns exist, so every match and event insert failed against
-- this database. The fix is in the repository layer (it now writes venue_id,
-- kickoff_at, match_status, publication_status, referee_name, team_id and
-- player_id), so this migration only adds the one thing the schema genuinely
-- lacked.

-- A goal can be scored by someone who is not on a registered roster — a
-- late signing, a guest player, or simply a club whose squad has not been
-- entered yet. player_id stays the source of truth when it resolves; this
-- column preserves the operator's typed name when it does not, instead of
-- losing the scorer entirely.
alter table public.match_events
  add column if not exists player_name text;

comment on column public.match_events.player_name is
  'Fallback scorer name for players with no roster record. Null whenever player_id is set.';

-- Guard against the two ever disagreeing.
alter table public.match_events
  drop constraint if exists match_events_player_identified;

alter table public.match_events
  add constraint match_events_player_identified
  check (player_id is not null or player_name is not null);

-- Name lookups drive venue and city resolution on every fixture save.
create unique index if not exists cities_name_key on public.cities (lower(name));
create index if not exists venues_name_idx on public.venues (lower(name));

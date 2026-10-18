-- The archive import (202610170002) is finished. Drop its one-off function and
-- the import-only waiver in the five-player check, restoring that check as it
-- was. The imported data and import.source_map / import.source_standings stay
-- as the record of which archive row became which app row.

drop function public.import_historical_season(jsonb, boolean);

create or replace function public.enforce_min_squad() returns trigger
language plpgsql set search_path to 'public' as $$
declare
  checked_team bigint;
  squad_size int;
  club_name text;
begin
  -- OLD/NEW have different shapes per table, so branch before touching fields.
  if tg_table_name = 'teams' then
    checked_team := new.id;
  elsif tg_op = 'UPDATE' and new.team_id = old.team_id then
    return null;
  else
    checked_team := old.team_id;
  end if;
  select name into club_name from teams where id = checked_team;
  if not found then return null; end if; -- the entry itself was deleted
  select count(*) into squad_size from squad_memberships where team_id = checked_team;
  if squad_size < 5 then
    raise exception '% needs at least five players in its squad (it would have %).', club_name, squad_size
      using errcode = '23514';
  end if;
  return null;
end $$;

-- A club entry registered in the wrong season can be moved while it has no
-- matches (customer report: YAPI KREDİ landed in the current season instead of
-- 2022). The squad follows the entry; the existing unique constraints refuse
-- the move if the club or one of its players is already in the target season.

alter table public.squad_memberships drop constraint squad_memberships_team_fk;
alter table public.squad_memberships add constraint squad_memberships_team_fk
  foreign key (team_id, season_id) references public.teams (id, season_id)
  on delete cascade on update cascade;

create function public.keep_played_entry_in_season() returns trigger
language plpgsql set search_path = public as $$
begin
  if exists (select 1 from matches where home_team_id = old.id or away_team_id = old.id) then
    raise exception '% already has fixtures in this season, so it cannot move to another season.', old.name
      using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger teams_keep_played_entry_in_season
  before update of season_id on public.teams
  for each row when (old.season_id is distinct from new.season_id)
  execute function public.keep_played_entry_in_season();

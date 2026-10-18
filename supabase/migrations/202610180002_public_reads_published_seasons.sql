-- Draft and archived seasons are hidden from the public site, but their
-- fixtures, club entries, squads, match lineups and groups were still readable
-- by anyone through the API — and every visitor downloaded them (16 archive
-- seasons, several MB per visit). Public reads now follow the season's status.
-- Staff keep full access through the competition_staff_manage_* policies;
-- match events already follow their match. A player is public while they are
-- in a published season's squad or in no squad at all (a free agent).

create function public.is_published_season(season bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from seasons where id = season and status = 'published')
$$;

drop policy matches_public_read on public.matches;
create policy matches_public_read on public.matches for select to anon, authenticated
  using (publication_status = 'published' and public.is_published_season(season_id));

drop policy teams_public_read on public.teams;
create policy teams_public_read on public.teams for select to anon, authenticated
  using (is_published and deleted_at is null and public.is_published_season(season_id));

drop policy squad_memberships_public_read on public.squad_memberships;
create policy squad_memberships_public_read on public.squad_memberships for select
  using (public.is_published_season(season_id));

drop policy match_squads_public_read on public.match_squads;
create policy match_squads_public_read on public.match_squads for select
  using (exists (select 1 from matches m where m.id = match_id and public.is_published_season(m.season_id)));

drop policy groups_public_read on public.tournament_groups;
create policy groups_public_read on public.tournament_groups for select to anon, authenticated
  using (public.is_published_season(season_id));

-- Checks every squad entry (bypassing the squad read rule above), so a player
-- whose squads are all in hidden seasons does not pass as a free agent.
create function public.is_public_player(player bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from squad_memberships where player_id = player)
      or exists (select 1 from squad_memberships m join seasons s on s.id = m.season_id
                 where m.player_id = player and s.status = 'published')
$$;

drop policy players_public_read on public.players;
create policy players_public_read on public.players for select to anon, authenticated
  using (is_published and deleted_at is null and public.is_public_player(id));

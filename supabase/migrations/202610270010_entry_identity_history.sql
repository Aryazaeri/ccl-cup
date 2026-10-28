-- Retain the club identity behind a released/deleted entry. Deleting an
-- unplayed entry must not permit the same person to switch clubs after kickoff.
create table public.club_entry_identity (
 entry_id bigint primary key,
 club_id bigint not null references public.clubs(id)
);
insert into public.club_entry_identity select id,club_id from public.teams;
alter table public.club_entry_identity enable row level security;
alter table public.tournament_player_clubs drop constraint tournament_player_clubs_team_id_fkey;

create function public.entry_identity(entry bigint) returns bigint
language sql stable security definer set search_path='' as $$
 select club_id from public.club_entry_identity where entry_id=entry
$$;
revoke all on function public.entry_identity(bigint) from public,anon,authenticated;
create or replace function public.lock_tournament_clock(tournament bigint) returns timestamptz
language plpgsql security definer set search_path='' as $$
declare started timestamptz; first_kickoff timestamptz;
begin
 perform pg_advisory_xact_lock(hashtextextended('ccl-season:'||tournament,0));
 select started_at into started from public.seasons where id=tournament for update;
 if not found then return null; end if;
 if started is null then
  select min(coalesce(started_at,kickoff_at)) into first_kickoff from public.matches
   where season_id=tournament and match_status<>'postponed' and (started_at is not null or kickoff_at<=clock_timestamp());
  if first_kickoff is not null then
   update public.seasons set started_at=first_kickoff where id=tournament;
   insert into public.tournament_player_clubs select player_id,season_id,team_id from public.squad_memberships where season_id=tournament on conflict do nothing;
   started:=first_kickoff;
  end if;
 end if;
 return started;
end $$;

create function public.retain_entry_identity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  insert into public.club_entry_identity values(new.id,new.club_id) on conflict do nothing; return new;
 end if;
 perform public.lock_tournament_clock(old.season_id);
 return old;
end $$;
create trigger teams_retain_identity after insert on public.teams for each row execute function public.retain_entry_identity();
create trigger teams_remember_registration before delete on public.teams for each row execute function public.retain_entry_identity();

create or replace function public.guard_tournament_membership() returns trigger
language plpgsql security definer set search_path='' as $$
declare sid bigint; started timestamptz; original_team bigint;
begin
 if tg_op='DELETE' and not exists(select 1 from public.teams where id=old.team_id) then return old; end if;
 sid:=case when tg_op='DELETE' then old.season_id else new.season_id end;
 perform pg_advisory_xact_lock(hashtextextended('ccl-season:'||sid,0));
 started:=public.lock_tournament_clock(sid);
 if tg_op='UPDATE' and new.player_id<>old.player_id then raise exception 'Squad places cannot change player identity'; end if;
 if tg_op='UPDATE' and new.season_id<>old.season_id then
   -- The existing entry-correction workflow cascades its composite FK. It is
   -- not a within-tournament transfer and is already blocked when fixtures exist.
   if new.team_id<>old.team_id or not exists(select 1 from public.teams where id=new.team_id and season_id=new.season_id)
     or exists(select 1 from public.matches where home_team_id=old.team_id or away_team_id=old.team_id) then
     raise exception 'Only an unplayed entry can be corrected into another tournament';
   end if;
   if exists(select 1 from public.tournament_player_clubs where player_id=new.player_id and season_id=new.season_id and public.entry_identity(team_id)<>public.entry_identity(new.team_id)) then
     raise exception 'Players cannot transfer clubs after the tournament has kicked off';
   end if;
   if started is not null then insert into public.tournament_player_clubs values(new.player_id,sid,new.team_id) on conflict do nothing; end if;
   return new;
 end if;
 if started is not null then
   if tg_op in ('DELETE','UPDATE') then
     insert into public.tournament_player_clubs values(old.player_id,old.season_id,old.team_id) on conflict do nothing;
   end if;
   if tg_op<>'DELETE' then
     select team_id into original_team from public.tournament_player_clubs where player_id=new.player_id and season_id=sid;
     if original_team is not null and public.entry_identity(original_team)<>public.entry_identity(new.team_id) then
       raise exception 'Players cannot transfer clubs after the tournament has kicked off' using errcode='23514';
     end if;
     insert into public.tournament_player_clubs values(new.player_id,sid,new.team_id) on conflict do nothing;
   end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;

notify pgrst, 'reload schema';

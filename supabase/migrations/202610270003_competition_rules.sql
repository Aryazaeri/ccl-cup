alter table public.seasons add column lots_order bigint[] not null default '{}';
alter table public.seasons add column started_at timestamptz;
alter table public.matches add column started_at timestamptz;
alter table public.matches add column completed_at timestamptz;
alter table public.matches add column result_kind text not null default 'normal' check(result_kind in ('normal','forfeit'));
alter table public.matches add column forfeit_team_id bigint references public.teams(id);
alter table public.matches add column decision_note text;
alter table public.matches add column score_source text not null default 'events' check(score_source in ('events','legacy'));
-- Preserve imported results whose individual historical goals are unavailable.
-- New matches always use events. A legacy score cannot be edited manually.
update public.matches m set score_source='legacy', completed_at=updated_at
 where match_status='completed' and (
  coalesce(home_score,0) <> (select count(*) from public.match_events e where e.match_id=m.id
   and ((e.team_id=m.home_team_id and e.event_type in ('goal','penalty_scored')) or (e.team_id=m.away_team_id and e.event_type='own_goal')))
  or coalesce(away_score,0) <> (select count(*) from public.match_events e where e.match_id=m.id
   and ((e.team_id=m.away_team_id and e.event_type in ('goal','penalty_scored')) or (e.team_id=m.home_team_id and e.event_type='own_goal'))));
update public.matches set started_at=kickoff_at, completed_at=coalesce(completed_at,updated_at) where match_status='completed';
update public.seasons s set started_at=(select min(m.kickoff_at) from public.matches m where m.season_id=s.id and m.match_status in ('live','completed'));
alter table public.matches drop constraint matches_match_status_check;
alter table public.matches add constraint matches_match_status_check check(match_status in ('scheduled','live','completed','postponed','stopped'));

-- The minimum is checked only for a newly created tournament entry.
drop trigger squad_memberships_min_squad on public.squad_memberships;

create table public.tournament_player_clubs (
 player_id bigint not null references public.players(id) on delete cascade,
 season_id bigint not null references public.seasons(id) on delete cascade,
 team_id bigint not null references public.teams(id) on delete cascade,
 primary key(player_id,season_id)
);
insert into public.tournament_player_clubs select sm.player_id,sm.season_id,sm.team_id
 from public.squad_memberships sm join public.seasons s on s.id=sm.season_id where s.started_at is not null;
alter table public.tournament_player_clubs enable row level security;
-- Write only through the membership trigger. It retains identity after release,
-- preventing delete+insert from bypassing the transfer lock.
create function public.guard_tournament_membership() returns trigger
language plpgsql security definer set search_path='' as $$
declare sid bigint; started timestamptz; original_team bigint;
begin
 sid:=case when tg_op='DELETE' then old.season_id else new.season_id end;
 perform pg_advisory_xact_lock(hashtextextended('ccl-season:'||sid,0));
 select started_at into started from public.seasons where id=sid;
 if tg_op='UPDATE' and (new.season_id<>old.season_id or new.player_id<>old.player_id) then
   raise exception 'Release and register squad places separately';
 end if;
 if started is not null then
   if tg_op in ('DELETE','UPDATE') then
     insert into public.tournament_player_clubs values(old.player_id,old.season_id,old.team_id) on conflict do nothing;
   end if;
   if tg_op<>'DELETE' then
     select team_id into original_team from public.tournament_player_clubs where player_id=new.player_id and season_id=sid;
     if original_team is not null and original_team<>new.team_id then
       raise exception 'Players cannot transfer clubs after the tournament has kicked off' using errcode='23514';
     end if;
     insert into public.tournament_player_clubs values(new.player_id,sid,new.team_id) on conflict do nothing;
   end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create trigger squad_memberships_transfer_guard before insert or update or delete on public.squad_memberships
 for each row execute function public.guard_tournament_membership();

alter table public.match_squads add column lineup_role text not null default 'bench' check(lineup_role in ('starter','bench'));
alter table public.match_squads add column is_goalkeeper boolean not null default false;
-- Legacy snapshots remain historical records, never silently reinterpreted as
-- actual starters. Staff explicitly select match-day lineups for new matches.
drop trigger matches_snapshot_squads on public.matches;
alter table public.match_events add column incoming_player_id bigint references public.players(id);
alter table public.match_events add column is_goalkeeper_change boolean not null default false;

create table public.player_suspensions (
 id bigint generated always as identity primary key,
 player_id bigint not null references public.players(id),
 season_id bigint not null references public.seasons(id) on delete cascade,
 team_id bigint not null references public.teams(id),
 reason text not null check(length(trim(reason)) between 1 and 2000),
 match_count integer check(match_count>0),
 ends_on date,
 issued_at timestamptz not null default now(),
 revoked_at timestamptz,
 check((match_count is null) <> (ends_on is null))
);
create index player_suspensions_player_season on public.player_suspensions(player_id,season_id);
alter table public.player_suspensions enable row level security;
create policy competition_staff_suspensions on public.player_suspensions for all to authenticated
 using((select public.is_staff(array['super_admin','admin','match_operator'])))
 with check((select public.is_staff(array['super_admin','admin','match_operator'])));
grant select,insert,update on public.player_suspensions to authenticated;
grant usage,select on sequence public.player_suspensions_id_seq to authenticated;

create function public.suspension_served(suspension bigint, before_time timestamptz default now()) returns bigint
language sql stable security definer set search_path='' as $$
 select count(*) from public.player_suspensions s join public.matches m
 on m.season_id=s.season_id and s.team_id in (m.home_team_id,m.away_team_id)
 where s.id=suspension and m.match_status='completed' and m.completed_at>=s.issued_at and m.completed_at<before_time
 and not exists(select 1 from public.match_squads ms where ms.match_id=m.id and ms.player_id=s.player_id)
$$;
create function public.is_suspended(person bigint, tournament bigint, fixture bigint) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.player_suspensions s join public.matches m on m.id=fixture
 where s.player_id=person and s.season_id=tournament and s.revoked_at is null
   and s.issued_at<=coalesce(m.started_at,now())
   and ((s.ends_on is not null and (coalesce(m.started_at,m.kickoff_at,now()) at time zone 'Europe/Istanbul')::date<=s.ends_on)
     or (s.match_count is not null and public.suspension_served(s.id,coalesce(m.started_at,now()))<s.match_count)))
$$;
revoke all on function public.suspension_served(bigint,timestamptz), public.is_suspended(bigint,bigint,bigint) from public,anon;
grant execute on function public.suspension_served(bigint,timestamptz), public.is_suspended(bigint,bigint,bigint) to authenticated;

create function public.guard_match_lineup() returns trigger
language plpgsql security definer set search_path='' as $$
declare m public.matches;
begin
 select * into m from public.matches where id=case when tg_op='DELETE' then old.match_id else new.match_id end for update;
 -- Cascading match deletion must remain possible.
 if not found then if tg_op='DELETE' then return old; end if; raise exception 'Match not found'; end if;
 if m.started_at is not null then raise exception 'Match-day lineups lock at kickoff'; end if;
 if tg_op='DELETE' then return old; end if;
 if new.team_id not in(m.home_team_id,m.away_team_id) or not exists(
   select 1 from public.squad_memberships where player_id=new.player_id and team_id=new.team_id and season_id=m.season_id) then
   raise exception 'Select a registered player from this tournament squad';
 end if;
 if public.is_suspended(new.player_id,m.season_id,m.id) then raise exception 'This player is suspended for this tournament'; end if;
 return new;
end $$;
create trigger match_squads_lineup_guard before insert or update or delete on public.match_squads
 for each row execute function public.guard_match_lineup();

create function public.validate_match_rules() returns trigger
language plpgsql security definer set search_path='' as $$
declare h integer; a integer; side bigint; n integer; keepers integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('ccl-season:'||new.season_id,0));
 if new.home_team_id=new.away_team_id or not exists(select 1 from public.teams where id=new.home_team_id and season_id=new.season_id)
 or not exists(select 1 from public.teams where id=new.away_team_id and season_id=new.season_id) then
   raise exception 'Both clubs must be entered in this tournament';
 end if;
 if tg_op='INSERT' and new.score_source<>'events' then raise exception 'New scores must come from goal events'; end if;
 if tg_op='UPDATE' and new.score_source<>old.score_source and new.score_source<>'events' then raise exception 'Manual legacy scores cannot be introduced'; end if;
 if new.result_kind='forfeit' then
   if new.forfeit_team_id is null or new.forfeit_team_id not in(new.home_team_id,new.away_team_id) or coalesce(length(trim(new.decision_note)),0)=0 then
     raise exception 'Select the forfeiting club and record the staff decision';
   end if;
   new.home_score:=case when new.forfeit_team_id=new.home_team_id then 0 else 3 end;
   new.away_score:=case when new.forfeit_team_id=new.away_team_id then 0 else 3 end;
   new.home_penalties:=null; new.away_penalties:=null;
 elsif new.score_source='events' then
   select count(*) filter(where (team_id=new.home_team_id and event_type in ('goal','penalty_scored')) or (team_id=new.away_team_id and event_type='own_goal')),
          count(*) filter(where (team_id=new.away_team_id and event_type in ('goal','penalty_scored')) or (team_id=new.home_team_id and event_type='own_goal'))
     into h,a from public.match_events where match_id=new.id;
   if (new.home_score is not null and new.home_score<>h) or (new.away_score is not null and new.away_score<>a) then
     raise exception 'Normal scores are calculated from registered-player goal events';
   end if;
   new.home_score:=case when new.match_status='scheduled' and h+a=0 then null else h end;
   new.away_score:=case when new.match_status='scheduled' and h+a=0 then null else a end;
 elsif tg_op='UPDATE' and (new.home_score is distinct from old.home_score or new.away_score is distinct from old.away_score) then
   raise exception 'Historical scores are preserved; reconcile the goal ledger before changing this result';
 end if;
 if new.match_status='completed' and new.stage<>'group' and new.home_score=new.away_score
   and (new.home_penalties is null or new.away_penalties is null or new.home_penalties=new.away_penalties) then
   -- Preserve already imported historical results while requiring resolution
   -- when completing a match or changing its result.
   if tg_op='INSERT' or old.match_status<>'completed' or new.home_score is distinct from old.home_score or new.away_score is distinct from old.away_score then
     raise exception 'A drawn knockout match requires direct penalties with a winner';
   end if;
 end if;
 if new.home_penalties is not null or new.away_penalties is not null then
   if new.stage='group' or new.home_penalties is null or new.away_penalties is null or new.home_penalties=new.away_penalties or new.home_score<>new.away_score then
     raise exception 'A shootout needs a level knockout score and a winner';
   end if;
 end if;
 if new.result_kind<>'forfeit' and new.match_status in ('live','completed') and
   (tg_op='INSERT' or old.match_status not in ('live','completed')) then
   foreach side in array array[new.home_team_id,new.away_team_id] loop
     select count(*) filter(where lineup_role='starter'), count(*) filter(where lineup_role='starter' and is_goalkeeper)
       into n,keepers from public.match_squads where match_id=new.id and team_id=side;
     if n<6 or n>8 or keepers<>1 then raise exception 'Select six to eight starters per side, including one goalkeeper'; end if;
     if exists(select 1 from public.match_squads where match_id=new.id and public.is_suspended(player_id,new.season_id,new.id)) then
       raise exception 'Remove suspended players from the match-day lineup';
     end if;
   end loop;
 end if;
 if new.match_status in ('live','completed') then
   new.started_at:=coalesce(new.started_at,now());
   update public.seasons set started_at=coalesce(started_at,new.started_at) where id=new.season_id;
   insert into public.tournament_player_clubs select player_id,season_id,team_id from public.squad_memberships where season_id=new.season_id on conflict do nothing;
 end if;
 if new.match_status='completed' then new.completed_at:=coalesce(new.completed_at,now()); else new.completed_at:=null; end if;
 return new;
end $$;
create trigger matches_rules before insert or update on public.matches for each row execute function public.validate_match_rules();

-- Recount rather than increment: every score has a complete player ledger.
create or replace function public.sync_score_from_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare mid bigint; m public.matches; h integer; a integer;
begin
 mid:=case when tg_op='DELETE' then old.match_id else new.match_id end;
 select * into m from public.matches where id=mid for update;
 if not found then return null; end if;
 if m.score_source='legacy' then raise exception 'Reconcile historical goal events before editing this ledger'; end if;
 select count(*) filter(where (team_id=m.home_team_id and event_type in ('goal','penalty_scored')) or (team_id=m.away_team_id and event_type='own_goal')),
        count(*) filter(where (team_id=m.away_team_id and event_type in ('goal','penalty_scored')) or (team_id=m.home_team_id and event_type='own_goal'))
 into h,a from public.match_events where match_id=mid;
 update public.matches set home_score=h,away_score=a where id=mid and result_kind='normal';
 return null;
end $$;

create function public.guard_match_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare m public.matches;
begin
 select * into m from public.matches where id=new.match_id for update;
 if new.player_id is null or new.team_id not in(m.home_team_id,m.away_team_id) or not exists(
  select 1 from public.squad_memberships where player_id=new.player_id and team_id=new.team_id and season_id=m.season_id) then
  raise exception 'Select a registered squad player for every event';
 end if;
 if tg_op='UPDATE' and new.match_id<>old.match_id then raise exception 'Events cannot move between matches'; end if;
 if new.event_type='substitution' and (new.incoming_player_id is null or new.incoming_player_id=new.player_id or not exists(
   select 1 from public.squad_memberships where player_id=new.incoming_player_id and team_id=new.team_id and season_id=m.season_id)) then
   raise exception 'Select different registered outgoing and incoming players';
 end if;
 return new;
end $$;
create trigger match_events_registration_guard before insert or update on public.match_events for each row execute function public.guard_match_event();

create function public.check_match_exchanges() returns trigger
language plpgsql security definer set search_path='' as $$
declare mid bigint; m public.matches; side bigint; active bigint[]; used bigint[]; keepers bigint[];
 e record; outfield_changes int; keeper_changes int;
begin
 mid:=case when tg_op='DELETE' then old.match_id else new.match_id end;
 select * into m from public.matches where id=mid for update;
 if not found then return null; end if;
 foreach side in array array[m.home_team_id,m.away_team_id] loop
   select coalesce(array_agg(player_id) filter(where lineup_role='starter'), '{}'),
          coalesce(array_agg(player_id) filter(where lineup_role='starter' and is_goalkeeper), '{}')
   into active,keepers from public.match_squads where match_id=mid and team_id=side;
   used:=active; outfield_changes:=0; keeper_changes:=0;
   for e in select * from public.match_events where match_id=mid and team_id=side order by minute,coalesce(extra_minute,0),id loop
     if e.event_type='substitution' then
       if not e.player_id=any(active) or e.incoming_player_id=any(used) or not exists(
         select 1 from public.match_squads where match_id=mid and team_id=side and player_id=e.incoming_player_id and lineup_role='bench') then
         raise exception 'A substitution replaces an active player with an unused match-day substitute; no re-entry';
       end if;
       if e.is_goalkeeper_change then
         if cardinality(keepers)>0 and not e.player_id=any(keepers) then raise exception 'A goalkeeper change must replace the current goalkeeper'; end if;
         keeper_changes:=keeper_changes+1; keepers:=array[e.incoming_player_id];
       else
         if e.player_id=any(keepers) then raise exception 'Mark a goalkeeper exchange as a goalkeeper change'; end if;
         outfield_changes:=outfield_changes+1;
       end if;
       if keeper_changes>1 or outfield_changes>5 then raise exception 'Maximum five outfield changes and one goalkeeper change'; end if;
       active:=array_append(array_remove(active,e.player_id),e.incoming_player_id);
       used:=array_append(used,e.incoming_player_id);
     elsif e.event_type='red_card' then
       active:=array_remove(active,e.player_id); keepers:=array_remove(keepers,e.player_id);
     end if;
   end loop;
   if m.match_status='live' and cardinality(active)<5 then
     update public.matches set match_status='stopped',decision_note='Play stopped below five players; staff must decide the outcome.' where id=mid;
   end if;
 end loop;
 return null;
end $$;
create trigger match_events_exchanges after insert or update or delete on public.match_events
 for each row execute function public.check_match_exchanges();

-- Save selected starters and substitutes before changing status, in the same
-- transaction. Direct APIs still pass the same triggers and RLS boundaries.
create function public.save_match_details(fixture bigint, details jsonb, lineups jsonb default null) returns void
language plpgsql security invoker set search_path=public as $$
declare current_match public.matches; r jsonb;
begin
 select * into current_match from public.matches where id=fixture for update;
 if not found then raise exception 'Match not found'; end if;
 if lineups is not null then
   if current_match.started_at is not null then raise exception 'Match-day lineups lock at kickoff'; end if;
   delete from public.match_squads where match_id=fixture;
   for r in select * from jsonb_array_elements(lineups) loop
     insert into public.match_squads(match_id,team_id,player_id,player_name,shirt_number,lineup_role,is_goalkeeper)
       select fixture,(r->>'team_id')::bigint,p.id,p.full_name,p.shirt_number,r->>'lineup_role',coalesce((r->>'is_goalkeeper')::boolean,false)
       from public.players p where p.id=(r->>'player_id')::bigint;
     if not found then raise exception 'Selected player not found'; end if;
   end loop;
 end if;
 update public.matches set
   stage=details->>'stage', group_id=(details->>'group_id')::bigint,
   venue_id=(details->>'venue_id')::bigint, kickoff_at=(details->>'kickoff_at')::timestamptz,
   match_status=details->>'match_status', publication_status='published',
   home_score=(details->>'home_score')::integer, away_score=(details->>'away_score')::integer,
   home_penalties=(details->>'home_penalties')::integer, away_penalties=(details->>'away_penalties')::integer,
   referee_name=details->>'referee_name', stream_url=details->>'stream_url',
   result_kind=coalesce(details->>'result_kind','normal'), forfeit_team_id=(details->>'forfeit_team_id')::bigint,
   decision_note=details->>'decision_note'
 where id=fixture;
end $$;
revoke all on function public.save_match_details(bigint,jsonb,jsonb) from public,anon;
grant execute on function public.save_match_details(bigint,jsonb,jsonb) to authenticated;

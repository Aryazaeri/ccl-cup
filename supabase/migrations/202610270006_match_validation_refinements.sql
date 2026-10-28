-- Preserve pre-fixture entry corrections and enforce server-owned match clocks.
create or replace function public.guard_tournament_membership() returns trigger
language plpgsql security definer set search_path='' as $$
declare sid bigint; started timestamptz; original_team bigint;
begin
 sid:=case when tg_op='DELETE' then old.season_id else new.season_id end;
 perform pg_advisory_xact_lock(hashtextextended('ccl-season:'||sid,0));
 select started_at into started from public.seasons where id=sid;
 if tg_op='UPDATE' and new.player_id<>old.player_id then raise exception 'Squad places cannot change player identity'; end if;
 if tg_op='UPDATE' and new.season_id<>old.season_id then
   -- The existing entry-correction workflow cascades its composite FK. It is
   -- not a within-tournament transfer and is already blocked when fixtures exist.
   if new.team_id<>old.team_id or not exists(select 1 from public.teams where id=new.team_id and season_id=new.season_id)
     or exists(select 1 from public.matches where home_team_id=old.team_id or away_team_id=old.team_id) then
     raise exception 'Only an unplayed entry can be corrected into another tournament';
   end if;
   if exists(select 1 from public.tournament_player_clubs where player_id=new.player_id and season_id=new.season_id and team_id<>new.team_id) then
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
     if original_team is not null and original_team<>new.team_id then
       raise exception 'Players cannot transfer clubs after the tournament has kicked off' using errcode='23514';
     end if;
     insert into public.tournament_player_clubs values(new.player_id,sid,new.team_id) on conflict do nothing;
   end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;

create constraint trigger teams_corrected_entry_minimum after update on public.teams
 deferrable initially deferred for each row when(old.season_id is distinct from new.season_id)
 execute function public.enforce_min_squad();

create function public.is_suspended_at(person bigint,tournament bigint,fixture bigint,at_time timestamptz) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.player_suspensions s
 where s.player_id=person and s.season_id=tournament and s.revoked_at is null and s.issued_at<=at_time
 and ((s.ends_on is not null and (at_time at time zone 'Europe/Istanbul')::date<=s.ends_on)
 or (s.match_count is not null and public.suspension_served(s.id,at_time)<s.match_count)))
$$;
revoke all on function public.is_suspended_at(bigint,bigint,bigint,timestamptz) from public,anon,authenticated;
create or replace function public.is_suspended(person bigint,tournament bigint,fixture bigint) returns boolean
language sql stable security definer set search_path='' as $$
 select public.is_suspended_at(person,tournament,fixture,coalesce(m.started_at,m.kickoff_at,clock_timestamp())) from public.matches m where m.id=fixture
$$;

create or replace function public.guard_match_lineup() returns trigger
language plpgsql security definer set search_path='' as $$
declare m public.matches;
begin
 select * into m from public.matches where id=case when tg_op='DELETE' then old.match_id else new.match_id end for update;
 -- Cascading match deletion must remain possible.
 if not found then if tg_op='DELETE' then return old; end if; raise exception 'Match not found'; end if;
 if tg_op='UPDATE' and new.player_id is null and old.player_id is not null
    and not exists(select 1 from public.players where id=old.player_id) then return new; end if;
 if m.started_at is not null then raise exception 'Match-day lineups lock at kickoff'; end if;
 if tg_op='DELETE' then return old; end if;
 if new.team_id not in(m.home_team_id,m.away_team_id) or not exists(
   select 1 from public.squad_memberships where player_id=new.player_id and team_id=new.team_id and season_id=m.season_id) then
   raise exception 'Select a registered player from this tournament squad';
 end if;
 if public.is_suspended(new.player_id,m.season_id,m.id) then raise exception 'This player is suspended for this tournament'; end if;
 return new;
end $$;

create or replace function public.validate_match_rules() returns trigger
language plpgsql security definer set search_path='' as $$
declare h integer; a integer; side bigint; n integer; keepers integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('ccl-season:'||new.season_id,0));
 if tg_op='UPDATE' then new.started_at:=old.started_at; new.completed_at:=old.completed_at; else new.started_at:=null; new.completed_at:=null; end if;
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
     if n<(case when old.started_at is null then 6 else 5 end) or n>8 or keepers<>1 then raise exception 'Select six to eight starters per side, including one goalkeeper'; end if;
     if exists(select 1 from public.match_squads where match_id=new.id and public.is_suspended_at(player_id,new.season_id,new.id,clock_timestamp())) then
       raise exception 'Remove suspended players from the match-day lineup';
     end if;
   end loop;
 end if;
 if new.match_status in ('live','completed') then
   new.started_at:=coalesce(new.started_at,clock_timestamp());
   update public.seasons set started_at=coalesce(started_at,new.started_at) where id=new.season_id;
   insert into public.tournament_player_clubs select player_id,season_id,team_id from public.squad_memberships where season_id=new.season_id on conflict do nothing;
 end if;
 if new.match_status='completed' then new.completed_at:=coalesce(new.completed_at,clock_timestamp()); else new.completed_at:=null; end if;
 return new;
end $$;

create function public.guard_suspension_identity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.player_id<>old.player_id or new.season_id<>old.season_id or new.team_id<>old.team_id or new.issued_at<>old.issued_at) then
   raise exception 'Suspension identity and issue time are immutable; revoke and record a corrected decision';
 end if;
 if tg_op='INSERT' then
   new.issued_at:=clock_timestamp();
   if not exists(select 1 from public.squad_memberships where player_id=new.player_id and team_id=new.team_id and season_id=new.season_id) then
     raise exception 'Issue a suspension for the player registered in this tournament';
   end if;
 end if;
 return new;
end $$;
create trigger player_suspensions_identity before insert or update on public.player_suspensions
 for each row execute function public.guard_suspension_identity();

create function public.guard_event_clock() returns trigger language plpgsql set search_path='' as $$
begin
 if new.minute<0 or new.minute>50 then raise exception 'CCL plays two 25-minute halves. Use the stoppage-minute field after 25 or 50.'; end if;
 return new;
end $$;
create trigger match_events_clock before insert or update of minute on public.match_events
 for each row execute function public.guard_event_clock();
notify pgrst, 'reload schema';

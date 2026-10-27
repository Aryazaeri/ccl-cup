-- Dates missing from the archive use the first recorded kickoff, as confirmed.
update public.seasons s set starts_on=(select (min(m.kickoff_at) at time zone 'Europe/Istanbul')::date from public.matches m where m.season_id=s.id)
 where starts_on is null;

create function public.lock_tournament_clock(tournament bigint) returns timestamptz
language plpgsql security definer set search_path='' as $$
declare started timestamptz; first_kickoff timestamptz;
begin
 perform pg_advisory_xact_lock(hashtextextended('ccl-season:'||tournament,0));
 select started_at into started from public.seasons where id=tournament for update;
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
revoke all on function public.lock_tournament_clock(bigint) from public,anon,authenticated;

create function public.retain_tournament_deadline() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- A deadline already passed cannot be reopened by moving/deleting its fixture.
 perform public.lock_tournament_clock(old.season_id);
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger matches_registration_deadline before update or delete on public.matches
 for each row execute function public.retain_tournament_deadline();

create or replace function public.guard_tournament_membership() returns trigger
language plpgsql security definer set search_path='' as $$
declare sid bigint; started timestamptz; original_team bigint;
begin
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

create or replace function public.validate_match_rules() returns trigger
language plpgsql security definer set search_path='' as $$
declare h integer; a integer; side bigint; n integer; keepers integer; day_state record;
begin
 perform pg_advisory_xact_lock(hashtextextended('ccl-season:'||new.season_id,0));
 perform public.lock_tournament_clock(new.season_id);
 if tg_op='UPDATE' then new.started_at:=old.started_at; new.completed_at:=old.completed_at; else new.started_at:=null; new.completed_at:=null; end if;
 if new.match_status<>'postponed' and new.kickoff_at<=clock_timestamp() then
   update public.seasons set started_at=coalesce(started_at,new.kickoff_at) where id=new.season_id;
   insert into public.tournament_player_clubs select player_id,season_id,team_id from public.squad_memberships where season_id=new.season_id on conflict do nothing;
 end if;
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
   if new.score_source<>'legacy' or tg_op='INSERT' or old.match_status<>'completed' or new.stage is distinct from old.stage or new.home_score is distinct from old.home_score or new.away_score is distinct from old.away_score or new.home_penalties is distinct from old.home_penalties or new.away_penalties is distinct from old.away_penalties then
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
 if new.match_status='live' and new.result_kind<>'forfeit' then
   foreach side in array array[new.home_team_id,new.away_team_id] loop
     select * into day_state from public.match_day_state(new.id,side);
     if cardinality(day_state.active)<(case when new.started_at is null then 6 else 5 end) or cardinality(day_state.keepers)<>1 then
       raise exception 'Play cannot start or resume without the required on-field players and a goalkeeper';
     end if;
   end loop;
 end if;
 if new.result_kind='normal' and new.match_status in ('live','completed') then
   new.started_at:=coalesce(new.started_at,clock_timestamp());
   update public.seasons set started_at=coalesce(started_at,new.started_at) where id=new.season_id;
   insert into public.tournament_player_clubs select player_id,season_id,team_id from public.squad_memberships where season_id=new.season_id on conflict do nothing;
 end if;
 if new.match_status='completed' then new.completed_at:=coalesce(new.completed_at,clock_timestamp()); else new.completed_at:=null; end if;
 return new;
end $$;

create or replace function public.suspension_served(suspension bigint, before_time timestamptz default now()) returns bigint
language sql stable security definer set search_path='' as $$
 select count(*) from public.player_suspensions s join public.matches m
 on m.season_id=s.season_id and s.team_id in (m.home_team_id,m.away_team_id)
 where s.id=suspension and m.match_status='completed' and m.result_kind='normal'
 and m.completed_at>=s.issued_at and m.completed_at<before_time
 and not exists(select 1 from public.match_squads ms where ms.match_id=m.id and ms.player_id=s.player_id)
$$;
notify pgrst,'reload schema';

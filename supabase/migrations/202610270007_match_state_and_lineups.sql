-- Re-evaluate on-field counts when resuming, not only when adding cards.
create function public.match_day_state(fixture bigint, side bigint, out active bigint[], out keepers bigint[]) returns record
language plpgsql security definer set search_path='' as $$
declare e record;
begin
 select coalesce(array_agg(player_id) filter(where lineup_role='starter'), '{}'),
        coalesce(array_agg(player_id) filter(where lineup_role='starter' and is_goalkeeper), '{}')
 into active,keepers from public.match_squads where match_id=fixture and team_id=side;
 for e in select * from public.match_events where match_id=fixture and team_id=side order by minute,coalesce(extra_minute,0),id loop
  if e.event_type='substitution' then
   active:=array_append(array_remove(active,e.player_id),e.incoming_player_id);
   if e.is_goalkeeper_change then keepers:=array[e.incoming_player_id]; end if;
  elsif e.event_type='red_card' then active:=array_remove(active,e.player_id);keepers:=array_remove(keepers,e.player_id);
  end if;
 end loop;
end $$;
revoke all on function public.match_day_state(bigint,bigint) from public,anon,authenticated;

-- Preserve old snapshots explicitly; new match selections distinguish starters
-- from unused substitutes for appearance counts.
alter table public.matches add column lineup_source text not null default 'legacy' check(lineup_source in ('legacy','selected'));
alter table public.matches alter column lineup_source set default 'selected';
alter table public.matches disable trigger matches_rules;
update public.matches set score_source='legacy' where match_status='completed' and stage<>'group'
 and home_score=away_score and (home_penalties is null or away_penalties is null or home_penalties=away_penalties);
alter table public.matches enable trigger matches_rules;

create or replace function public.validate_match_rules() returns trigger
language plpgsql security definer set search_path='' as $$
declare h integer; a integer; side bigint; n integer; keepers integer; day_state record;
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

create function public.validate_club_lineup() returns trigger language plpgsql set search_path='' as $$
declare ids bigint[];
begin
 if new.lineup is null or (tg_op='UPDATE' and new.lineup is not distinct from old.lineup) then return new; end if;
 if new.lineup->>'formation'<>'8v8' then raise exception 'CCL uses eight-a-side lineups'; end if;
 select array_agg(id) into ids from (
  select value::bigint id from jsonb_each_text(new.lineup->'starters')
  union all select value::text::bigint from jsonb_array_elements(new.lineup->'bench')
 ) p;
 if (select count(*) from jsonb_object_keys(new.lineup->'starters'))>8
 or cardinality(ids)<>(select count(distinct id) from unnest(ids) id)
 or exists(select 1 from unnest(ids) id where not exists(select 1 from public.squad_memberships where player_id=id and team_id=new.id)) then
  raise exception 'Select each registered squad player at most once in the lineup';
 end if;
 return new;
end $$;
create trigger teams_validate_lineup before insert or update of lineup on public.teams
 for each row execute function public.validate_club_lineup();

-- Referenced files are immutable through browser Storage APIs. Uploaded
-- replacements receive new names; existing row/canvas references remain valid.
drop policy club_assets_update on storage.objects;
create policy club_assets_update on storage.objects for update to authenticated
 using(bucket_id='club-assets' and public.can_manage_asset(name) and not public.asset_is_referenced(name))
 with check(bucket_id='club-assets' and public.can_manage_asset(name));
notify pgrst,'reload schema';

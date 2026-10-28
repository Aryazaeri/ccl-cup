-- Cascading parent deletion and historical identity unlinking are not new events.
alter table public.match_events add column incoming_player_name text;
alter table public.match_events disable trigger user;
update public.match_events e set player_name=p.full_name from public.players p where e.player_id=p.id;
update public.match_events e set incoming_player_name=p.full_name from public.players p where e.incoming_player_id=p.id;

alter table public.match_events enable trigger user;

create or replace function public.guard_match_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare m public.matches;
begin
 select * into m from public.matches where id=new.match_id for update;
 if not found or not exists(select 1 from public.seasons where id=m.season_id) then return new; end if;
 -- Foreign-key SET NULL preserves a deleted person's historical name. Ordinary
 -- API attempts to clear a registered scorer are still rejected.
 if tg_op='UPDATE' and (
   (new.player_id is null and old.player_id is not null and not exists(select 1 from public.players where id=old.player_id))
   or (new.incoming_player_id is null and old.incoming_player_id is not null and not exists(select 1 from public.players where id=old.incoming_player_id))
 ) then return new; end if;
 if new.player_id is null or new.team_id not in(m.home_team_id,m.away_team_id) or not exists(
  select 1 from public.squad_memberships where player_id=new.player_id and team_id=new.team_id and season_id=m.season_id) then
  raise exception 'Select a registered squad player for every event';
 end if;
 if tg_op='UPDATE' and new.match_id<>old.match_id then raise exception 'Events cannot move between matches'; end if;
 if new.event_type='substitution' and (new.incoming_player_id is null or new.incoming_player_id=new.player_id or not exists(
   select 1 from public.squad_memberships where player_id=new.incoming_player_id and team_id=new.team_id and season_id=m.season_id)) then
   raise exception 'Select different registered outgoing and incoming players';
 end if;
 select full_name into new.player_name from public.players where id=new.player_id;
 if new.incoming_player_id is not null then select full_name into new.incoming_player_name from public.players where id=new.incoming_player_id; end if;
 return new;
end $$;

create or replace function public.sync_score_from_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare mid bigint; m public.matches; h integer; a integer;
begin
 mid:=case when tg_op='DELETE' then old.match_id else new.match_id end;
 select * into m from public.matches where id=mid for update;
 if not found or not exists(select 1 from public.seasons where id=m.season_id) then return null; end if;
 if tg_op='UPDATE' and (
   (new.player_id is null and old.player_id is not null and not exists(select 1 from public.players where id=old.player_id))
   or (new.incoming_player_id is null and old.incoming_player_id is not null and not exists(select 1 from public.players where id=old.incoming_player_id))
 ) then return null; end if;
 if m.score_source='legacy' then raise exception 'Reconcile historical goal events before editing this ledger'; end if;
 select count(*) filter(where (team_id=m.home_team_id and event_type in ('goal','penalty_scored')) or (team_id=m.away_team_id and event_type='own_goal')),
        count(*) filter(where (team_id=m.away_team_id and event_type in ('goal','penalty_scored')) or (team_id=m.home_team_id and event_type='own_goal'))
 into h,a from public.match_events where match_id=mid;
 update public.matches set home_score=h,away_score=a where id=mid and result_kind='normal';
 return null;
end $$;


create or replace function public.check_match_exchanges() returns trigger
language plpgsql security definer set search_path='' as $$
declare mid bigint; m public.matches; side bigint; active bigint[]; used bigint[]; keepers bigint[];
 e record; outfield_changes int; keeper_changes int;
begin
 mid:=case when tg_op='DELETE' then old.match_id else new.match_id end;
 select * into m from public.matches where id=mid for update;
 if not found or not exists(select 1 from public.seasons where id=m.season_id) then return null; end if;
 if tg_op='UPDATE' and (
   (new.player_id is null and old.player_id is not null and not exists(select 1 from public.players where id=old.player_id))
   or (new.incoming_player_id is null and old.incoming_player_id is not null and not exists(select 1 from public.players where id=old.incoming_player_id))
 ) then return null; end if;
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

notify pgrst,'reload schema';

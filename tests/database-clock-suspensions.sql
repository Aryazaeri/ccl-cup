-- Disposable local database only. All fixtures and identities roll back.
begin;
create function pg_temp.expect_failure(statement text, expected text) returns void language plpgsql as $$
declare failed boolean:=false;
begin
 begin execute statement; exception when others then
  if sqlerrm not ilike '%'||expected||'%' then raise; end if; failed:=true;
 end;
 if not failed then raise exception 'Expected rejection: %',expected; end if;
end $$;
do $$
declare sid bigint; a bigint; b bigint; c bigint; club_c bigint; m bigint; postponed bigint; pa bigint[]; pb bigint[]; roster jsonb; ban bigint; date_ban bigint; test_end date; n integer; person bigint;
begin
 insert into seasons(name,slug,year,city,status) values('Deadline regression','deadline-regression',2026,'Antalya','draft') returning id into sid;
 select jsonb_agg(jsonb_build_object('full_name','Deadline A '||i,'shirt_number',i,'position',case when i=1 then 'goalkeeper' else 'forward' end)) into roster from generate_series(1,10) i;
 a:=create_season_entry(jsonb_build_object('season_id',sid,'name','Deadline A','slug','deadline-a'),'{}',roster);
 select jsonb_agg(jsonb_build_object('full_name','Deadline B '||i,'shirt_number',i,'position',case when i=1 then 'goalkeeper' else 'forward' end)) into roster from generate_series(1,10) i;
 b:=create_season_entry(jsonb_build_object('season_id',sid,'name','Deadline B','slug','deadline-b'),'{}',roster);
 select array_agg(player_id order by p.shirt_number) into pa from squad_memberships sm join players p on p.id=sm.player_id where sm.team_id=a;
 select array_agg(player_id order by p.shirt_number) into pb from squad_memberships sm join players p on p.id=sm.player_id where sm.team_id=b;
 set constraints all immediate;
 insert into matches(season_id,home_team_id,away_team_id,stage,kickoff_at,match_status) values(sid,a,b,'group',clock_timestamp()-interval '1 hour','postponed') returning id into postponed;
 -- A past postponed fixture does not lock transfers.
 update squad_memberships set team_id=b where player_id=pa[10] and season_id=sid;
 update squad_memberships set team_id=a where player_id=pa[10] and season_id=sid;
 if (select started_at from seasons where id=sid) is not null then raise exception 'Postponed kickoff locked registration'; end if;
 -- An early administrative award is not actual play and its future deadline has not passed.
 insert into matches(season_id,home_team_id,away_team_id,stage,kickoff_at,match_status,result_kind,forfeit_team_id,decision_note)
 values(sid,a,b,'group',clock_timestamp()+interval '2 days','completed','forfeit',b,'Administrative decision') returning id into m;
 update squad_memberships set team_id=b where player_id=pa[10] and season_id=sid;
 update squad_memberships set team_id=a where player_id=pa[10] and season_id=sid;
 if (select started_at from seasons where id=sid) is not null then raise exception 'Early forfeit locked registration before deadline'; end if;
 -- No Live status is needed: inserting the elapsed scheduled deadline locks transfers.
 insert into matches(season_id,home_team_id,away_team_id,stage,kickoff_at) values(sid,a,b,'group',clock_timestamp()-interval '1 minute') returning id into m;
 perform pg_temp.expect_failure(format('update squad_memberships set team_id=%s where player_id=%s and season_id=%s',b,pa[10],sid),'cannot transfer');
 update matches set kickoff_at=clock_timestamp()+interval '3 days',match_status='postponed' where id=m;
 delete from matches where id=m;
 perform pg_temp.expect_failure(format('update squad_memberships set team_id=%s where player_id=%s and season_id=%s',b,pa[10],sid),'cannot transfer');
 set constraints all deferred;
 -- Deleting an entry cannot erase a person's original club identity.
 select jsonb_agg(jsonb_build_object('full_name','Deadline C '||i,'position','forward')) into roster from generate_series(1,5) i;
 c:=create_season_entry(jsonb_build_object('season_id',sid,'name','Deadline C','slug','deadline-c'),'{}',roster);
 set constraints all immediate;
 select club_id into club_c from teams where id=c;
 select player_id into person from squad_memberships where team_id=c limit 1;
 delete from teams where id=c;
 perform pg_temp.expect_failure(format('insert into squad_memberships(player_id,team_id,season_id) values(%s,%s,%s)',person,b,sid),'cannot transfer');
 set constraints all deferred;
 c:=create_season_entry(jsonb_build_object('season_id',sid,'club_id',club_c,'name','Deadline C','slug','deadline-c-return'),array(select id from players where full_name like 'Deadline C %'),'[]');
 set constraints all immediate;
 if not exists(select 1 from squad_memberships where team_id=c and player_id=person) then raise exception 'Same shared club re-entry lost its player'; end if;
 -- Suspend a registered player. Forfeits do not serve the ban.
 insert into player_suspensions(player_id,team_id,season_id,match_count,reason) values(pa[2],a,sid,2,'Two played matches') returning id into ban;
 insert into matches(season_id,home_team_id,away_team_id,stage,kickoff_at,match_status,result_kind,forfeit_team_id,decision_note)
 values(sid,a,b,'group',clock_timestamp()+interval '3 days','completed','forfeit',b,'Another administrative decision');
 if suspension_served(ban,clock_timestamp())<>0 then raise exception 'Forfeit served a suspension'; end if;
 for n in 1..2 loop
  insert into matches(season_id,home_team_id,away_team_id,stage,kickoff_at) values(sid,a,b,'group',clock_timestamp()+interval '4 days') returning id into m;
  perform pg_temp.expect_failure(format('insert into match_squads(match_id,team_id,player_id,player_name,lineup_role) values(%s,%s,%s,''Suspended'',''bench'')',m,a,pa[2]),'suspended');
  insert into match_squads(match_id,team_id,player_id,player_name,lineup_role,is_goalkeeper)
   select m,sm.team_id,p.id,p.full_name,'starter',p.shirt_number=1 from squad_memberships sm join players p on p.id=sm.player_id
   where sm.team_id in(a,b) and p.shirt_number<=7 and p.id not in(pa[2],pb[7]);
  update matches set match_status='completed' where id=m;
  if suspension_served(ban,clock_timestamp())<>n then raise exception 'Excluded player did not serve completed played match %',n; end if;
 end loop;
 if is_suspended_at(pa[2],sid,m,clock_timestamp()) then raise exception 'Served match ban remained active'; end if;
 -- End date includes the entire stated Istanbul calendar day.
 test_end:=(clock_timestamp() at time zone 'Europe/Istanbul')::date+2;
 insert into player_suspensions(player_id,team_id,season_id,ends_on,reason) values(pa[3],a,sid,test_end,'Date suspension') returning id into date_ban;
 if not is_suspended_at(pa[3],sid,m,(test_end+time '23:59:59') at time zone 'Europe/Istanbul') then raise exception 'Date ban ended before the end date finished'; end if;
 if is_suspended_at(pa[3],sid,m,((test_end+1)+time '00:00') at time zone 'Europe/Istanbul') then raise exception 'Player cannot return the following day'; end if;
 -- Suspending in this tournament never affects a different tournament.
 if is_suspended_at(pa[3],sid+1000000,m,clock_timestamp()+interval '1 day') then raise exception 'Suspension leaked between tournaments'; end if;
 insert into match_events(match_id,team_id,player_id,event_type,minute) values(m,a,pa[4],'goal',10);
 delete from players where id=pa[4];
 if not exists(select 1 from match_events where match_id=m and player_id is null and player_name='Deadline A 4') then raise exception 'Deleting person lost historical goal name'; end if;
 delete from seasons where id=sid;
 if exists(select 1 from squad_memberships where season_id=sid) then raise exception 'Season cascade left memberships'; end if;
end $$;
rollback;
select 'automatic kickoff, postponed fixtures, entry history and suspension boundaries passed' as result;

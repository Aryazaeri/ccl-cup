-- Isolated Supabase regression. Fixtures, timestamps and changes roll back.
begin;
create function pg_temp.must_fail(statement text, expected text) returns void language plpgsql as $$
declare failed boolean:=false; begin
 begin execute statement; exception when others then
   if sqlerrm not ilike '%'||expected||'%' then raise; end if; failed:=true;
 end;
 if not failed then raise exception 'Expected failure: %',expected; end if;
end $$;
create temp table rule_fixture(season bigint,a bigint,b bigint,m1 bigint,m2 bigint,pa bigint[],pb bigint[]);
do $$ declare sid bigint; a bigint; b bigint; c bigint; m1 bigint; m2 bigint; pa bigint[]; pb bigint[]; roster jsonb;
begin
 insert into seasons(name,slug,year,city,status,starts_on) values('Rule regression','rule-regression',2026,'Antalya','published','2026-01-01') returning id into sid;
 select jsonb_agg(jsonb_build_object('full_name','Rules A '||i,'shirt_number',i,'position',case when i=1 then 'goalkeeper' else 'forward' end)) into roster from generate_series(1,15) i;
 a:=create_season_entry(jsonb_build_object('season_id',sid,'name','Rule regression A','slug','rule-regression-a'), '{}',roster);
 select jsonb_agg(jsonb_build_object('full_name','Rules B '||i,'shirt_number',i,'position',case when i=1 then 'goalkeeper' else 'forward' end)) into roster from generate_series(1,15) i;
 b:=create_season_entry(jsonb_build_object('season_id',sid,'name','Rule regression B','slug','rule-regression-b'), '{}',roster);
 select array_agg(sm.player_id order by p.shirt_number) into pa from squad_memberships sm join players p on p.id=sm.player_id where sm.team_id=a;
 select array_agg(sm.player_id order by p.shirt_number) into pb from squad_memberships sm join players p on p.id=sm.player_id where sm.team_id=b;
 c:=create_season_entry(jsonb_build_object('season_id',sid,'name','Rule regression C','slug','rule-regression-c'),pa[1:5], '[]');
 set constraints all immediate;
 -- Entry uses a separate empty starting squad: do not transfer the first club's
 -- test players; put its five back, then prove entry-only minimum on C.
 update squad_memberships set team_id=a where team_id=c;
 insert into squad_memberships(player_id,team_id,season_id) select p.id,c,sid from players p where false;
 -- C was valid when entered and may now have zero; no continuing floor.
 if exists(select 1 from squad_memberships where team_id=c) then raise exception 'Release did not persist'; end if;
 -- The entry minimum was checked before release; no continuing floor applies.
 delete from teams where id=c;
 insert into matches(season_id,home_team_id,away_team_id,stage,kickoff_at,publication_status)
 values(sid,a,b,'group',now()+interval '1 day','draft') returning id into m1;
 insert into matches(season_id,home_team_id,away_team_id,stage,kickoff_at,publication_status)
 values(sid,a,b,'group',now()+interval '2 days','draft') returning id into m2;
 insert into rule_fixture values(sid,a,b,m1,m2,pa,pb);
 perform pg_temp.must_fail(format('update matches set home_score=2,away_score=0 where id=%s',m1),'calculated');
 perform pg_temp.must_fail(format('insert into match_events(match_id,team_id,player_name,event_type,minute) values(%s,%s,''Unregistered'',''goal'',5)',m1,a),'registered');
 insert into match_squads(match_id,team_id,player_id,player_name,lineup_role,is_goalkeeper)
 select m1,sm.team_id,p.id,p.full_name,case when p.shirt_number<=5 then 'starter' else 'bench' end,coalesce(p.shirt_number=1,false)
 from squad_memberships sm join players p on p.id=sm.player_id where sm.team_id in(a,b);
 perform pg_temp.must_fail(format('update matches set match_status=''live'' where id=%s',m1),'six to eight');
 update match_squads set lineup_role='starter' where match_id=m1 and player_id in(pa[6],pb[6]);
 update matches set match_status='live' where id=m1;
 perform pg_temp.must_fail(format('update squad_memberships set team_id=%s where player_id=%s and season_id=%s',b,pa[3],sid),'cannot transfer');
 delete from squad_memberships where player_id=pa[3] and season_id=sid;
 perform pg_temp.must_fail(format('insert into squad_memberships(player_id,team_id,season_id) values(%s,%s,%s)',pa[3],b,sid),'cannot transfer');
 insert into squad_memberships(player_id,team_id,season_id) values(pa[3],a,sid);
 perform pg_temp.must_fail(format('delete from match_squads where match_id=%s',m1),'lock at kickoff');
 insert into players(full_name,position) values('Rules late new player','forward') returning id into c;
 insert into squad_memberships(player_id,team_id,season_id) values(c,a,sid);
 insert into match_events(match_id,team_id,player_id,event_type,minute) values(m1,a,pa[2],'goal',5);
 insert into match_events(match_id,team_id,player_id,event_type,minute) values(m1,b,pb[2],'own_goal',6);
 if not exists(select 1 from matches where id=m1 and home_score=2 and away_score=0) then raise exception 'Goal ledger / own goal wrong'; end if;
 delete from match_events where match_id=m1 and event_type='own_goal';
 if (select home_score from matches where id=m1)<>1 then raise exception 'Goal delete did not recount'; end if;
end $$;
do $$ declare f rule_fixture; i integer; outgoing bigint; begin
 select * into f from rule_fixture;
 for i in 1..5 loop
  outgoing:=case when i=1 then f.pa[2] else f.pa[5+i] end;
  insert into match_events(match_id,team_id,player_id,incoming_player_id,event_type,minute)
   values(f.m1,f.a,outgoing,f.pa[6+i],'substitution',10+i);
 end loop;
 perform pg_temp.must_fail(format('insert into match_events(match_id,team_id,player_id,incoming_player_id,event_type,minute) values(%s,%s,%s,%s,''substitution'',20)',f.m1,f.a,f.pa[11],f.pa[12]),'five outfield');
 perform pg_temp.must_fail(format('insert into match_events(match_id,team_id,player_id,incoming_player_id,event_type,minute) values(%s,%s,%s,%s,''substitution'',20)',f.m1,f.a,f.pa[11],f.pa[2]),'no re-entry');
 insert into match_events(match_id,team_id,player_id,incoming_player_id,event_type,minute,is_goalkeeper_change)
  values(f.m1,f.a,f.pa[1],f.pa[13],'substitution',30,true);
 perform pg_temp.must_fail(format('insert into match_events(match_id,team_id,player_id,incoming_player_id,event_type,minute,is_goalkeeper_change) values(%s,%s,%s,%s,''substitution'',31,true)',f.m1,f.a,f.pa[13],f.pa[14]),'one goalkeeper');
 insert into match_events(match_id,team_id,player_id,event_type,minute) values(f.m1,f.b,f.pb[2],'goal',6);
 update matches set stage='final' where id=f.m1;
 perform pg_temp.must_fail(format('update matches set match_status=''completed'' where id=%s',f.m1),'requires direct penalties');
 update matches set match_status='completed',home_penalties=5,away_penalties=4 where id=f.m1;
 insert into match_squads(match_id,team_id,player_id,player_name,lineup_role,is_goalkeeper)
 select f.m2,sm.team_id,p.id,p.full_name,case when p.shirt_number<=8 then 'starter' else 'bench' end,coalesce(p.shirt_number=1,false)
 from squad_memberships sm join players p on p.id=sm.player_id where sm.team_id in(f.a,f.b);
 update matches set match_status='live' where id=f.m2;
 for i in 2..5 loop insert into match_events(match_id,team_id,player_id,event_type,minute) values(f.m2,f.a,f.pa[i],'red_card',10+i); end loop;
 if not exists(select 1 from matches where id=f.m2 and match_status='stopped' and result_kind='normal') then raise exception 'Below-five play must stop without automatic forfeit'; end if;
 update matches set result_kind='forfeit',forfeit_team_id=f.a,decision_note='Staff awards the match after reviewing the stoppage.',match_status='completed' where id=f.m2;
 if not exists(select 1 from matches where id=f.m2 and home_score=0 and away_score=3) then raise exception 'Separate forfeit result wrong'; end if;
end $$;
-- Club formation: registered, unique players save; duplicates and other clubs' players do not.
do $$ declare f rule_fixture; begin
 select * into f from rule_fixture;
 update teams set lineup=jsonb_build_object('formation','8v8','starters',jsonb_build_object('gk',f.pa[1],'fw',f.pa[2]),'bench',jsonb_build_array(f.pa[3])) where id=f.a;
 perform pg_temp.must_fail(format($q$update teams set lineup='{"formation":"8v8","starters":{"gk":%s,"fw":%s},"bench":[]}' where id=%s$q$,f.pa[1],f.pa[1],f.a),'at most once');
 perform pg_temp.must_fail(format($q$update teams set lineup='{"formation":"8v8","starters":{"gk":%s},"bench":[%s]}' where id=%s$q$,f.pa[1],f.pb[1],f.a),'at most once');
end $$;
set local role anon;
do $$ begin
 if not exists(select 1 from public.matches m join public.seasons s on s.id=m.season_id where s.slug='rule-regression') then
  raise exception 'Published tournament child-draft matches are hidden';
 end if;
end $$;
reset role;
rollback;
select 'registration, transfer, lineup, scoring, substitution, stoppage, forfeit and shootout regressions passed' as result;

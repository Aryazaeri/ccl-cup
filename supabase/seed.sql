-- Idempotent fixtures for an isolated local development project.
-- Clubs, entry squads, selected match lineups and goals use the production
-- contracts. Never use this file to populate an existing production project.
begin;
insert into public.cities(name,country_code) values('Antalya','TR') on conflict(name) do nothing;
insert into public.seasons(city_id,name,slug,full_name,year,city,season_type,starts_on,ends_on,status)
 select id,'Development Cup','development-cup','Antalya 2026 Development Cup',2026,'Antalya','league','2026-08-01','2026-10-31','published'
 from public.cities where name='Antalya' on conflict(slug) do nothing;
insert into public.venues(city_id,name,address) select id,'Development Ground','Antalya' from public.cities where name='Antalya' on conflict(city_id,name) do nothing;
do $$ declare sid bigint; item record; tid bigint; mid bigint; home bigint; away bigint; ground bigint; roster jsonb;
begin
 select id into sid from public.seasons where slug='development-cup';
 select id into ground from public.venues where name='Development Ground';
 for item in select * from (values('NOVA FC','nova-fc','#63e35b'),('MARMARA','marmara','#3f76ff'),('UNION','union','#f2c230'),('NORTHSIDE','northside','#8c9bad'),('ATLAS SK','atlas-sk','#d7dce2'),('BOSPHORUS','bosphorus','#d7dce2')) v(name,slug,color) loop
  if not exists(select 1 from public.teams where season_id=sid and slug=item.slug) then
   select jsonb_agg(jsonb_build_object('full_name',item.name||' Player '||i,'shirt_number',i,'position',case when i=1 then 'goalkeeper' when i<=4 then 'defender' when i<=7 then 'midfielder' else 'forward' end)) into roster from generate_series(1,8) i;
   tid:=public.create_season_entry(jsonb_build_object('season_id',sid,'name',item.name,'slug',item.slug,'primary_color',item.color), '{}',roster);
  end if;
 end loop;
 update public.seasons set team_count=6,league=jsonb_build_object('teamCount',6,'slots',(
  select jsonb_agg(jsonb_build_object('position',position,'teamId',id,'teamName',name)) from (
   select row_number() over(order by id) position,id,name from public.teams where season_id=sid
  ) entries)) where id=sid and league is null;
 select id into home from public.teams where season_id=sid and slug='nova-fc';
 select id into away from public.teams where season_id=sid and slug='atlas-sk';
 insert into public.matches(season_id,home_team_id,away_team_id,venue_id,stage,kickoff_at,fixture_key,publication_status)
 values(sid,home,away,ground,'group','2026-10-30 18:00+03','seed:nova-atlas','published') on conflict(season_id,fixture_key) do nothing;
 for item in select * from (values('marmara','bosphorus','seed:marmara-bosphorus',2,1),('union','northside','seed:union-northside',0,0)) v(home_slug,away_slug,key,hs,aws) loop
  if exists(select 1 from public.matches where season_id=sid and fixture_key=item.key) then continue; end if;
  select id into home from public.teams where season_id=sid and slug=item.home_slug;
  select id into away from public.teams where season_id=sid and slug=item.away_slug;
  insert into public.matches(season_id,home_team_id,away_team_id,venue_id,stage,kickoff_at,fixture_key,publication_status)
  values(sid,home,away,ground,'group','2026-10-26 18:00+03',item.key,'published') returning id into mid;
  insert into public.match_squads(match_id,team_id,player_id,player_name,shirt_number,lineup_role,is_goalkeeper)
   select mid,sm.team_id,p.id,p.full_name,p.shirt_number,'starter',p.position='goalkeeper'
   from public.squad_memberships sm join public.players p on p.id=sm.player_id where sm.team_id in(home,away);
  update public.matches set match_status='live' where id=mid;
  insert into public.match_events(match_id,team_id,player_id,event_type,minute)
   select mid,home,p.id,'goal',10+i from generate_series(1,item.hs) i
   join public.squad_memberships sm on sm.team_id=home join public.players p on p.id=sm.player_id and p.shirt_number=7;
  insert into public.match_events(match_id,team_id,player_id,event_type,minute)
   select mid,away,p.id,'goal',20+i from generate_series(1,item.aws) i
   join public.squad_memberships sm on sm.team_id=away join public.players p on p.id=sm.player_id and p.shirt_number=7;
  update public.matches set match_status='completed' where id=mid;
 end loop;
end $$;
insert into public.articles(season_id,title,slug,summary,category,status,published_at)
 select id,'Welcome to the Development Cup','development-welcome','Local demonstration content.','news','published',now()
 from public.seasons where slug='development-cup' on conflict(slug) do nothing;
commit;

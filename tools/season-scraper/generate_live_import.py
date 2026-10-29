#!/usr/bin/env python3
"""Generate owner-run, transactional SQL for reviewed ICC source payloads.

No network or database access. The generated script defaults to ROLLBACK.
It preserves legacy scores/rosters and never disables foreign keys or RLS.
"""
import argparse
import json
from pathlib import Path
from urllib.parse import urljoin

from bs4 import BeautifulSoup
from build_import import foot, number, position

KEEPER = 1793259361662
TRIGGERS = {
    'teams': ['teams_min_squad'],
    'matches': ['matches_rules'],
    'match_squads': ['match_squads_lineup_guard'],
    'match_events': ['match_events_clock', 'match_events_exchanges', 'match_events_registration_guard', 'match_events_sync_score'],
}


def generate(export, review, output):
    bundle = json.loads((review / 'replacement.json').read_text())
    assert bundle['source'] == 'https://arsiv.cclcup.com/internationalcorporatecup/'
    players = []
    for p in bundle['source_records']['oyuncu']:
        a = p['details']
        players.append({'source_id': 'icc:' + p['id'], 'full_name': p['name'],
                        'position': position(a.get('Mevki')), 'strong_foot': foot(a.get('Güçlü Ayak')),
                        'height_cm': number(a.get('Boy', ''), 120, 230),
                        'weight_kg': number(a.get('Kilo', ''), 35, 180),
                        'photo_url': None if p['image_is_placeholder'] else p['image_url']})
    if any(not p['full_name'] for p in players):
        raise ValueError('Review unnamed profiles before generating import SQL')
    articles = []
    articles_by_url = {p['source_url']: p for p in bundle['source_records']['h']}
    for file in (export / 'cache').glob('*.json'):
        page = json.loads(file.read_text())
        record = articles_by_url.get(page['url'])
        if not record:
            continue
        soup = BeautifulSoup(page['html'], 'html.parser')
        title = soup.select_one('h3.sub-title')
        body = soup.select_one('.content-in .content-text')
        if title is None or body is None:
            raise ValueError('Article markup requires review: ' + page['url'])
        cover = body.select_one('img[src]')
        for node in body.select('script,style,.addthis_inline_share_toolbox_bac8,.content-list,.clearfix'):
            node.decompose()
        # Keep original external album/video URLs and make relative archive
        # image/link references absolute. No publication dates are invented.
        for node in body.select('[href], [src]'):
            for attr in ('href', 'src'):
                if node.get(attr):
                    node[attr] = urljoin(page['url'], node[attr])
        articles.append({'source_id': 'icc:' + record['id'], 'title': title.get_text(' ', strip=True),
                         'body': str(body), 'source_url': page['url'],
                         'cover_image_url': urljoin(page['url'], cover['src']) if cover else None})
    # A cache may contain the same response URL under multiple scopes.
    articles = list({a['source_id']: a for a in articles}.values())
    assert len(articles) == len(articles_by_url)
    data = {'seasons': bundle['seasons'], 'players': players, 'articles': articles}
    unique_lineups = sum(len({tuple(row) for row in m['lineups']}) for s in bundle['seasons'] for m in s['matches'])
    payload = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    if '$iccdata$' in payload:
        raise ValueError('Unexpected SQL delimiter in source data')
    disable = '\n'.join(f'alter table public.{table} disable trigger {name};' for table, names in TRIGGERS.items() for name in names)
    enable = '\n'.join(f'alter table public.{table} enable trigger {name};' for table, names in TRIGGERS.items() for name in names)
    sql = f"""-- Reviewed ICC archive import. Owner only. Default: dry-run rollback.
begin;
set local lock_timeout='5s';
set local statement_timeout='90s';
lock table public.seasons,public.teams,public.players,public.clubs,public.matches,public.match_events,public.match_squads,public.squad_memberships,public.articles,import.source_map in share row exclusive mode;
do $guard$ begin
 if (select count(*) from public.seasons)<>1 or not exists(select 1 from public.seasons where id={KEEPER} and name='ICC 2026' and city='Antalya') then raise exception 'Expected protected ICC 2026 only'; end if;
 if exists(select 1 from import.source_map where source_id like 'icc:%') then raise exception 'ICC already staged'; end if;
end $guard$;
-- Historical results and incomplete archived lineups cannot pass new-match
-- creation rules. Suspend only these exact triggers while holding write locks;
-- restore them before commit. Other triggers, all FKs/checks, and RLS stay on.
{disable}
do $import$
declare data jsonb := $iccdata${payload}$iccdata$::jsonb;
 s jsonb; c jsonb; p jsonb; m jsonb; e jsonb; l jsonb; g jsonb; a jsonb;
 sid bigint; cid bigint; tid bigint; pid bigint; mid bigint; gid bigint; aid bigint;
 player_of jsonb := '{{}}'; team_of jsonb; group_of jsonb; layout jsonb; slots jsonb;
 n int; index_ int; code text;
begin
 for p in select * from jsonb_array_elements(data->'players') loop
  insert into public.players(full_name,position,strong_foot,height_cm,weight_kg,photo_url,nationality,is_published)
  values(p->>'full_name',p->>'position',p->>'strong_foot',(p->>'height_cm')::smallint,(p->>'weight_kg')::smallint,p->>'photo_url',null,true) returning id into pid;
  insert into import.source_map(kind,source_id,app_id) values('player',p->>'source_id',pid);
  player_of:=player_of||jsonb_build_object(p->>'source_id',pid);
 end loop;
 for s in select * from jsonb_array_elements(data->'seasons') loop
  insert into public.seasons(name,slug,full_name,city,year,season_type,group_count,team_count,starts_on,ends_on,status,is_current,started_at)
  values('ICC '||(s->>'year'),s->>'slug','Antalya '||(s->>'year')||' International Corporate Cup',s->>'city',(s->>'year')::smallint,s->>'season_type',jsonb_array_length(s->'groups'),jsonb_array_length(s->'clubs'),(s->>'starts_on')::date,(s->>'ends_on')::date,'draft',false,(s->>'starts_on')::date::timestamp at time zone 'Europe/Istanbul') returning id into sid;
  insert into import.source_map(kind,source_id,app_id) values('season',s->>'source_id',sid);
  team_of:='{{}}'; group_of:='{{}}'; layout:='[]';
  for c in select * from jsonb_array_elements(s->'clubs') loop
   select app_id into cid from import.source_map where kind='club' and source_id=c->>'source_id';
   if cid is null then
    select id into cid from public.clubs where lower(trim(name))=lower(trim(c->>'name'));
    if cid is null then
     insert into public.clubs(name,profile) values(c->>'name',jsonb_build_object('name',c->>'name','logoUrl',c->>'logo_url','color','#63e35b')) returning id into cid;
    end if;
    insert into import.source_map(kind,source_id,app_id) values('club',c->>'source_id',cid);
   end if;
   insert into public.teams(season_id,club_id,name,slug,short_name,country_code,country_name,primary_color,logo_url,tournament_format,group_name,is_published)
   values(sid,cid,c->>'name',(s->>'slug')||'-'||(c->>'slug'),left(c->>'name',3),null,null,'#63e35b',c->>'logo_url','Champions Cup',c->>'group_name',true) returning id into tid;
   insert into import.source_map(kind,source_id,app_id) values('team',(s->>'source_id')||':'||(c->>'source_id'),tid);
   team_of:=team_of||jsonb_build_object(c->>'source_id',tid);
  end loop;
  for c in select * from jsonb_array_elements(s->'squads') loop
   insert into public.squad_memberships(player_id,team_id,season_id)
   select (player_of->>x)::bigint,(team_of->>(c->>'club'))::bigint,sid from jsonb_array_elements_text(c->'players') x;
  end loop;
  index_:=0;
  for g in select * from jsonb_array_elements(s->'groups') loop
   index_:=index_+1;
   insert into public.tournament_groups(season_id,name,display_order) values(sid,g->>'name',index_) returning id into gid;
   group_of:=group_of||jsonb_build_object(g->>'name',gid);
   select jsonb_agg(jsonb_build_object('position',ord,'teamId',(team_of->>club)::bigint,'teamName',(select name from public.teams where id=(team_of->>club)::bigint),'teamLogo',(select logo_url from public.teams where id=(team_of->>club)::bigint),'teamColor','#63e35b') order by ord)
   into slots from jsonb_array_elements_text(g->'clubs') with ordinality as x(club,ord);
   layout:=layout||jsonb_build_array(jsonb_build_object('id','icc_group_'||index_,'name',g->>'name','slots',slots));
   insert into public.team_group_memberships(team_id,group_id) select (team_of->>x)::bigint,gid from jsonb_array_elements_text(g->'clubs') x;
  end loop;
  update public.seasons set group_league=jsonb_build_object('groupCount',jsonb_array_length(layout),'groups',layout) where id=sid;
  for m in select * from jsonb_array_elements(s->'matches') loop
   insert into public.matches(season_id,group_id,home_team_id,away_team_id,stage,week,kickoff_at,match_status,publication_status,home_score,away_score,score_source,lineup_source,started_at,completed_at,decision_note)
   values(sid,(group_of->>(m->>'group'))::bigint,(team_of->>(m->>'home'))::bigint,(team_of->>(m->>'away'))::bigint,m->>'stage',(m->>'week')::smallint,(m->>'kickoff_at')::timestamptz,m->>'status','published',(m->>'home_score')::smallint,(m->>'away_score')::smallint,'legacy','legacy',case when m->>'status'='completed' then (m->>'kickoff_at')::timestamptz end,case when m->>'status'='completed' then (m->>'kickoff_at')::timestamptz end,'Historical archive result. Displayed scores and timeline may include shootouts; reconciliation pending. Source: '||(m->>'source_url')) returning id into mid;
   insert into import.source_map(kind,source_id,app_id) values('match',m->>'source_id',mid);
   for l in select * from jsonb_array_elements(m->'lineups') loop
    pid:=(player_of->>(l->>1))::bigint;
    insert into public.match_squads(match_id,team_id,player_id,player_name,lineup_role)
    select mid,(team_of->>(l->>0))::bigint,pid,full_name,'bench' from public.players where id=pid on conflict do nothing;
   end loop;
   for e in select * from jsonb_array_elements(m->'events') loop
    pid:=(player_of->>(e->>'player'))::bigint;
    insert into public.match_events(match_id,team_id,player_id,player_name,event_type,minute,extra_minute,notes)
    values(mid,(team_of->>(e->>'club'))::bigint,pid,coalesce((select full_name from public.players where id=pid),e->>'player_name'),e->>'type',(e->>'minute')::smallint,(e->>'extra')::smallint,e->>'notes');
   end loop;
  end loop;
  insert into import.source_standings select s->>'source_id',r->>'group',r->>'club',(r->>'played')::int,(r->>'won')::int,(r->>'drawn')::int,(r->>'lost')::int,(r->>'goals_for')::int,(r->>'goals_against')::int,(r->>'points')::int from jsonb_array_elements(s->'standings') r;
 end loop;
 -- Source stories have no trustworthy publication dates or season ownership.
 -- Preserve their bodies, album links and cover images as staff-review drafts.
 for a in select * from jsonb_array_elements(data->'articles') loop
  insert into public.articles(title,slug,body,summary,cover_image_url,status,is_headline)
  values(a->>'title','icc-source-news-'||split_part(a->>'source_id',':',2),(a->>'body')||'<p>Archive source: '||(a->>'source_url')||'</p>','Imported archive story; publication date and season require review.',a->>'cover_image_url','draft',false) returning id into aid;
  insert into import.source_map(kind,source_id,app_id) values('article',a->>'source_id',aid);
 end loop;
end $import$;
{enable}
set constraints all immediate;
do $verify$ begin
 if (select count(*) from public.matches)<>63 or (select count(*) from public.teams)<>26 then raise exception 'Unexpected imported fixture/entry counts'; end if;
 if (select count(*) from public.match_events)<>297 or (select count(*) from public.match_squads)<>{unique_lineups} then raise exception 'Unexpected imported events/lineups'; end if;
 if (select count(*) from import.source_map where kind='player' and source_id like 'icc:%')<>188 then raise exception 'Missing player profiles'; end if;
 if (select count(*) from public.seasons)<>4 then raise exception 'Unexpected seasons after staging'; end if;
 if exists(select 1 from pg_trigger where not tgisinternal and tgrelid in('public.teams'::regclass,'public.matches'::regclass,'public.match_events'::regclass,'public.match_squads'::regclass) and tgenabled<>'O') then raise exception 'Trigger restoration failed'; end if;
 if not exists(select 1 from public.articles where id=11 and season_id={KEEPER} and title='DRAW CEREMONY' and status='published') then raise exception 'Protected current story changed'; end if;
end $verify$;
select jsonb_build_object('seasons',(select jsonb_agg(jsonb_build_object('id',id,'name',name,'status',status)) from public.seasons),'teams',(select count(*) from public.teams),'matches',(select count(*) from public.matches),'events',(select count(*) from public.match_events),'lineups',(select count(*) from public.match_squads),'draft_news',22) as staged_import;
rollback;
"""
    output.write_text(sql)
    print(json.dumps({'sql': str(output), 'bytes': len(sql.encode()), 'profiles': len(players), 'draft_articles': len(articles), 'commit': False}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('export', type=Path)
    parser.add_argument('review', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    generate(args.export, args.review, args.output)

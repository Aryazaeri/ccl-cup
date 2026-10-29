"""Generate the ICC archive backfill migration from the reviewed export.

Fills what the 29 Oct ICC import left empty: player attributes, starting
lineups/goalkeepers, full-match and highlight videos, club rosters, clean
news bodies and the two archive announcements. Offline; no database access.

    python3 generate_icc_backfill.py EXPORT_DIR IMPORTED_MAP OUT_SQL
"""
import csv, html, json, re, sys
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urljoin

from bs4 import BeautifulSoup
from build_import import foot, number, position

SEASONS = (45, 46, 47)  # live ICC 2022–2024
VIDEO = re.compile(r'youtube\.com/embed/([^?&/"]*)')
LABELS = {'Maçı İzle': 'full', 'HD Özet': 'highlight'}
NOTE = 'Imported archive story; publication date and season require review.'


def q(value):
    if value is None:
        return 'null'
    if isinstance(value, bool):
        return 'true' if value else 'false'
    if isinstance(value, int):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def values(rows):
    return ',\n'.join('(' + ','.join(q(v) for v in row) + ')' for row in rows)


def unescape(text):
    """The archive double-escapes some entities (&amp;amp;)."""
    while (clean := html.unescape(text)) != text:
        text = clean
    return text


def plain_text(node, base):
    """Archive article HTML -> blank-line separated paragraphs (the site renders plain text)."""
    for hidden in node.select('[style*="display:none"], script, style, img'):
        hidden.decompose()
    for br in node.select('br'):
        br.replace_with('\n')
    for a in node.select('a[href]'):
        href, label = urljoin(base, a['href']), a.get_text(' ', strip=True)
        a.replace_with(f'{label} ({href})' if label and href not in label else href)
    for block in node.find_all(['p', 'div', 'li', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']):
        block.append('\n')  # line breaks only between blocks; inline text stays joined
    lines = (unescape(line).strip() for line in node.get_text().split('\n'))
    return '\n\n'.join(line for line in lines if line)


def generate(export, mapping):
    export = Path(export)
    maps = defaultdict(dict)
    for item in json.loads(Path(mapping).read_text(encoding='utf-8'))['maps']:
        maps[item['kind']][item['source_id'].removeprefix('icc:')] = item['app_id']
    pages = {}
    for path in (export / 'cache').glob('*.json'):
        page = json.loads(path.read_text(encoding='utf-8'))
        pages.setdefault(page.get('url'), page)
    fixtures = {r['match_id']: r for f in (export / 'seasons').glob('*/fixtures.csv')
                for r in csv.DictReader(f.open(encoding='utf-8-sig'))}
    details = lambda kind: [json.loads(p.read_text(encoding='utf-8')) for p in sorted((export / 'details' / kind).glob('*.json'))]
    matches, profiles, clubs = details('mac'), details('oyuncu'), details('takim')

    players = []
    for p in profiles:
        a = p['details']
        row = (maps['player'][p['id']], p['name'], position(a.get('Mevki')), foot(a.get('Güçlü Ayak')),
               number(a.get('Boy', ''), 120, 230), number(a.get('Kilo', ''), 35, 180))
        if any(v is not None for v in row[2:]):
            players.append(row)

    keepers = defaultdict(bool)
    for m in matches:
        for slot in m['lineup']:
            if slot.get('player_id'):
                key = (maps['match'][m['id']], maps['player'][slot['player_id']])
                keepers[key] |= 'kaleci' in (slot.get('position_raw') or '').casefold()
    lineups = [(mid, pid, gk) for (mid, pid), gk in sorted(keepers.items())]

    videos = []
    for m in matches:
        soup = BeautifulSoup(pages[m['source_url']]['html'], 'html.parser')
        for a in soup.find_all('a', href=VIDEO):
            label = (a.find_previous(string=lambda t: t and t.strip()) or '').strip()
            videos.append({'match': m['id'], 'kind': LABELS.get(label), 'id': VIDEO.search(a['href'])[1]})
    used = Counter(v['id'] for v in videos)
    # Malformed IDs and IDs the archive attached to two different matches are left for staff review.
    skipped = [v for v in videos if not re.fullmatch(r'[\w-]{11}', v['id']) or used[v['id']] > 1 or not v['kind']]
    good = [v for v in videos if v not in skipped]
    full = [(maps['match'][v['match']], f"https://www.youtube.com/watch?v={v['id']}") for v in good if v['kind'] == 'full']
    highlights = []
    for v in good:
        if v['kind'] == 'highlight':
            f = fixtures[v['match']]
            highlights.append((maps['match'][v['match']], f"{f['home_name']} – {f['away_name']} highlights",
                               f"https://www.youtube.com/watch?v={v['id']}", f"https://i.ytimg.com/vi/{v['id']}/hqdefault.jpg"))
    assert len({mid for mid, _ in full}) == len(full), 'one full-match video per match'

    roster = sorted({(maps['club'][c['id']], maps['player'][r['player_id']]) for c in clubs for r in c.get('roster') or []})

    articles = []
    for source_id, app_id in maps['article'].items():
        record = json.loads((export / 'details' / 'h' / f'{source_id}.json').read_text(encoding='utf-8'))
        soup = BeautifulSoup(pages[record['source_url']]['html'], 'html.parser')
        title, body = soup.select_one('h3.sub-title'), soup.select_one('.content-in .content-text')
        for node in body.select('.addthis_inline_share_toolbox_bac8,.content-list,.clearfix'):
            node.decompose()
        text = plain_text(body, record['source_url'])
        articles.append((app_id, unescape(title.get_text(' ', strip=True)) if title else '',
                         (text + '\n\n' if text else '') + 'Archive source: ' + record['source_url']))

    announcements = []
    for record in details('duyuru'):
        soup = BeautifulSoup(pages[record['source_url']]['html'], 'html.parser')
        title, body = soup.select_one('h3.sub-title'), soup.select_one('.content-in .content-text')
        assert title and body, 'announcement markup requires review: ' + record['source_url']
        announcements.append((unescape(title.get_text(' ', strip=True)), f"icc-source-announcement-{record['id']}",
                              plain_text(body, record['source_url']) + '\n\nArchive source: ' + record['source_url']))

    icc = ','.join(map(str, SEASONS))
    sql = f"""-- ICC archive backfill. Generated by tools/season-scraper/generate_icc_backfill.py from the
-- 29 Oct 2026 export of arsiv.cclcup.com/internationalcorporatecup and the import's source map.
-- Fills only what the ICC 2022–2024 import left empty; never overwrites staff edits, and every
-- statement is a no-op where those imported rows do not exist (fresh/local databases).
-- Not imported (source gaps, see tools/season-scraper/README.md): {len(skipped)} malformed or
-- duplicated video links, the 2024 lineups/events, and the old rules pages (live rules are current).

-- 1. Player attributes from archive profiles (both-footed "Çift Ayak" was dropped by the import).
update public.players p set
  position=coalesce(p.position,v.position), strong_foot=coalesce(p.strong_foot,v.strong_foot),
  height_cm=coalesce(p.height_cm,v.height_cm), weight_kg=coalesce(p.weight_kg,v.weight_kg), updated_at=now()
from (values
{values(players)}
) v(id,full_name,position,strong_foot,height_cm,weight_kg)
where p.id=v.id and p.full_name=v.full_name and (
  (p.position is null and v.position is not null) or (p.strong_foot is null and v.strong_foot is not null)
  or (p.height_cm is null and v.height_cm is not null) or (p.weight_kg is null and v.weight_kg is not null));

-- 2. Archive lineups are the six-a-side starting formations, one "Kaleci" (goalkeeper) per side.
-- The import stored every slot as 'bench'. Lineups lock at kickoff, so the guard is paused here only.
alter table public.match_squads disable trigger match_squads_lineup_guard;
update public.match_squads s set lineup_role='starter', is_goalkeeper=v.is_goalkeeper
from (values
{values(lineups)}
) v(match_id,player_id,is_goalkeeper)
join public.matches m on m.id=v.match_id and m.season_id in ({icc})
where s.match_id=v.match_id and s.player_id=v.player_id and s.lineup_role='bench' and not s.is_goalkeeper;
alter table public.match_squads enable trigger match_squads_lineup_guard;

-- 3. Full-match recordings ("Maçı İzle") become each match page's video.
update public.matches m set stream_url=v.url, updated_at=now()
from (values
{values(full)}
) v(id,url)
where m.id=v.id and m.season_id in ({icc}) and m.stream_url is null;

-- 4. Highlights ("HD Özet") for each season's Highlights strip.
insert into public.media_assets(season_id,match_id,kind,title,external_url,thumbnail_url,is_published)
select m.season_id,m.id,'highlight',v.title,v.url,v.thumbnail,true
from (values
{values(highlights)}
) v(match_id,title,url,thumbnail)
join public.matches m on m.id=v.match_id and m.season_id in ({icc})
where not exists(select 1 from public.media_assets a where a.match_id=m.id and a.external_url=v.url);

-- 5. Club registry rosters (staff-only) from archive club pages.
insert into public.club_roster(club_id,player_id)
select c.id,p.id from (values
{values(roster)}
) v(club_id,player_id)
join public.clubs c on c.id=v.club_id join public.players p on p.id=v.player_id
on conflict do nothing;

-- 6. Imported news drafts stored raw archive HTML; the site renders plain paragraphs.
-- Only bodies still exactly as imported are replaced. Double-escaped titles are repaired.
update public.articles a set title=case when v.title<>'' then v.title else a.title end, body=v.body, updated_at=now()
from (values
{values(articles)}
) v(id,title,body)
where a.id=v.id and a.status='draft' and a.body like '<div class="content-text">%';

-- 7. The two archive announcements, as drafts like the news (no reliable dates/season).
insert into public.articles(title,slug,body,summary,category,status,is_headline)
select v.title,v.slug,v.body,{q(NOTE)},'announcement','draft',false
from (values
{values(announcements)}
) v(title,slug,body)
where exists(select 1 from public.seasons where id in ({icc}))
  and not exists(select 1 from public.articles a where a.slug=v.slug);

do $verify$ begin
 if exists(select 1 from pg_trigger where tgrelid='public.match_squads'::regclass and not tgisinternal and tgenabled<>'O') then
   raise exception 'match_squads trigger not restored';
 end if;
 if exists(select 1 from public.seasons where id in ({icc})) then
   if (select count(*) from public.media_assets a join public.matches m on m.id=a.match_id
       where m.season_id in ({icc}) and a.kind='highlight') < {len(highlights)} then raise exception 'highlights missing'; end if;
   if (select count(*) from public.matches where season_id in ({icc}) and stream_url is not null) < {len(full)} then
     raise exception 'match videos missing'; end if;
   if exists(select 1 from public.match_squads s join public.matches m on m.id=s.match_id
       where m.season_id in ({icc}) group by s.match_id,s.team_id
       having count(*) filter(where s.is_goalkeeper)<>1) then raise exception 'each imported lineup needs one goalkeeper'; end if;
 end if;
end $verify$;
"""
    return sql, {'players': len(players), 'lineups': len(lineups), 'goalkeepers': sum(gk for *_, gk in lineups),
                 'full_videos': len(full), 'highlights': len(highlights), 'skipped_videos': skipped,
                 'roster': len(roster), 'articles': len(articles), 'announcements': len(announcements)}


if __name__ == '__main__':
    sql, summary = generate(sys.argv[1], sys.argv[2])
    Path(sys.argv[3]).write_text(sql, encoding='utf-8')
    print(json.dumps(summary, ensure_ascii=False, indent=1))

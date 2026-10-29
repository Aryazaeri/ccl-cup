#!/usr/bin/env python3
"""Read-only, resumable CCL archive exporter. No database credentials or imports."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import time
from collections import deque
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from datetime import datetime, timezone
from http.cookiejar import CookieJar
from pathlib import Path
from threading import Lock, local
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, quote, urlencode, urljoin, urlsplit, urlunsplit
from urllib.request import HTTPCookieProcessor, HTTPRedirectHandler, Request, build_opener
from urllib.robotparser import RobotFileParser

from bs4 import BeautifulSoup

BASE = 'https://arsiv.cclcup.com/'
AGENT = 'CCLSeasonArchive/1.0 (public historical export; no login)'
KINDS = ('mac', 'h', 'takim', 'oyuncu', 'galeri', 'hafta', 'duyuru', 'f', 'ccl', 'fifex')
ENTITY = re.compile(r'^/(' + '|'.join(KINDS) + r')-(\d+)(?:-[^/]*)?\.html$')
INDEXES = {'anasayfa', 'takimlar', 'tum-haberler', 'hd-ozetler', 'fotograflar',
           'basintoplantilari', 'finale-dogru', 'maclar', 'panorama',
           'istatistikler', 'ceza-tahtasi', 'etkinlik-alani', 'duyurular'}
MONTHS = {'ocak': 1, 'şubat': 2, 'mart': 3, 'nisan': 4, 'mayıs': 5,
          'haziran': 6, 'temmuz': 7, 'ağustos': 8, 'eylül': 9,
          'ekim': 10, 'kasım': 11, 'aralık': 12}


def now():
    return datetime.now(timezone.utc).isoformat()


def text(node):
    return ' '.join(node.get_text(' ', strip=True).split()) if node else ''


def soup(html):
    return BeautifulSoup(html, 'html.parser')


def configure_source(source):
    """Keep independent archive installations and their IDs isolated."""
    global BASE, ENTITY
    if source not in ('https://arsiv.cclcup.com/', 'https://arsiv.cclcup.com/internationalcorporatecup/'):
        raise ValueError('Unsupported archive source')
    BASE = source
    ENTITY = re.compile('^' + re.escape(urlsplit(BASE).path) + '(' + '|'.join(KINDS) + r')-(\d+)(?:-[^/]*)?\.html$')


def route_of(url):
    path = urlsplit(url).path
    prefix = urlsplit(BASE).path
    return path[len(prefix):].strip('/') if path.startswith(prefix) else None


def canonical(raw, current=None):
    """Legacy entity links moved domains. Rewrite only their known archive routes."""
    if not raw or raw.startswith(('#', 'javascript:', 'mailto:', 'tel:')):
        return None
    p = urlsplit(urljoin(current or BASE, raw))
    if p.scheme not in ('http', 'https'):
        return None
    if p.hostname in ('cclcup.com', 'www.cclcup.com', 'fifexcup.com', 'www.fifexcup.com'):
        if not ENTITY.match(p.path):
            return None
    elif p.hostname != 'arsiv.cclcup.com' or route_of(p.geturl()) is None:
        return None
    query = [(k, v) for k, v in parse_qsl(p.query) if k in ('sayfa', 'kat', 'takim')]
    return urlunsplit(('https', 'arsiv.cclcup.com', p.path or '/', urlencode(sorted(query)), ''))


def entity_id(url, kind=None):
    m = ENTITY.match(urlsplit(url).path) if url else None
    return m.group(2) if m and (kind is None or kind == m.group(1)) else None


def date_value(value):
    match = re.search(r'(\d{1,2})\s*(' + '|'.join(MONTHS) + r')\s*(\d{4})\s*(?:/\s*)?(\d{2}:\d{2})?', value, re.I)
    if not match:
        return None
    day, month, year, clock = match.groups()
    try:
        # The archive supplies local display times without a timezone.
        return datetime(int(year), MONTHS[month.lower()], int(day)).strftime('%Y-%m-%d') + (f'T{clock}:00' if clock else '')
    except ValueError:
        return None


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    tmp.replace(path)


def write_csv(path, rows, fields):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', encoding='utf-8-sig', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction='ignore')
        writer.writeheader()
        for row in rows:
            writer.writerow({k: json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else v for k, v in row.items()})


class ArchiveRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if urlsplit(newurl).hostname != 'arsiv.cclcup.com':
            raise ValueError(f'Archive redirect left source host: {newurl}')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class PageLimit(Exception):
    pass


class Client:
    def __init__(self, output, delay=.75, max_pages=None, offline=False, timeout=15, attempts=2):
        self.output, self.delay, self.max_pages, self.offline = output, delay, max_pages, offline
        self.requests = 0
        self.timeout, self.attempts = timeout, attempts
        self.last_request = 0.0
        self.request_lock = Lock()
        self.worker_state = local()
        self.robots = None
        self.reset_session()

    def reset_session(self):
        self.opener = build_opener(ArchiveRedirects(), HTTPCookieProcessor(CookieJar()))

    def network(self, url, data=None, bypass_robots=False, opener=None):
        if self.offline:
            raise RuntimeError(f'Not cached (offline): {url}')
        if not bypass_robots and self.robots and not self.robots.can_fetch(AGENT, url):
            raise RuntimeError(f'robots.txt disallows: {url}')
        for attempt in range(self.attempts):
            with self.request_lock:
                if self.max_pages is not None and self.requests >= self.max_pages:
                    raise PageLimit(f'Request limit {self.max_pages} reached; resume without --max-pages')
                time.sleep(max(0, self.delay - (time.monotonic() - self.last_request)))
                self.requests += 1
                self.last_request = time.monotonic()
            req = Request(quote(url, safe=':/?=&%'), data=urlencode(data).encode() if data is not None else None,
                          headers={'User-Agent': AGENT, 'Accept': 'text/html'})
            try:
                with (opener or self.opener).open(req, timeout=self.timeout) as response:
                    raw = response.read(12_000_001)
                    if len(raw) > 12_000_000:
                        raise ValueError('HTML exceeds 12 MB limit')
                    charset = response.headers.get_content_charset() or 'utf-8'
                    html = raw.decode(charset, errors='replace')
                    return {'url': url, 'final_url': response.url, 'fetched_at': now(),
                            'status': response.status, 'html': html, 'sha256': hashlib.sha256(raw).hexdigest()}
            except HTTPError as error:
                if error.code not in (429, 500, 502, 503, 504) or attempt == self.attempts - 1:
                    raise
                retry = error.headers.get('Retry-After', '')
                time.sleep(min(60, max(2 ** (attempt + 1), int(retry) if retry.isdigit() else 0)))
            except (URLError, TimeoutError):
                if attempt == self.attempts - 1:
                    raise
                time.sleep(2 ** (attempt + 1))

    def check_robots(self):
        path = self.output / 'robots-check.json'
        if self.offline:
            result = json.loads(path.read_text(encoding='utf-8'))
        else:
            try:
                result = self.network('https://arsiv.cclcup.com/robots.txt', bypass_robots=True)
                # Some hosts serve a 404 HTML page with 200 status.
                if '<html' in result['html'].lower():
                    result = {'status': 404, 'note': 'No parseable robots file (HTML response)', 'html': '', 'checked_at': now()}
            except HTTPError as error:
                if error.code not in (404, 410):
                    raise
                result = {'status': error.code, 'html': '', 'checked_at': now()}
            write_json(path, result)
        self.robots = RobotFileParser()
        self.robots.parse(result.get('html', '').splitlines())
        crawl_delay = self.robots.crawl_delay(AGENT)
        if crawl_delay:
            self.delay = max(self.delay, crawl_delay)

    def fetch(self, url, scope, fresh=False, data=None, opener=None):
        key = hashlib.sha256((str(scope) + '\n' + url + '\n' + json.dumps(data, sort_keys=True)).encode()).hexdigest()
        path = self.output / 'cache' / f'{key}.json'
        if path.exists() and (not fresh or self.offline):
            return json.loads(path.read_text(encoding='utf-8'))
        result = self.network(url, data, opener=opener)
        if route_of(url) is not None and route_of(result.get('final_url', url)) is None:
            raise ValueError('Response left the selected archive installation')
        write_json(path, result)
        return result

    def select(self, season):
        # Never rely on cached selectors to establish the HTTP session cookie.
        self.reset_session()
        self.fetch(BASE + 'anasayfa', 'city-' + season['city_id'], fresh=True,
                   data={'sehir': season['city_id'], 'atama': '1'})
        selected = self.fetch(season['url'], season['id'], fresh=True)
        label = text(soup(selected['html']).select_one('li.dropdown.active > a'))
        special = any(word in season['name'].casefold() and word in label.casefold() for word in ('türkiye', 'avrupa'))
        if not label or (not special and season['city'].casefold() not in label.casefold()):
            raise ValueError(f'Season selector did not establish {season["city"]}: {label!r}')
        self.selected_season, self.selected_label = season, label
        return selected, label

    def detail_session(self):
        if self.offline:
            return self.opener
        opener = getattr(self.worker_state, 'opener', None)
        if opener is None:
            # Give each worker its own verified anonymous session so a slow
            # request cannot hold a PHP session lock shared by all workers.
            opener = build_opener(ArchiveRedirects(), HTTPCookieProcessor(CookieJar()))
            season = self.selected_season
            self.network(BASE + 'anasayfa', data={'sehir': season['city_id'], 'atama': '1'}, opener=opener)
            selected = self.network(season['url'], opener=opener)
            label = text(soup(selected['html']).select_one('li.dropdown.active > a'))
            if label != self.selected_label:
                raise ValueError(f'Worker season context mismatch: {label!r}')
            self.worker_state.opener = opener
        return opener


def season_links(doc, city_id, city):
    result = {}
    for a in doc.select('a[href]'):
        absolute = urljoin(BASE, a['href'])
        p = urlsplit(absolute)
        params = dict(parse_qsl(p.query))
        if p.hostname == 'arsiv.cclcup.com' and route_of(absolute) == 'anasayfa' and params.get('sezon', '').isdigit():
            sid = params['sezon']
            result[sid] = {'id': sid, 'name': text(a), 'city_id': city_id, 'city': city,
                           'url': BASE + 'anasayfa?sezon=' + sid}
    return list(result.values())


def discover(client):
    root = soup(client.fetch(BASE, 'discovery', fresh=True)['html'])
    cities = [(o.get('value'), text(o)) for o in root.select('select[name="sehir"] option[value]') if o.get('value', '').isdigit()]
    if not cities:
        raise ValueError('Archive city selector missing; discovery requires review')
    seasons = {}
    for city_id, city in cities:
        client.reset_session()
        doc = soup(client.fetch(BASE + 'anasayfa', 'discover-city-' + city_id, fresh=True,
                                data={'sehir': city_id, 'atama': '1'})['html'])
        for season in season_links(doc, city_id, city):
            # Türkiye Finalleri is linked by both cities; retain discovery evidence.
            if season['id'] not in seasons:
                season['discovered_in_cities'] = [city]
                seasons[season['id']] = season
            elif city not in seasons[season['id']]['discovered_in_cities']:
                seasons[season['id']]['discovered_in_cities'].append(city)
    if not seasons:
        raise ValueError('No archive seasons discovered')
    return sorted(seasons.values(), key=lambda x: int(x['id']))


def content(doc):
    # Navigation/footer contains season-changing links and newsletter forms.
    root = doc.select_one('.stage') or doc.body or doc
    for node in root.select('script,style,header,footer,nav'):
        node.decompose()
    for form in root.select('form'):
        if not form.select('option[value^="istatistikler?"]'):
            form.decompose()
    return root


def links_from(root, url):
    result = {}
    for node in root.select('a[href], option[value], [data-href]'):
        raw = node.get('href') or node.get('data-href') or node.get('value')
        target = canonical(raw, url)
        if target:
            item = {'url': target, 'label': text(node), 'original_url': urljoin(url, raw)}
            if target not in result or (item['label'] and not result[target]['label']):
                result[target] = item
    return list(result.values())


def tables_from(root, url):
    result = []
    for table in root.select('table'):
        # Outer fixture layout tables contain nested tables: only direct cell rows.
        rows = []
        for row in table.select('tr'):
            if row.find_parent('table') != table:
                continue
            cells = row.find_all(['td', 'th'], recursive=False)
            if cells:
                rows.append({'cells': [text(c) for c in cells], 'links': links_from(row, url),
                             'annotations': [n.get('title') for n in row.select('[title]')]})
        if rows:
            context = table.find_parent(class_='itab-in')
            result.append({'context': text(context.select_one('h6')) if context else '', 'rows': rows})
    return result


def page_record(response, scope, doc=None):
    doc = doc if doc is not None else soup(response['html'])
    root = content(doc)
    images = {}
    for node in root.select('img[src], [data-img]'):
        raw = node.get('src') or node.get('data-img')
        url = urljoin(response['final_url'], raw)
        images[url] = {'url': url, 'alt': node.get('alt', ''), 'title': node.get('title', '')}
    media = set()
    external = {}
    for node in root.select('a[href]'):
        absolute = urljoin(response['final_url'], node['href'])
        parsed = urlsplit(absolute)
        if parsed.scheme in ('http', 'https') and parsed.hostname != 'arsiv.cclcup.com':
            external[absolute] = {'url': absolute, 'label': text(node)}
    for node in root.select('iframe[src], video[src], source[src], a[href]'):
        raw = node.get('src') or node.get('href', '')
        if raw and (node.name != 'a' or re.search(r'youtu|vimeo|\.pdf(?:$|\?)|\.(?:jpg|jpeg|png|webp|gif|mp4)(?:$|\?)', raw, re.I)):
            media.add(urljoin(response['final_url'], raw))
    sections = []
    for node in root.select('.tab-pane, .panel'):
        sections.append({'id': node.get('id'), 'text': text(node), 'links': links_from(node, response['final_url'])})
    return {'source_url': response['url'], 'final_url': response['final_url'], 'scope': scope,
            'fetched_at': response['fetched_at'], 'raw_sha256': response['sha256'],
            'title': text(doc.title), 'selected_season_label': text(doc.select_one('li.dropdown.active > a')),
            'text': text(root), 'links': links_from(root, response['final_url']),
            'images': list(images.values()), 'media_urls': sorted(media),
            'external_links': list(external.values()),
            'metadata': [{'name': node.get('name') or node.get('property'), 'content': node['content']}
                         for node in doc.select('meta[content]') if node.get('name') or node.get('property')],
            'tables': tables_from(root, response['final_url']), 'sections': sections}


def fixtures_from(response, season_id):
    root = content(soup(response['html']))
    found = {}
    for score in root.select('.match-result'):
        row = score.find_parent('tr') or score.parent
        link = score.select_one('a[href]')
        url = canonical(link.get('href'), response['url']) if link else None
        mid = entity_id(url, 'mac')
        if not mid:
            continue
        cells = row.find_all('td', recursive=False)
        names = [text(a) for a in row.select('table.itable a[href]') if text(a)]
        value = text(score)
        match = re.fullmatch(r'(\d+)\s*-\s*(\d+)', value)
        date = text(row.select_one('.match-time'))
        def tab_label(class_name, head_class):
            pane = row.find_parent(class_=class_name)
            if not pane:
                return ''
            parent = pane.parent
            key = pane.get('data-active-in')
            return next((text(n) for n in parent.select('.' + head_class + ' [data-active]') if n.get('data-active') == key), '')
        group_name = tab_label('gtab-in', 'gtab-head')
        stage_name = tab_label('itab-in', 'itab-head')
        round_name = tab_label('wtab-in', 'wtab-head')
        found[mid] = {'season_id': season_id, 'match_id': mid, 'source_url': url,
                      'home_name': names[0] if names else text(cells[0]) if cells else None,
                      'away_name': names[-1] if len(names) > 1 else text(cells[-1]) if cells else None,
                      'home_score': int(match[1]) if match else None, 'away_score': int(match[2]) if match else None,
                      'score_raw': value, 'kickoff_raw': date, 'kickoff': date_value(date),
                      'group': group_name if stage_name in ('Gruplar', 'Group Stage', 'Group') else None,
                      'round_raw': round_name if stage_name in ('Gruplar', 'Group Stage', 'Group') else group_name,
                      'stage_raw': stage_name,
                      'score_semantics': 'source display; may include shootout goals', 'evidence_url': response['url']}
    return list(found.values())


def standings_from(response, season_id):
    doc = content(soup(response['html']))
    results = []
    group_names = [text(h) for h in doc.select('h6')]
    for table_index, table in enumerate(doc.select('table')):
        headers = [text(th) for th in table.select('thead th')]
        if not headers or headers[0] not in ('Takım', 'Team'):
            continue
        pane = table.find_parent(class_='itab-in')
        local_names = [text(h) for h in pane.select('h6')] if pane else group_names
        local_tables = [t for t in pane.select('table') if t.select_one('thead')] if pane else [t for t in doc.select('table') if t.select_one('thead')]
        local_index = next((i for i, t in enumerate(local_tables) if t is table), table_index)
        table_group = local_names[local_index] if local_index < len(local_names) else None
        for row in table.select('tbody tr'):
            cells = row.find_all('td', recursive=False)
            if len(cells) != len(headers):
                continue
            link = row.select_one('a[href]')
            team_url = canonical(link['href'], response['url']) if link else None
            name = text(cells[0])
            rank = re.match(r'^(\d+)\.\s*(.*)', name)
            item = {'season_id': season_id, 'team_id': entity_id(team_url, 'takim'),
                    'team_name': rank[2] if rank else name, 'rank': int(rank[1]) if rank else None,
                    'group': table_group,
                    'evidence_url': response['url'], 'raw_cells': [text(c) for c in cells]}
            for header, cell in zip(headers[1:], cells[1:]):
                field = {'O': 'played', 'G': 'won', 'B': 'drawn', 'M': 'lost', 'A': 'goals_for',
                         'Y': 'goals_against', 'AV': 'goal_difference', 'P': 'points'}.get(header, header)
                val = text(cell)
                item[field] = int(val) if re.fullmatch(r'-?\d+', val) else val
            results.append(item)
    return results


def match_details(response, season_ids):
    doc = soup(response['html'])
    root = content(doc)
    teams = []
    for link in root.select('.useravatar a[href]'):
        url = canonical(link['href'], response['url'])
        tid = entity_id(url, 'takim')
        if tid and tid not in [t['id'] for t in teams]:
            teams.append({'id': tid, 'name': text(link), 'source_url': url})
    if not teams:
        for link in root.select('.card a[href]'):
            url = canonical(link['href'], response['url'])
            tid = entity_id(url, 'takim')
            if tid and tid not in [t['id'] for t in teams]:
                name = text(link.select_one('strong'))
                if name:
                    teams.append({'id': tid, 'name': name, 'source_url': url})
    events = []
    mid = entity_id(response['url'], 'mac')
    for order, node in enumerate(root.select('.timeline > li'), 1):
        minute_raw = text(node.select_one('.timeline-title'))
        minute = re.search(r'(\d+)(?:\s*\+\s*(\d+))?', minute_raw)
        body = text(node.select_one('.timeline-body'))
        subject = text(node.select_one('.timeline-body strong'))
        actor = re.match(r'^(.*?)\s*\((.*?)\)$', subject)
        # Keep source labels: archive goals can represent shootout attempts.
        events.append({'match_id': mid, 'season_ids': season_ids, 'sequence': order,
                       'minute': int(minute[1]) if minute else None,
                       'extra_minute': int(minute[2]) if minute and minute[2] else None,
                       'minute_raw': minute_raw, 'player_name': actor[1] if actor else subject,
                       'team_name': actor[2] if actor else None, 'description': body,
                       'icon_url': urljoin(response['url'], node.select_one('.timeline-badge img')['src']) if node.select_one('.timeline-badge img') else None,
                       'media_urls': [urljoin(response['url'], a['href']) for a in node.select('a[href]')],
                       'evidence_url': response['url']})
    lineup = []
    for table in root.select('#tab3 table'):
        heading = table.find_previous('h4')
        team_name = text(heading)
        for row in table.select('tr'):
            link = row.select_one('a[href*="oyuncu-"]')
            if not link:
                continue
            cells = row.find_all('td', recursive=False)
            raw = text(cells[-1]) if cells else text(row)
            url = canonical(link['href'], response['url'])
            lineup.append({'match_id': mid, 'season_ids': season_ids, 'team_name': team_name,
                           'player_id': entity_id(url, 'oyuncu'), 'player_name': text(row.select_one('strong')),
                           'position_raw': raw.split(' / ', 1)[1] if ' / ' in raw else None,
                           'source_url': url, 'evidence_url': response['url']})
    gaps = []
    if 'Sorgu Hatalı' in response['html'] or 'sql_mode=only_full_group_by' in response['html']:
        gaps.append('Source page reports a database query error')
    if not any(player['player_id'] and player['player_name'] for player in lineup):
        gaps.append('Source lineup has no identified players')
    if not events:
        gaps.append('Source page has no timeline events')
    return {'id': mid, 'season_ids': season_ids, 'teams': teams, 'events': events, 'lineup': lineup, 'data_gaps': gaps,
            'review_flags': ['Displayed scores and penalty events may include shootout; reconcile before importing'],
            **page_record(response, 'match', doc)}


def profile_details(response, kind):
    doc = soup(response['html'])
    root = content(doc)
    details = {}
    for node in root.select('#tab1 h5'):
        label = text(node.select_one('strong')).rstrip(':')
        if label:
            details[label] = text(node)[len(text(node.select_one('strong'))):].strip()
    avatar = root.select_one('.useravatar img[src]')
    roster = []
    if kind == 'takim':
        for row in root.select('#tab2 table')[0].select('tr') if root.select('#tab2 table') else []:
            link = row.select_one('a[href*="oyuncu-"]')
            if link:
                url = canonical(link['href'], response['url'])
                roster.append({'player_id': entity_id(url, 'oyuncu'), 'source_url': url,
                               'name': text(row.select_one('strong')), 'stats_raw': [n.get('title') for n in row.select('[title]')]})
    return {'id': entity_id(response['url'], kind), 'name': text(root.select_one('.card-info .card-title')),
            'image_url': urljoin(response['url'], avatar['src']) if avatar else None,
            'image_is_placeholder': bool(avatar and 'oyuncuyok' in avatar['src']),
            'details': details, 'roster': roster,
            'review_flags': ['Shared archive profile; roster/stats are not proven to belong to a single season'],
            **page_record(response, 'shared-profile', doc)}


def detail_record(client, kind, eid, task):
    try:
        response = client.fetch(task['url'], 'shared-detail', opener=client.detail_session())
    except (URLError, TimeoutError):
        client.worker_state.opener = None
        raise
    if not soup(response['html']).select_one('.stage'):
        raise ValueError('Expected archive content missing; possible source error/redirect')
    if kind == 'mac':
        record = match_details(response, task['season_ids'])
        if not task['season_ids']:
            record['review_flags'].append('No fixture-index evidence of season membership')
    elif kind in ('takim', 'oyuncu'):
        record = profile_details(response, kind)
        record['referenced_in_season_ids'] = task['season_ids']
    else:
        record = {'id': eid, 'referenced_in_season_ids': task['season_ids'], **page_record(response, 'shared-content')}
    write_json(client.output / 'details' / kind / f'{eid}.json', record)
    return record


def crawl_catalog(client, season, statistics='all'):
    folder = client.output / 'seasons' / season['id']
    selected, label = client.select(season)
    season = {**season, 'selected_label': label}
    root_doc = soup(selected['html'])
    # Take routes from observed navigation, including all listed content modules.
    routes = []
    for a in root_doc.select('a[href]'):
        url = canonical(a['href'])
        if url and route_of(url) in INDEXES and route_of(url) != 'anasayfa':
            if url not in routes:
                routes.append(url)
    queue = deque(routes)
    seen, pages, errors, deferred = set(), [], [], []
    entities = {kind: {} for kind in KINDS}
    fixtures = {f['match_id']: f for f in fixtures_from(selected, season['id'])}
    standings = standings_from(selected, season['id'])
    homepage_standings = bool(standings)
    page = page_record(selected, season['id'])
    pages.append(page)
    for link in page['links']:
        m = ENTITY.match(urlsplit(link['url']).path)
        if m:
            entities[m[1]][m[2]] = link
    while queue:
        url = queue.popleft()
        if url in seen:
            continue
        seen.add(url)
        params = dict(parse_qsl(urlsplit(url).query))
        if route_of(url) == 'istatistikler' and params.get('kat') and (statistics == 'none' or (statistics == 'team' and params.get('takim') == '0')):
            deferred.append({'season_id': season['id'], 'url': url, 'reason': f'Not fetched under --statistics {statistics}'})
            continue
        try:
            response = client.fetch(url, season['id'])
            page = page_record(response, season['id'])
            if page['selected_season_label'] != label:
                raise ValueError(f'Season cookie changed: {page["selected_season_label"]!r} != {label!r}')
            pages.append(page)
            if route_of(url) == 'maclar':
                for fixture in fixtures_from(response, season['id']):
                    fixtures[fixture['match_id']] = fixture
            if route_of(url) == 'finale-dogru' and not homepage_standings:
                standings.extend(standings_from(response, season['id']))
            for link in page['links']:
                target = link['url']
                route = route_of(target)
                m = ENTITY.match(urlsplit(target).path)
                if m:
                    entities[m[1]][m[2]] = link
                elif route in INDEXES and (dict(parse_qsl(urlsplit(target).query)) or route not in [route_of(u) for u in routes]):
                    if target not in seen:
                        queue.append(target)
        except PageLimit:
            raise
        except Exception as error:
            errors.append({'season_id': season['id'], 'url': url, 'error': str(error)})
    # Only fixture-index entries are proof that a match belongs to this season.
    linked_other_matches = set(entities['mac']) - set(fixtures)
    result = {'season': season, 'catalog_complete': not errors and not deferred, 'pages': pages,
              'entities': entities, 'fixtures': list(fixtures.values()), 'standings': standings,
              'errors': errors, 'deferred_statistics': deferred, 'review_flags': ['Team/player profile data needs season reconciliation',
                  f'{len(linked_other_matches)} linked matches lack fixture-index season evidence']}
    write_json(folder / 'catalog.json', result)
    write_csv(folder / 'fixtures.csv', list(fixtures.values()), ['season_id', 'match_id', 'home_name', 'away_name', 'home_score', 'away_score', 'kickoff', 'kickoff_raw', 'group', 'round_raw', 'score_raw', 'score_semantics', 'source_url', 'evidence_url'])
    write_csv(folder / 'standings.csv', standings, ['season_id', 'group', 'rank', 'team_id', 'team_name', 'played', 'won', 'drawn', 'lost', 'goals_for', 'goals_against', 'goal_difference', 'points', 'raw_cells', 'evidence_url'])
    write_csv(folder / 'teams.csv', [{'season_id': season['id'], 'team_id': tid, **item} for tid, item in entities['takim'].items()], ['season_id', 'team_id', 'label', 'url', 'original_url'])
    return result


def run(args):
    configure_source(getattr(args, 'source', 'https://arsiv.cclcup.com/'))
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    previous = output / 'manifest.json'
    if previous.exists() and json.loads(previous.read_text()).get('source') != BASE:
        raise ValueError('Use a separate output directory for each archive installation')
    client = Client(output, args.delay, args.max_pages, args.offline, args.timeout, args.attempts)
    all_errors, catalogs, limits, deferred = [], [], None, []
    manifest = {'schema_version': 1, 'source': BASE, 'started_at': now(), 'mode': args.mode,
                'imports_database': False, 'asset_downloads': False, 'statistics': args.statistics, 'complete': False, 'running': True}
    write_json(output / 'manifest.json', manifest)
    (output / 'errors-live.jsonl').write_text('', encoding='utf-8')
    try:
        client.check_robots()
        seasons = discover(client)
        write_json(output / 'seasons.json', seasons)
        write_csv(output / 'seasons.csv', seasons, ['id', 'city', 'name', 'url', 'discovered_in_cities'])
        selected = [s for s in seasons if not args.seasons or s['id'] in args.seasons]
        if args.seasons and set(args.seasons) - {s['id'] for s in seasons}:
            raise ValueError('Requested season IDs are not in the discovered archive')
        print(f'Discovered {len(seasons)} seasons; exporting {len(selected)}', flush=True)
        for season in selected:
            try:
                catalog = crawl_catalog(client, season, args.statistics)
            except PageLimit:
                raise
            except Exception as error:
                all_errors.append({'season_id': season['id'], 'phase': 'catalog', 'error': str(error)})
                print(f'Season {season["id"]} failed: {error}', flush=True)
                continue
            catalogs.append(catalog)
            all_errors.extend(catalog['errors'])
            deferred.extend(catalog['deferred_statistics'])
            print(f'Season {season["id"]} {season["city"]} {season["name"]}: {len(catalog["pages"])} pages, {len(catalog["fixtures"])} matches, {len(catalog["entities"]["takim"])} clubs', flush=True)
            write_json(output / 'progress.json', {'phase': 'catalog', 'completed_season_ids': [c['season']['id'] for c in catalogs], 'updated_at': now()})
        # Cookies stay in one known selected season. Profile records remain shared.
        if args.mode == 'full':
            tasks = {kind: {} for kind in KINDS}
            for cat in catalogs:
                sid = cat['season']['id']
                for fixture in cat['fixtures']:
                    task = tasks['mac'].setdefault(fixture['match_id'], {'url': fixture['source_url'], 'season_ids': []})
                    task['season_ids'].append(sid)
                for kind in (k for k in KINDS if k != 'mac'):
                    for eid, link in cat['entities'][kind].items():
                        task = tasks[kind].setdefault(eid, {'url': link['url'], 'season_ids': []})
                        if sid not in task['season_ids']:
                            task['season_ids'].append(sid)
            pending = deque((kind, eid) for kind in KINDS for eid in tasks[kind])
            processed = 0
            print(f'Fetching {len(pending)} detail pages; following their observed archive references', flush=True)
            # Catalogs remain sequential: each season needs its own cookie selection.
            # Workers verify the same selection in separate anonymous sessions.
            with ThreadPoolExecutor(max_workers=args.workers) as pool:
                active = {}
                while pending or active:
                    while pending and len(active) < args.workers:
                        kind, eid = pending.popleft()
                        future = pool.submit(detail_record, client, kind, eid, tasks[kind][eid])
                        active[future] = (kind, eid)
                    done, _ = wait(active, return_when=FIRST_COMPLETED)
                    for future in done:
                        kind, eid = active.pop(future)
                        task = tasks[kind][eid]
                        try:
                            record = future.result()
                            for link in record['links']:
                                m = ENTITY.match(urlsplit(link['url']).path)
                                if m and m[2] not in tasks[m[1]]:
                                    tasks[m[1]][m[2]] = {'url': link['url'], 'season_ids': []}
                                    pending.append((m[1], m[2]))
                        except PageLimit:
                            raise
                        except Exception as error:
                            failure = {'kind': kind, 'id': eid, 'url': task['url'], 'error': str(error)}
                            all_errors.append(failure)
                            with (output / 'errors-live.jsonl').open('a', encoding='utf-8') as handle:
                                handle.write(json.dumps(failure, ensure_ascii=False) + '\n')
                        processed += 1
                        if processed % 25 == 0 or not pending and not active:
                            print(f'Details: {processed} processed, {len(pending) + len(active)} queued (last {kind}/{eid})', flush=True)
                            write_json(output / 'progress.json', {'phase': 'details', 'last_kind': kind, 'processed': processed, 'queued': len(pending) + len(active), 'updated_at': now()})
            manifest['expected_detail_counts'] = {kind: len(items) for kind, items in tasks.items()}
        manifest['complete'] = not all_errors and not deferred
    except PageLimit as error:
        limits = str(error)
        print(limits, flush=True)
    except KeyboardInterrupt:
        limits = 'Interrupted; cached responses and completed records can be resumed'
    except Exception as error:
        all_errors.append({'phase': 'run', 'error': str(error)})
        print(f'Run error: {error}', flush=True)
    finally:
        # Build review CSVs from completed records even on interruption.
        matches = [json.loads(p.read_text(encoding='utf-8')) for p in sorted((output / 'details' / 'mac').glob('*.json'))]
        events = [event for match in matches for event in match['events']]
        lineups = [player for match in matches for player in match['lineup']]
        write_csv(output / 'match-events.csv', events, ['match_id', 'season_ids', 'sequence', 'minute', 'extra_minute', 'minute_raw', 'player_name', 'team_name', 'description', 'icon_url', 'media_urls', 'evidence_url'])
        write_csv(output / 'match-lineups.csv', lineups, ['match_id', 'season_ids', 'team_name', 'player_id', 'player_name', 'position_raw', 'source_url', 'evidence_url'])
        write_json(output / 'errors.json', all_errors)
        write_json(output / 'deferred-statistics.json', deferred)
        manifest.update({'finished_at': now(), 'running': False, 'network_requests': client.requests, 'errors': len(all_errors),
                         'limit_or_interruption': limits, 'completed_catalogs_this_run': len(catalogs), 'deferred_statistics': len(deferred),
                         'detail_counts_on_disk': {k: len(list((output / 'details' / k).glob('*.json'))) for k in KINDS},
                         'event_count_on_disk': len(events), 'lineup_count_on_disk': len(lineups)})
        write_json(output / 'manifest.json', manifest)
        print(json.dumps(manifest, ensure_ascii=False, indent=2), flush=True)
    return 0 if manifest['complete'] else 2


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', choices=('https://arsiv.cclcup.com/', 'https://arsiv.cclcup.com/internationalcorporatecup/'), default='https://arsiv.cclcup.com/')
    parser.add_argument('--output', type=Path, default=Path(__file__).parent / 'output')
    parser.add_argument('--mode', choices=('catalog', 'full'), default='full')
    parser.add_argument('--seasons', nargs='+', help='Only discovered source season IDs; default all')
    parser.add_argument('--delay', type=float, default=.75, help='Minimum request spacing in seconds')
    parser.add_argument('--max-pages', type=int, help='Limit network requests for a smoke run (marked incomplete)')
    parser.add_argument('--offline', action='store_true', help='Reparse cached responses without network')
    parser.add_argument('--statistics', choices=('all', 'team', 'none'), default='all', help='Default all; optionally defer slow statistics requests (manifest stays incomplete)')
    parser.add_argument('--timeout', type=float, default=15, help='Socket read/connect timeout in seconds')
    parser.add_argument('--attempts', type=int, default=2, help='Maximum attempts per request')
    parser.add_argument('--workers', type=int, default=1, help='Concurrent shared detail reads (1–4); catalogs stay sequential')
    args = parser.parse_args()
    if args.delay < .25:
        parser.error('--delay must be at least 0.25 seconds')
    if args.max_pages is not None and args.max_pages < 1:
        parser.error('--max-pages must be positive')
    if args.timeout <= 0 or not 1 <= args.attempts <= 5:
        parser.error('--timeout must be positive and --attempts between 1 and 5')
    if not 1 <= args.workers <= 4:
        parser.error('--workers must be between 1 and 4')
    raise SystemExit(run(args))

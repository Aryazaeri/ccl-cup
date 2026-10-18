"""Turn the historical export into per-season payloads for
public.import_historical_season (supabase/migrations/202610170002_historical_import.sql).

Reads the export read-only; writes payloads and a review report elsewhere.
Nothing is invented: unknown dates, scorers and attributes are skipped or left
empty, and every skip is counted in the report.

    python3 build_import.py EXPORT_DIR PAYLOAD_DIR REPORT_DIR
"""
import csv
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ICON_TYPES = {'1': 'goal', '2': 'penalty_scored', '3': 'own_goal', '4': 'yellow_card',
              '5': 'red_card', '7': 'assist', '8': 'substitution'}
STAGES = {'2. Tur': 'round_of_16', 'Çeyrek Final': 'quarter_final', 'Yarı Final': 'semi_final', 'FİNAL': 'final'}
FULL_TIME = 50  # archive matches are 2 x 25 minutes; shootout kicks are logged at 50'


def rows(path):
    if not path.exists():
        return []
    with open(path, encoding='utf-8-sig') as f:
        return list(csv.DictReader(f))


def fold(text):
    """Case-insensitive key that treats Turkish İ/ı like I/i."""
    return (text or '').replace('İ', 'I').replace('ı', 'i').casefold().strip()


def slugify(text):
    text = unicodedata.normalize('NFKD', text.replace('ı', 'i').replace('İ', 'I'))
    return re.sub(r'[^a-z0-9]+', '-', text.encode('ascii', 'ignore').decode().lower()).strip('-')


def position(raw):
    raw = fold(raw)
    if 'kaleci' in raw:
        return 'goalkeeper'
    if 'defans' in raw or 'stoper' in raw or 'bek' in raw:
        return 'defender'
    if 'orta saha' in raw:
        return 'midfielder'
    if 'forvet' in raw or 'açık' in raw or 'açik' in raw:
        return 'forward'
    return None


def foot(raw):
    raw = fold(raw)
    return 'both' if 'iki' in raw else 'left' if 'sol' in raw else 'right' if 'sağ' in raw else None


def number(raw, low, high):
    try:
        value = int(str(raw).strip())
    except ValueError:
        return None
    return value if low <= value <= high else None


def group_name(raw):
    match = re.match(r'^([A-Z])\s+Grubu$', (raw or '').strip())
    return f'Group {match.group(1)}' if match else None


def build(export, out, report_dir):
    out.mkdir(parents=True, exist_ok=True)
    report_dir.mkdir(parents=True, exist_ok=True)
    coverage = {r['season_id']: r for r in rows(export / 'season-coverage.csv')}
    profiles = {(r['kind'], r['source_id']): r for r in rows(export / 'profiles.csv')}
    squads = defaultdict(lambda: defaultdict(list))  # season -> club -> players
    club_id_of, club_name_of = {}, {}
    for r in rows(export / 'observed-squads.csv'):
        squads[r['season_id']][r['club_id']].append(r['player_id'])
        club_id_of[fold(r['club_name'])] = r['club_id']
        club_name_of.setdefault(r['club_id'], r['club_name'])
    for sid in coverage:
        for r in rows(export / 'seasons' / sid / 'teams.csv'):
            club_id_of.setdefault(fold(r['label']), r['team_id'])
            club_name_of.setdefault(r['team_id'], r['label'])
    lineups = defaultdict(list)
    for r in rows(export / 'match-lineups.csv'):
        lineups[r['match_id']].append(r)
    events = defaultdict(list)
    for r in rows(export / 'match-events.csv'):
        events[r['match_id']].append(r)

    skipped, totals, notes = Counter(), Counter(), defaultdict(list)

    for sid, cov in sorted(coverage.items(), key=lambda kv: int(kv[0])):
        fixtures = rows(export / 'seasons' / sid / 'fixtures.csv')
        if not fixtures:
            notes['seasons skipped (no fixtures in the archive)'].append(f"{sid} {cov['selected_label']}")
            continue
        standings = rows(export / 'seasons' / sid / 'standings.csv')
        rank = {r['team_id']: int(r['rank'] or 99) for r in standings}
        matches, groups, season_clubs, dates = [], defaultdict(set), set(), []

        for f in fixtures:
            home, away = club_id_of.get(fold(f['home_name'])), club_id_of.get(fold(f['away_name']))
            label = f"season {sid} match {f['match_id']} {f['home_name']} {f['score_raw'] or 'v'} {f['away_name']}"
            if not home or not away:
                skipped['matches with an unknown club'] += 1
                notes['matches skipped: unknown club'].append(label)
                continue
            if not f['kickoff']:
                skipped['matches with a placeholder date'] += 1
                notes['matches skipped: placeholder date'].append(label)
                continue
            knockout = f['round_raw'] in STAGES
            group = None if knockout else group_name(f['group'])
            if group:
                groups[group].update([home, away])
            season_clubs.update([home, away])
            dates.append(f['kickoff'][:10])

            players_by_name = {(fold(l['team_name']), fold(l['player_name'])): l['player_id']
                               for l in lineups[f['match_id']]}
            match_lineup = [[club_id_of.get(fold(l['team_name'])), l['player_id']] for l in lineups[f['match_id']]
                            if club_id_of.get(fold(l['team_name'])) in (home, away)]
            match_events, kicks = [], Counter()
            for e in events[f['match_id']]:
                kind = ICON_TYPES.get(e['icon_url'].rsplit('/', 1)[-1].split('.')[0])
                minute = number(e['minute'], 0, 150)
                club = club_id_of.get(fold(e['team_name']))
                club = club if club in (home, away) else None
                if not kind or minute is None:
                    skipped['events of an unknown type or minute'] += 1
                    continue
                if knockout and kind == 'penalty_scored' and minute >= FULL_TIME:
                    kicks[club] += 1
                    skipped['shootout kicks (not imported as goals)'] += 1
                    continue
                player = players_by_name.get((fold(e['team_name']), fold(e['player_name'])))
                if not player and not e['player_name'].strip():
                    skipped['events with no player named'] += 1
                    continue
                note = None
                if kind == 'substitution':
                    sub = re.search(r'yerine (.+?) \(', e['description'])
                    note = f'On: {sub.group(1).strip()}' if sub and sub.group(1).strip() else None
                match_events.append({'type': kind, 'minute': minute, 'extra': number(e['extra_minute'], 0, 30),
                                     'club': club, 'player': player,
                                     'player_name': None if player else e['player_name'].strip(), 'notes': note})

            played = f['home_score'] != '' and f['away_score'] != ''
            if kicks:
                notes['knockout matches with shootout kicks recorded (score kept as displayed)'].append(
                    f"{label}, kicks scored {kicks.get(home, 0)}-{kicks.get(away, 0)}")
            if played:
                goals = Counter()
                for e in match_events:
                    if e['type'] in ('goal', 'penalty_scored') and e['club']:
                        goals[e['club']] += 1
                    elif e['type'] == 'own_goal' and e['club']:
                        goals[away if e['club'] == home else home] += 1
                if (goals[home], goals[away]) != (int(f['home_score']), int(f['away_score'])):
                    notes['matches whose recorded goals differ from the displayed score (score kept as displayed)'].append(
                        f"{label}, goals recorded {goals[home]}-{goals[away]}")
            else:
                notes['matches with no score in the archive (imported as scheduled)'].append(label)

            week = re.match(r'^(\d+)\. Hafta', f['round_raw'])
            matches.append({'source_id': f['match_id'], 'home': home, 'away': away,
                            'kickoff_at': f['kickoff'] + '+03:00',
                            'stage': STAGES.get(f['round_raw'], 'group'), 'group': group,
                            'week': int(week.group(1)) if week else None,
                            'status': 'completed' if played else 'scheduled',
                            'home_score': int(f['home_score']) if played else None,
                            'away_score': int(f['away_score']) if played else None,
                            'lineups': match_lineup, 'events': match_events})

        club_group = {club: g for g, members in groups.items() for club in members}
        clubs, squad_rows, players = [], [], {}
        for club in sorted(season_clubs, key=int):
            members = squads[sid].get(club, [])
            if len(members) < 5:
                notes['clubs with fewer than five recorded players (imported with the squad the archive has)'].append(
                    f"season {sid} {club_name_of.get(club, club)} ({len(members)} players)")
            profile = profiles.get(('takim', club), {})
            name = club_name_of.get(club) or profile.get('name') or f'Club {club}'
            clubs.append({'source_id': club, 'name': name, 'slug': f'{slugify(name)}-a{club}',
                          'logo_url': profile.get('image_url') if profile.get('image_is_placeholder') == 'False' else None,
                          'group_name': club_group.get(club)})
            squad_rows.append({'club': club, 'players': members})
            for pid in members:
                pr = profiles.get(('oyuncu', pid), {})
                attrs = json.loads(pr.get('attributes') or '{}')
                if not pr.get('name'):
                    notes['players with no name in the archive (imported as "Unknown player <id>")'].append(pid)
                players[pid] = {'source_id': pid, 'full_name': pr.get('name') or f'Unknown player {pid}',
                                'position': position(attrs.get('Mevki')), 'strong_foot': foot(attrs.get('Güçlü Ayak')),
                                'height_cm': number(attrs.get('Boy', ''), 120, 230),
                                'weight_kg': number(attrs.get('Kilo', ''), 35, 180),
                                'photo_url': pr.get('image_url') if pr.get('image_is_placeholder') == 'False' else None}

        year = re.search(r'(20\d\d)', cov['selected_label'] + ' ' + cov['menu_name'])
        group_list = [{'name': g, 'clubs': sorted(members, key=lambda c: (rank.get(c, 99), int(c)))}
                      for g, members in sorted(groups.items())]
        payload = {
            'source_id': sid, 'name': cov['menu_name'], 'full_name': cov['selected_label'],
            'slug': f"archive-{sid}-{slugify(cov['menu_name'])}", 'city': cov['city_context'],
            'year': int(year.group(1)) if year else None,
            'season_type': 'group_league' if group_list else 'tournament',
            'starts_on': min(dates), 'ends_on': max(dates),
            'groups': group_list, 'clubs': clubs, 'players': list(players.values()), 'squads': squad_rows,
            'matches': matches,
            # Blank cells (an empty archive table) stay unknown rather than zero.
            'standings': [{'group': group_name(r['group']) or r['group'] or 'League', 'club': r['team_id'],
                           **{k: number(r[k], 0, 999) for k in
                              ('played', 'won', 'drawn', 'lost', 'goals_for', 'goals_against', 'points')}}
                          for r in standings if r['team_id']],
        }
        (out / f'season-{sid}.json').write_text(json.dumps(payload, ensure_ascii=False), encoding='utf-8')
        totals['seasons'] += 1
        totals['season clubs'] += len(clubs)
        totals['squad entries'] += sum(len(s['players']) for s in squad_rows)
        totals['matches'] += len(matches)
        totals['events'] += sum(len(m['events']) for m in matches)
        totals['lineup entries'] += sum(len(m['lineups']) for m in matches)

    lines = ['# Historical import — preview', '', 'Each payload becomes a hidden draft season. Nothing here is written yet.',
             '', '## Totals', ''] + [f'- {k}: {v}' for k, v in totals.items()]
    lines += ['', '## Skipped', ''] + [f'- {k}: {v}' for k, v in skipped.items()]
    for title, items in notes.items():
        lines += ['', f'## {title} ({len(items)})', ''] + [f'- {i}' for i in items]
    (report_dir / 'IMPORT-PREVIEW.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(json.dumps({'totals': totals, 'skipped': skipped, 'notes': {k: len(v) for k, v in notes.items()}},
                     ensure_ascii=False, indent=1))


if __name__ == '__main__':
    build(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]))

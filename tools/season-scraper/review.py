#!/usr/bin/env python3
"""Summarize an export and build asset/coverage CSVs without any network access."""
import argparse
import csv
import json
from collections import Counter
from pathlib import Path


def csv_file(path, rows, columns):
    with path.open('w', encoding='utf-8-sig', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: json.dumps(value, ensure_ascii=False) if isinstance(value, (list, dict)) else value for key, value in row.items()})


def summarize(output):
    assets, seasons, detail_counts = {}, [], Counter()
    profiles, match_rows, media_rows, observed_squads = [], [], [], {}
    def inspect(page):
        source = page['source_url']
        for image in page.get('images', []):
            item = assets.setdefault(image['url'], {'url': image['url'], 'kinds': set(), 'source_pages': set()})
            item['kinds'].add('image')
            item['source_pages'].add(source)
        for url in page.get('media_urls', []):
            item = assets.setdefault(url, {'url': url, 'kinds': set(), 'source_pages': set()})
            item['kinds'].add('media-or-document')
            item['source_pages'].add(source)
    for file in sorted((output / 'seasons').glob('*/catalog.json'), key=lambda p: int(p.parent.name)):
        catalog = json.loads(file.read_text(encoding='utf-8'))
        season = catalog['season']
        seasons.append({'season_id': season['id'], 'city_context': season['city'], 'menu_name': season['name'],
                        'selected_label': season['selected_label'], 'catalog_pages': len(catalog['pages']),
                        'fixtures': len(catalog['fixtures']), 'standings_rows': len(catalog['standings']),
                        'club_references': len(catalog['entities']['takim']), 'errors': len(catalog['errors']),
                        'deferred_statistics': len(catalog.get('deferred_statistics', [])),
                        'source_url': season['url']})
        for page in catalog['pages']:
            inspect(page)
    for file in (output / 'details').glob('*/*.json'):
        record = json.loads(file.read_text(encoding='utf-8'))
        detail_counts[file.parent.name] += 1
        inspect(record)
        kind = file.parent.name
        if kind in ('takim', 'oyuncu'):
            profiles.append({'kind': kind, 'source_id': record['id'], 'name': record['name'],
                             'image_url': record.get('image_url'), 'image_is_placeholder': record.get('image_is_placeholder'),
                             'attributes': record.get('details', {}), 'roster_size': len(record.get('roster', [])),
                             'source_url': record['source_url']})
        elif kind == 'mac':
            match_rows.append({'match_id': record['id'], 'season_ids': record['season_ids'], 'clubs': record['teams'],
                               'event_count': len(record['events']), 'lineup_count': len(record['lineup']),
                               'data_gaps': record.get('data_gaps', []),
                               'review_flags': record['review_flags'], 'source_url': record['source_url']})
            for player in record['lineup']:
                matching_clubs = [c for c in record['teams'] if c['name'].casefold() == player['team_name'].casefold()]
                club = matching_clubs[0] if len(matching_clubs) == 1 else None
                if not club or not player['player_id']:
                    continue
                for sid in record['season_ids']:
                    key = (sid, club['id'], player['player_id'])
                    item = observed_squads.setdefault(key, {'season_id': sid, 'club_id': club['id'], 'club_name': club['name'],
                        'player_id': player['player_id'], 'player_name': player['player_name'], 'evidence_match_urls': set()})
                    item['evidence_match_urls'].add(record['source_url'])
        else:
            media_rows.append({'kind': kind, 'source_id': record['id'], 'title': record['title'],
                               'image_count': len(record['images']), 'media_urls': record['media_urls'],
                               'source_url': record['source_url']})
    asset_rows = [{'url': item['url'], 'kinds': sorted(item['kinds']), 'source_pages': sorted(item['source_pages'])}
                  for item in sorted(assets.values(), key=lambda x: x['url'])]
    csv_file(output / 'assets.csv', asset_rows, ['url', 'kinds', 'source_pages'])
    csv_file(output / 'profiles.csv', sorted(profiles, key=lambda x: (x['kind'], int(x['source_id']))), ['kind', 'source_id', 'name', 'image_url', 'image_is_placeholder', 'attributes', 'roster_size', 'source_url'])
    csv_file(output / 'match-coverage.csv', sorted(match_rows, key=lambda x: int(x['match_id'])), ['match_id', 'season_ids', 'clubs', 'event_count', 'lineup_count', 'data_gaps', 'review_flags', 'source_url'])
    csv_file(output / 'media-pages.csv', sorted(media_rows, key=lambda x: (x['kind'], int(x['source_id']))), ['kind', 'source_id', 'title', 'image_count', 'media_urls', 'source_url'])
    csv_file(output / 'observed-squads.csv', [{**item, 'evidence_match_urls': sorted(item['evidence_match_urls'])}
             for _, item in sorted(observed_squads.items())], ['season_id', 'club_id', 'club_name', 'player_id', 'player_name', 'evidence_match_urls'])
    csv_file(output / 'season-coverage.csv', seasons, ['season_id', 'city_context', 'menu_name', 'selected_label', 'catalog_pages', 'fixtures', 'standings_rows', 'club_references', 'errors', 'deferred_statistics', 'source_url'])
    manifest_file = output / 'manifest.json'
    manifest = json.loads(manifest_file.read_text(encoding='utf-8')) if manifest_file.exists() else {}
    lines = ['# Historical season export — review', '',
             f'Source: {manifest.get("source", "https://arsiv.cclcup.com/")} · {len(seasons)} saved season catalogs.', '',
             f'- Catalog fixtures: {sum(s["fixtures"] for s in seasons)}',
             f'- Standings rows: {sum(s["standings_rows"] for s in seasons)}',
             f'- Detail records currently on disk: {dict(detail_counts)}',
             f'- Unique image/media/document references: {len(assets)}',
             f'- Catalog fetch errors: {sum(s["errors"] for s in seasons)}',
             f'- Deferred statistics URLs: {sum(s["deferred_statistics"] for s in seasons)}',
             f'- Latest run manifest complete: {manifest.get("complete", False)}', '',
             'Read `manifest.json`, `progress.json`, `errors.json` and `deferred-statistics.json` together.',
             'A snapshot while a run is active is not a completed-export claim.', '',
             '## Files to review', '',
             '- `season-coverage.csv`: season names, selected labels, counts and gaps.',
             '- `assets.csv`: deduplicated image/video/document URLs and the pages that reference them.',
             '- `profiles.csv`, `match-coverage.csv`, `media-pages.csv`: compact indexes of detail records.',
             '- `observed-squads.csv`: season/club/player participation proven by recorded match lineups; not a complete registration list.',
             '- `seasons/<source-id>/fixtures.csv` and `standings.csv`: season competition data.',
             '- `match-events.csv` and `match-lineups.csv`: flattened historical match evidence.',
             '- `details/`: profile, match, article, announcement, photo-album and weekly-clip JSON.',
             '- `cache/`: original HTML, timestamps and hashes.', '',
             '## Import review required', '',
             'Club/player profiles contain data spanning multiple seasons; profile reference lists are not confirmed squads.',
             'Match lineups are historical participation evidence. Displayed scores and penalty events may include shootouts.',
             'Source IDs must be mapped to the application IDs. Missing fields are not invented.',
             'City is the archive navigation context; Türkiye/European competitions may not use that label.',
             'Binary assets have not been downloaded. No production database has been modified.', '']
    (output / 'REVIEW.md').write_text('\n'.join(lines), encoding='utf-8')
    print(json.dumps({'season_catalogs': len(seasons), 'fixtures': sum(s['fixtures'] for s in seasons),
                      'detail_counts': dict(detail_counts), 'asset_references': len(assets)}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    summarize(parser.parse_args().output.resolve())

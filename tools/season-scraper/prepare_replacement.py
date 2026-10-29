#!/usr/bin/env python3
"""Build an offline International Corporate Cup replacement review; never writes a database."""
import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path

from build_import import build
from review import summarize

SOURCE = 'https://arsiv.cclcup.com/internationalcorporatecup/'


def prepare(export, destination):
    manifest = json.loads((export / 'manifest.json').read_text())
    if manifest.get('source') != SOURCE or manifest.get('running'):
        raise ValueError('Requires a stopped International Corporate Cup export')
    if destination.exists() and any(destination.iterdir()):
        raise ValueError('Use a new empty destination to preserve previous review evidence')
    destination.mkdir(parents=True, exist_ok=True)
    summarize(export)
    build(export, destination / 'seasons', destination)
    payloads = [json.loads(p.read_text()) for p in sorted((destination / 'seasons').glob('*.json'))]
    errors, warnings = [], []
    expected = manifest.get('expected_detail_counts', {})
    for kind in ('mac', 'takim', 'oyuncu', 'h'):
        actual = len(list((export / 'details' / kind).glob('*.json')))
        if actual != expected.get(kind, actual):
            errors.append(f'{kind}: expected {expected[kind]} details, collected {actual}')
    catalogs = [json.loads(p.read_text()) for p in (export / 'seasons').glob('*/catalog.json')]
    if len(payloads) != len(catalogs):
        errors.append('Not every exported season produced a candidate payload')
    counts, clubs, players = Counter(), set(), set()
    for season in payloads:
        sid = season['source_id']
        local_clubs = {c['source_id'] for c in season['clubs']}
        local_players = {p['source_id'] for p in season['players']}
        clubs.update(local_clubs)
        players.update(local_players)
        memberships = defaultdict(set)
        for squad in season['squads']:
            for player in squad['players']:
                memberships[player].add(squad['club'])
        for player, teams in memberships.items():
            if len(teams) > 1:
                errors.append(f'{sid}: {player} has recorded participation at multiple clubs: {sorted(teams)}')
        for match in season['matches']:
            if match['home'] == match['away'] or not {match['home'], match['away']} <= local_clubs:
                errors.append(f'{sid}: invalid clubs in {match["source_id"]}')
            for club, player in match['lineups']:
                if player not in local_players or club not in memberships.get(player, set()):
                    errors.append(f'{sid}: lineup outside observed squad in {match["source_id"]}: {player}')
            for event in match['events']:
                if event['player'] and event['player'] not in local_players:
                    errors.append(f'{sid}: unmapped event player {event["player"]}')
                if event['player'] is None or event['club'] is None:
                    warnings.append(f'{match["source_id"]}: event needs identity reconciliation')
            if match.get('score_source') != 'legacy':
                errors.append(f'{match["source_id"]}: source score is not marked historical')
        catalog = next(c for c in catalogs if 'icc:' + c['season']['id'] == sid)
        if len(season['matches']) != len(catalog['fixtures']):
            errors.append(f'{sid}: some source fixtures were omitted; see IMPORT-PREVIEW.md')
        for kind in ('matches', 'players', 'clubs'):
            if any(not x['source_id'].startswith('icc:') for x in season[kind]):
                errors.append(f'{sid}: missing namespace in {kind}')
        counts['season_entries'] += len(season['clubs'])
        counts['matches'] += len(season['matches'])
        counts['events'] += sum(len(m['events']) for m in season['matches'])
        counts['lineups'] += sum(len(m['lineups']) for m in season['matches'])
    counts.update(seasons=len(payloads), clubs=len(clubs), players=len(players))
    # Content and the full original match ledgers remain intact even where the
    # app's normalized model cannot represent a source field yet.
    records = {}
    for directory in sorted((export / 'details').iterdir()):
        if directory.is_dir():
            records[directory.name] = [json.loads(p.read_text()) for p in sorted(directory.glob('*.json'))]
    bundle = {'schema_version': 1, 'source': SOURCE, 'database_writes': False,
              'target_schema_validated': False, 'seasons': payloads, 'source_records': records}
    bundle_file = destination / 'replacement.json'
    bundle_file.write_text(json.dumps(bundle, ensure_ascii=False, indent=2) + '\n')
    digest = hashlib.sha256(bundle_file.read_bytes()).hexdigest()
    report = {'source': SOURCE, 'counts': dict(counts), 'bundle_sha256': digest,
              'validation_errors': sorted(set(errors)), 'identity_warnings': sorted(set(warnings)),
              'events_with_unresolved_identity': len(warnings),
              'source_fetch_errors': json.loads((export / 'errors.json').read_text()),
              'source_complete': manifest.get('complete', False), 'production_changed': False,
              'target_schema_validated': False}
    (destination / 'validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    lines = ['# International Corporate Cup replacement review', '',
             'Requested scope: every International Corporate Cup season (2022, 2023, 2024).', '',
             '| Season | Club entries | Matches | Source |', '| --- | ---: | ---: | --- |']
    for season in sorted(payloads, key=lambda s: s['year']):
        lines.append(f'| {season["year"]} | {len(season["clubs"])} | {len(season["matches"])} | {SOURCE}anasayfa?sezon={season["source_id"].split(":")[-1]} |')
    lines += ['', f'Candidate totals: {dict(counts)}.',
              f'Bundle SHA-256: `{digest}`.', '',
              f'Identity/reference validation errors: {len(set(errors))}.',
              f'Events needing identity review: {len(warnings)} in {len(set(warnings))} matches.', '',
              '## Replacement behavior', '',
              '- Stage these three seasons with explicit `icc:` source mappings, independent of the domestic archive.',
              '- Keep original match scores as historical results. Resolve shootout/event ambiguity before enabling scorer aggregates.',
              '- Reuse player identities within this archive across years. Do not match domestic players by numeric IDs or names alone.',
              '- Preserve unknown countries, portraits, attributes and unrecorded historical squads as unknown.',
              '- News, announcements and media references are retained in `replacement.json` under `source_records`; their publication mapping is still pending.',
              '- Review the new seasons privately before publishing. The proposed cutover archives existing public tournaments and publishes these three, with 2024 as default. Existing records remain retained.', '',
              '## Remaining execution work', '',
              'This is a source-backed candidate, not an executed or schema-validated database import. The retired historical RPC must not be restored unchanged: current match validation, legacy scores, recorded lineups and registry/history tables require a reviewed import path.',
              'Obtain the current production inventory and recovery snapshot, reconcile the exact live schema, rehearse the import on an isolated copy, and approve the exact publication/content cutover before production writes.',
              'No frontend seed edit can replace Supabase-backed production data. No live database, deployment, setting or asset was changed.', '',
              '## Source limitations', '',
              '- Dedicated match pages are empty and dedicated standings pages disagree with homepage tables; candidate fixtures/tables come from the selected season homepage.',
              '- The menu also links a Türkiye Finals page whose season selector fails; it is outside the requested International Corporate Cup years.',
              '- Scores, knockout stage labels (including multiple finals), and timeline events may be inconsistent. See IMPORT-PREVIEW.md and original records.',
              '- Image/video URLs are preserved; binary assets are not mirrored in this bundle.',
              '- The source includes blank lineup slots; these remain in the source records and are excluded from candidate player memberships.',
              '- Source fetch gaps are listed in validation.json; they are not silently treated as empty data.', '']
    if errors:
        lines += ['## Identity/reference issues', ''] + ['- ' + e for e in sorted(set(errors))] + ['']
    (destination / 'REPLACEMENT-REVIEW.md').write_text('\n'.join(lines))
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 2 if errors else 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('export', type=Path)
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    raise SystemExit(prepare(args.export.resolve(), args.destination.resolve()))

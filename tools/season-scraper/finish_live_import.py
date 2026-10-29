#!/usr/bin/env python3
"""Derive reviewed ICC knockout trees and generate a rollback-first publication script."""
import argparse
import json
from pathlib import Path


def finish(review, mapped, output):
    bundle = json.loads((review / 'replacement.json').read_text())
    mappings = json.loads(mapped.read_text())['maps']
    ids = {(r['kind'], r['source_id']): r['app_id'] for r in mappings}
    statements, notes = [], []
    for season in bundle['seasons']:
        sid = ids['season', season['source_id']]
        teams = {c['source_id']: c for c in season['clubs']}
        matches = season['matches']

        def winner(m):
            if m['status'] != 'completed' or m['home_score'] == m['away_score']:
                return None
            return m['home'] if m['home_score'] > m['away_score'] else m['away']

        semis = [m for m in matches if m['stage'] == 'semi_final' and winner(m)]
        winners = {winner(m) for m in semis}
        if len(semis) != 2 or len(winners) != 2:
            raise ValueError('Cannot establish two semi-final winners')
        finals = [m for m in matches if m['stage'] == 'final']
        final = [m for m in finals if {m['home'], m['away']} == winners]
        if len(final) != 1:
            raise ValueError('Cannot uniquely establish final from semi-final winners')
        final = final[0]
        losers = {m['away'] if winner(m) == m['home'] else m['home'] for m in semis}
        for other in finals:
            if other is final:
                continue
            if {other['home'], other['away']} != losers:
                raise ValueError('Extra final is not between semi-final losers')
            mid = ids['match', other['source_id']]
            statements.append(f"update public.matches set stage='third_place',decision_note=decision_note||' Classified as third-place match: both clubs lost their semi-finals.' where id={mid} and season_id={sid};")
            notes.append(f"{season['year']}: {other['source_id']} is third place, inferred from semi-final losers. Original source label remains in the export.")
        ordered_semis = [next(m for m in semis if winner(m) == team) for team in (final['home'], final['away'])]
        quarters = []
        for semi in ordered_semis:
            for team in (semi['home'], semi['away']):
                found = [m for m in matches if m['stage'] == 'quarter_final' and winner(m) == team]
                if len(found) != 1:
                    raise ValueError('Cannot uniquely establish quarter-final ancestry')
                quarters.append(found[0])

        def slot(team, slot_id):
            club = teams[team]
            return {'slotId': slot_id, 'teamId': ids['team', season['source_id'] + ':' + team],
                    'teamName': club['name'], 'teamLogo': club['logo_url'], 'teamColor': '#63e35b'}

        rounds = []
        for ri, (name, fixtures) in enumerate([('Quarter-finals', quarters), ('Semi-finals', ordered_semis), ('Grand Final', [final])]):
            ties = []
            for mi, m in enumerate(fixtures):
                slot1, slot2 = f'r{ri}_m{mi}_s1', f'r{ri}_m{mi}_s2'
                won = winner(m)
                ties.append({'matchId': f'r{ri}_m{mi}', 'label': f'{name} #{mi + 1}',
                             'slot1': slot(m['home'], slot1), 'slot2': slot(m['away'], slot2),
                             'winnerSlotId': slot1 if won == m['home'] else slot2,
                             'winnerTeamId': ids['team', season['source_id'] + ':' + won],
                             'resultMatchId': ids['match', m['source_id']]})
                pair = sorted([ties[-1]['slot1']['teamId'], ties[-1]['slot2']['teamId']])
                key = f"knockout:r{ri}_m{mi}:{pair[0]}:{pair[1]}"
                statements.append(f"update public.matches set fixture_key='{key}' where id={ids['match', m['source_id']]} and season_id={sid};")
            rounds.append({'roundIndex': ri, 'roundName': name, 'matches': ties})
        bracket = {'teamCount': 8, 'rounds': rounds, 'championSlot': slot(winner(final), 'champion_slot')}
        raw = json.dumps(bracket, ensure_ascii=False, separators=(',', ':')).replace("'", "''")
        statements.append(f"update public.seasons set bracket='{raw}'::jsonb,status='published' where id={sid} and status='draft';")
        notes.append(f"{season['year']}: quarter-final onward tree follows recorded winners; earlier qualifying fixtures remain in Fixtures.")
    sql = """begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
lock table public.seasons,public.matches in share row exclusive mode;
do $guard$ begin
 if (select count(*) from public.seasons)<>4 then raise exception 'Expected exactly current ICC 2026 and three archive seasons'; end if;
 if (select count(*) from public.matches)<>63 then raise exception 'Unexpected fixture count'; end if;
 if not exists(select 1 from public.seasons where id=1793259361662 and name='ICC 2026' and status='published') then raise exception 'Protected current season changed'; end if;
end $guard$;
""" + '\n'.join(statements) + """
set constraints all immediate;
do $verify$ begin
 if (select count(*) from public.seasons where status='published')<>4 then raise exception 'Not all ICC seasons published'; end if;
 if not exists(select 1 from public.articles where id=11 and season_id=1793259361662 and title='DRAW CEREMONY' and status='published') then raise exception 'Protected story changed'; end if;
end $verify$;
select jsonb_build_object('seasons',(select jsonb_agg(jsonb_build_object('id',id,'name',name,'year',year,'status',status,'champion',bracket->'championSlot'->>'teamName') order by year) from public.seasons),'fixtures',(select count(*) from public.matches),'third_place_matches',(select count(*) from public.matches where stage='third_place')) as published_icc;
rollback;
"""
    output.write_text(sql)
    output.with_suffix('.notes.txt').write_text('\n'.join(notes) + '\n')
    print(json.dumps({'script': str(output), 'notes': notes}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('review', type=Path)
    p.add_argument('mapped', type=Path)
    p.add_argument('output', type=Path)
    a = p.parse_args()
    finish(a.review, a.mapped, a.output)

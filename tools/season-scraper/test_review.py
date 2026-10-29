import contextlib
import csv
import io
import json
import tempfile
import unittest
from pathlib import Path

from review import summarize


class ReviewTests(unittest.TestCase):
    def test_participation_preserves_both_clubs_after_a_transfer(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder)
            (output / 'details' / 'mac').mkdir(parents=True)
            for mid, tid, name in [('1', '2', 'ALPHA'), ('2', '3', 'BRAVO')]:
                record = {'id': mid, 'source_url': 'https://arsiv.cclcup.com/mac-' + mid + '-test.html',
                          'season_ids': ['1'], 'teams': [{'id': tid, 'name': name}],
                          'events': [], 'review_flags': [], 'images': [], 'media_urls': [],
                          'lineup': [{'player_id': '9', 'player_name': 'PLAYER', 'team_name': name}]}
                (output / 'details' / 'mac' / (mid + '.json')).write_text(json.dumps(record))
            with contextlib.redirect_stdout(io.StringIO()):
                summarize(output)
            with (output / 'observed-squads.csv').open(encoding='utf-8-sig') as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual({r['club_id'] for r in rows}, {'2', '3'})
            self.assertEqual({r['player_id'] for r in rows}, {'9'})
            self.assertTrue(all('mac-' in r['evidence_match_urls'] for r in rows))

    def test_ambiguous_club_names_do_not_create_an_assumed_membership(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder)
            (output / 'details' / 'mac').mkdir(parents=True)
            record = {'id': '1', 'source_url': 'https://arsiv.cclcup.com/mac-1-test.html',
                      'season_ids': ['1'], 'teams': [{'id': '2', 'name': 'CLUB'}, {'id': '3', 'name': 'CLUB'}],
                      'events': [], 'review_flags': [], 'images': [], 'media_urls': [],
                      'lineup': [{'player_id': '9', 'player_name': 'PLAYER', 'team_name': 'CLUB'}]}
            (output / 'details' / 'mac' / '1.json').write_text(json.dumps(record))
            with contextlib.redirect_stdout(io.StringIO()):
                summarize(output)
            with (output / 'observed-squads.csv').open(encoding='utf-8-sig') as handle:
                self.assertEqual(list(csv.DictReader(handle)), [])


if __name__ == '__main__':
    unittest.main()

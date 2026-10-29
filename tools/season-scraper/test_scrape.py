import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from concurrent.futures import ThreadPoolExecutor

import scrape as s


def response(html, path='mac-1-test.html'):
    return {'html': html, 'url': s.BASE + path, 'final_url': s.BASE + path,
            'fetched_at': '2026-10-12T00:00:00Z', 'sha256': 'test'}


class ScraperTests(unittest.TestCase):
    def test_source_database_error_and_blank_lineups_are_reported(self):
        html = '''<div class="stage"><div id="tab3"><h4>HOME</h4><table><tr><td><a href="oyuncu--.html"></a></td><td><strong></strong> / </td></tr></table></div>
        <p>Sorgu Hatalı: this is incompatible with sql_mode=only_full_group_by</p></div>'''
        result = s.match_details(response(html), ['5'])
        self.assertEqual(result['events'], [])
        self.assertIsNone(result['lineup'][0]['player_id'])
        self.assertIn('Source page reports a database query error', result['data_gaps'])
        self.assertIn('Source lineup has no identified players', result['data_gaps'])

    def test_accented_profile_url_is_encoded_for_http(self):
        with tempfile.TemporaryDirectory() as folder:
            client = s.Client(Path(folder), delay=0)
            class Reply:
                status = 200
                url = s.BASE + 'oyuncu-45-milan-dohnansk%C3%BD.html'
                headers = type('Headers', (), {'get_content_charset': lambda self: 'utf-8'})()
                def read(self, limit):
                    return b'<html></html>'
                def __enter__(self):
                    return self
                def __exit__(self, *args):
                    return False
            with patch.object(client.opener, 'open', return_value=Reply()) as opened:
                client.network(s.BASE + 'oyuncu-45-milan-dohnanský.html')
                self.assertIn('dohnansk%C3%BD', opened.call_args.args[0].full_url)

    def test_redirect_cannot_mix_independent_archive_installations(self):
        try:
            s.configure_source('https://arsiv.cclcup.com/internationalcorporatecup/')
            with tempfile.TemporaryDirectory() as folder:
                client = s.Client(Path(folder))
                with patch.object(client, 'network', return_value={'final_url': 'https://arsiv.cclcup.com/mac-1-other.html'}):
                    with self.assertRaisesRegex(ValueError, 'selected archive'):
                        client.fetch(s.BASE + 'mac-1-test.html', 'detail')
                self.assertFalse((Path(folder) / 'cache').exists())
        finally:
            s.configure_source('https://arsiv.cclcup.com/')

    def test_international_source_does_not_mix_root_archive_ids(self):
        try:
            s.configure_source('https://arsiv.cclcup.com/internationalcorporatecup/')
            self.assertEqual(s.entity_id(s.canonical('mac-45-test.html')), '45')
            self.assertIsNone(s.canonical('https://arsiv.cclcup.com/mac-45-test.html'))
            doc = s.soup('<a href="/internationalcorporatecup/anasayfa?sezon=5">2024</a><a href="/anasayfa?sezon=1">Other archive</a>')
            self.assertEqual([x['id'] for x in s.season_links(doc, '7', 'Antalya')], ['5'])
            self.assertEqual(s.route_of(s.canonical('maclar')), 'maclar')
            self.assertIsNone(s.entity_id('https://arsiv.cclcup.com/mac-45-test.html'))
        finally:
            s.configure_source('https://arsiv.cclcup.com/')

    def test_legacy_links_only_rewrite_known_entity_routes(self):
        self.assertEqual(s.canonical('https://fifexcup.com/mac-40-final.html'), s.BASE + 'mac-40-final.html')
        self.assertIsNone(s.canonical('https://fifexcup.com/private'))
        self.assertIsNone(s.canonical('https://other.test/mac-40-final.html'))
        self.assertIsNone(s.canonical('javascript:alert(1)'))
        self.assertEqual(s.canonical('tum-haberler?&sayfa=2'), s.BASE + 'tum-haberler?sayfa=2')
        self.assertEqual(s.canonical('istatistikler?takim=0&kat=1'), s.BASE + 'istatistikler?kat=1&takim=0')
        self.assertEqual(s.entity_id(s.canonical('galeri-176.html'), 'galeri'), '176')
        self.assertEqual(s.entity_id(s.canonical('hafta-59-clip.html'), 'hafta'), '59')

    def test_only_published_season_links_are_discovered(self):
        doc = s.soup('<a href="anasayfa?sezon=20">Bahar</a><a href="anasayfa?sezon=4">Final</a><a href="anasayfa?sezon=oops">Invalid</a>')
        self.assertEqual([x['id'] for x in s.season_links(doc, '6', 'Ankara')], ['20', '4'])

    def test_statistics_options_survive_but_signup_forms_do_not(self):
        doc = s.soup('<div class="stage"><form><select><option value="istatistikler?kat=1&takim=0">Gol</option></select></form><form><input name="phone"></form></div>')
        root = s.content(doc)
        self.assertEqual(len(s.links_from(root, s.BASE)), 1)
        self.assertIsNone(root.select_one('input'))

    def test_fixture_groups_rounds_and_turkish_dates(self):
        html = '''<div class="stage"><div class="itab-area"><div class="itab-head"><a data-active="1">Gruplar</a></div>
        <div class="itab-in" data-active-in="1"><div class="gtabs-area"><div class="gtab-head"><a data-active="a">A Grubu</a></div>
        <div class="gtab-in" data-active-in="a"><div class="wtabs-area"><div class="wtab-head"><a data-active="w">1. Hafta</a></div>
        <div class="wtab-in" data-active-in="w"><table><tr><td><table class="itable"><tr><td><a href="mac-1-home-away.html">HOME</a></td></tr></table></td>
        <td><div class="match-result"><a href="mac-1-home-away.html">2 - 1</a></div><div class="match-time">18 Mart2018 10:30</div></td>
        <td><table class="itable"><tr><td><a href="mac-1-home-away.html">AWAY</a></td></tr></table></td></tr></table></div></div></div></div></div></div></div>'''
        fixture = s.fixtures_from(response(html, 'maclar'), '1')[0]
        self.assertEqual((fixture['home_name'], fixture['away_name'], fixture['group'], fixture['round_raw']), ('HOME', 'AWAY', 'A Grubu', '1. Hafta'))
        self.assertEqual(fixture['kickoff'], '2018-03-18T10:30:00')
        self.assertIsNone(s.date_value('31 Şubat2018'))

    def test_english_homepage_group_labels(self):
        html = """<div class="stage"><div class="itab-area"><div class="itab-head"><a data-active="1">Group</a></div>
        <div class="itab-in" data-active-in="1"><div class="gtab-head"><a data-active="a">A Group</a></div>
        <div class="gtab-in" data-active-in="a"><table><tr>
        <td><table class="itable"><tr><td><a href="mac-1-home-away.html">HOME</a></td></tr></table></td>
        <td><div class="match-result"><a href="mac-1-home-away.html">2 - 1</a></div></td>
        <td><table class="itable"><tr><td><a href="mac-1-home-away.html">AWAY</a></td></tr></table></td>
        </tr></table></div></div></div></div>"""
        fixture = s.fixtures_from(response(html), '5')[0]
        self.assertEqual(fixture['group'], 'A Group')

    def test_homepage_standings_ignore_unrelated_headings(self):
        html = """<div class="stage"><h6>Facebook</h6><table><tr><td>Layout</td></tr></table>
        <div class="itab-in"><h6>A Group</h6><table><thead><tr><th>Team</th><th>P</th></tr></thead>
        <tbody><tr><td><a href="takim-2-home.html">1. HOME</a></td><td>6</td></tr></tbody></table></div></div>"""
        result = s.standings_from(response(html), '5')[0]
        self.assertEqual((result['group'], result['points']), ('A Group', 6))
        self.assertNotIn('goals_for', result)

    def test_match_events_and_recorded_lineup_are_not_current_roster(self):
        html = '''<div class="stage"><div class="useravatar"><a href="takim-2-home.html">HOME</a></div>
        <ul class="timeline"><li><h3 class="timeline-title">50+2'</h3><div class="timeline-body"><p>GOOOL <strong>PLAYER (HOME)</strong> penaltıdan attı.</p></div></li></ul>
        <div id="tab3"><h4>HOME</h4><table><tr><td><a href="oyuncu-9-player.html"><img src="images/player.jpg"></a></td><td><strong>PLAYER</strong> / Kaleci</td></tr></table></div></div>'''
        result = s.match_details(response(html), ['1'])
        self.assertEqual((result['events'][0]['minute'], result['events'][0]['extra_minute']), (50, 2))
        self.assertEqual(result['events'][0]['player_name'], 'PLAYER')
        self.assertEqual(result['lineup'][0]['player_id'], '9')
        self.assertEqual(result['lineup'][0]['position_raw'], 'Kaleci')
        self.assertIn('shootout', result['review_flags'][0])

    def test_standings_preserve_source_order_and_scores(self):
        html = '<div class="stage"><h6>A Grubu</h6><table><thead><tr><th>Takım</th><th>O</th><th>AV</th><th>P</th></tr></thead><tbody><tr><td><a href="takim-2-home.html">1. HOME</a></td><td>5</td><td>-2</td><td>12</td></tr></tbody></table></div>'
        result = s.standings_from(response(html), '1')[0]
        self.assertEqual((result['team_id'], result['group'], result['goal_difference']), ('2', 'A Grubu', -2))

    def test_cache_is_scoped_and_selector_always_runs(self):
        with tempfile.TemporaryDirectory() as folder:
            client = s.Client(Path(folder))
            with patch.object(client, 'network', side_effect=lambda url, data=None, **kwargs: {'html': str(data)}) as network:
                client.fetch(s.BASE + 'takimlar', 'season-1')
                client.fetch(s.BASE + 'takimlar', 'season-1')
                client.fetch(s.BASE + 'takimlar', 'season-2')
                self.assertEqual(network.call_count, 2)
                client.fetch(s.BASE + 'anasayfa', 'selector', fresh=True)
                client.fetch(s.BASE + 'anasayfa', 'selector', fresh=True)
                self.assertEqual(network.call_count, 4)

    def test_request_cap_stops_before_network(self):
        with tempfile.TemporaryDirectory() as folder:
            client = s.Client(Path(folder), max_pages=0)
            with self.assertRaises(s.PageLimit):
                client.network(s.BASE)

    def test_request_budget_is_global_across_workers(self):
        with tempfile.TemporaryDirectory() as folder:
            client = s.Client(Path(folder), delay=0, max_pages=1)
            class DummyResponse:
                status, url = 200, s.BASE
                headers = type('Headers', (), {'get_content_charset': lambda self: 'utf-8'})()
                def read(self, limit):
                    return b'<html></html>'
                def __enter__(self):
                    return self
                def __exit__(self, *args):
                    return False
            with patch.object(client.opener, 'open', return_value=DummyResponse()) as network:
                with ThreadPoolExecutor(max_workers=3) as pool:
                    results = [pool.submit(client.network, s.BASE) for _ in range(3)]
                    successes = 0
                    for result in results:
                        try:
                            result.result()
                            successes += 1
                        except s.PageLimit:
                            pass
                self.assertEqual(successes, 1)
                self.assertEqual(network.call_count, 1)

    def test_album_and_video_embeds_are_preserved(self):
        html = '<div class="stage"><a href="images/maclar/full.jpg"><img src="images/thumb.jpg"></a><iframe src="https://www.youtube.com/embed/example"></iframe><a href="https://drive.google.com/file/example">Document</a></div>'
        record = s.page_record(response(html, 'galeri-176.html'), 'album')
        self.assertIn(s.BASE + 'images/maclar/full.jpg', record['media_urls'])
        self.assertIn('https://www.youtube.com/embed/example', record['media_urls'])
        self.assertEqual(record['external_links'][0]['url'], 'https://drive.google.com/file/example')

    def test_csv_preserves_turkish_text_and_nested_evidence(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'review.csv'
            s.write_csv(path, [{'name': 'İzmir', 'links': ['a', 'b']}], ['name', 'links'])
            self.assertIn('İzmir', path.read_text(encoding='utf-8-sig'))

    def test_detail_worker_verifies_season_context_and_reuses_own_session(self):
        with tempfile.TemporaryDirectory() as folder:
            client = s.Client(Path(folder))
            client.selected_season = {'id': '1', 'city_id': '6', 'url': s.BASE + 'anasayfa?sezon=1'}
            client.selected_label = 'Ankara 2018 Bahar Sezonu'
            html = '<li class="dropdown active"><a>Ankara 2018 Bahar Sezonu</a></li>'
            with patch.object(client, 'network', return_value={'html': html}) as network:
                worker = client.detail_session()
                self.assertIsNot(worker, client.opener)
                self.assertIs(worker, client.detail_session())
                self.assertEqual(network.call_count, 2)
            client.worker_state.opener = None
            with patch.object(client, 'network', return_value={'html': '<li class="dropdown active"><a>Wrong season</a></li>'}):
                with self.assertRaisesRegex(ValueError, 'context mismatch'):
                    client.detail_session()


if __name__ == '__main__':
    unittest.main()

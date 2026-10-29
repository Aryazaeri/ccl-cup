import unittest

from bs4 import BeautifulSoup

from build_import import foot
from generate_icc_backfill import plain_text, q, unescape


class BackfillHelpersTest(unittest.TestCase):
    def test_both_footed(self):
        self.assertEqual([foot('Çift Ayak'), foot('Sol Ayak'), foot('Sağ Ayak'), foot('')], ['both', 'left', 'right', None])

    def test_double_escaped_entities(self):
        self.assertEqual(unescape('GOLF&amp;amp;SPORT'), 'GOLF&SPORT')

    def test_article_html_becomes_paragraphs(self):
        node = BeautifulSoup('<div class="content-text"><a style="display:none" href="x.jpg"><img src="x.jpg"></a>'
                             '<p>Day one<br>Photos: <a href="https://drive.google.com/f">PHOTOS</a></p><p>&amp;amp; more</p></div>',
                             'html.parser').div
        self.assertEqual(plain_text(node, 'https://arsiv.cclcup.com/x/h-1.html'),
                         'Day one\n\nPhotos: PHOTOS (https://drive.google.com/f)\n\n& more')

    def test_sql_quoting(self):
        self.assertEqual([q(None), q(True), q(7), q("Don't")], ['null', 'true', '7', "'Don''t'"])


if __name__ == '__main__':
    unittest.main()

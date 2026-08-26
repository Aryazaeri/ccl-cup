-- CCL Cup — 2026 demo season seed.
--
-- Applied to the live project (ref daxhvechjiahkfxccwym) on 24 August 2026.
-- Step 1 clears the competition tables, so re-running replaces the season
-- wholesale rather than accumulating duplicates. Cities and venues survive.
--
-- Contents: 8 clubs across 2 groups, 48 players, 12 fixtures (10 played),
-- 31 goals and 11 cards. Every event is attributed to a real squad member and
-- the goals sum exactly to each scoreline, so the top-scorer list reconciles
-- with the results rather than drifting from them.
--
-- Group A is deliberately engineered so the whole tie-break chain is visible
-- on screen: Marmara Holding and Nova Dynamics finish level on points (6), on
-- goal difference (+2) AND on goals scored (5). Only head-to-head separates
-- them - Marmara won the meeting 2-1 on 17 August - so a correct engine places
-- Marmara first. If that order ever flips the tie-break logic has regressed;
-- treat it as a live regression test for src/lib/standingsUtils.ts.

begin;

-- 1. Clear the previous scratch data (cities and venues are kept).
delete from public.match_events;
delete from public.matches;
delete from public.players;
delete from public.team_group_memberships;
delete from public.tournament_groups;
delete from public.teams;
delete from public.seasons;

-- 2. City and venues.
insert into public.cities (name, country_code) select 'Antalya', 'TR'
  where not exists (select 1 from public.cities where lower(name) = lower('Antalya'));
insert into public.venues (name, city_id) select 'Central Arena', id from public.cities where lower(name) = lower('Antalya')
  and not exists (select 1 from public.venues where lower(name) = lower('Central Arena'));
insert into public.venues (name, city_id) select 'Riverside Pitch', id from public.cities where lower(name) = lower('Antalya')
  and not exists (select 1 from public.venues where lower(name) = lower('Riverside Pitch'));
insert into public.venues (name, city_id) select 'Harbour Ground', id from public.cities where lower(name) = lower('Antalya')
  and not exists (select 1 from public.venues where lower(name) = lower('Harbour Ground'));

-- 3. Season.
insert into public.seasons (name, slug, full_name, year, city, season_type, group_count,
                            team_count, is_current, status, starts_on, ends_on)
values ('Corporate Champions League', 'ccl-2026-antalya', 'Antalya 2026 Corporate Champions League', 2026, 'Antalya',
        'group_league', 2, 8, true, 'published', date '2026-08-14', date '2026-09-15');

-- 4. Groups.
insert into public.tournament_groups (season_id, name, display_order)
select id, 'Group A', 0 from public.seasons where slug = 'ccl-2026-antalya';
insert into public.tournament_groups (season_id, name, display_order)
select id, 'Group B', 1 from public.seasons where slug = 'ccl-2026-antalya';


-- 5. Clubs.
insert into public.teams (season_id, name, slug, short_name, country_code, country_name, primary_color, secondary_color, manager_name, coach_name, tournament_format, group_name, is_published)
select s.id, v.name, v.slug, v.short_name, v.cc, v.country, v.primary_color, v.secondary_color, v.manager, v.coach, 'Champions Cup', v.grp, true
from public.seasons s,
(values
 ('NOVA DYNAMICS','nova-dynamics','NOV','TR','Turkey','#63e35b','#071525','Mehmet Özkan','Bülent Korkut','Group A'),
 ('MARMARA HOLDING','marmara-holding','MAR','TR','Turkey','#3f76ff','#ffffff','Selim Vardar','Okan Koç','Group A'),
 ('ATLAS LOGISTICS','atlas-logistics','ATL','NL','Netherlands','#ff5c5c','#071525','Robin van Dijk','Kees Jansen','Group A'),
 ('NORTHGATE SYSTEMS','northgate-systems','NOR','GB','United Kingdom','#8c9bad','#ffffff','David Sterling','Paul Gallagher','Group A'),
 ('BOSPHORUS SHIPPING','bosphorus-shipping','BOS','TR','Turkey','#00d2d3','#071525','Cemil Demir','Ali Tandoğan','Group B'),
 ('UNION WERKE','union-werke','UNI','DE','Germany','#f2c230','#1a1a1a','Hans Becker','Lukas Meyer','Group B'),
 ('IBERIA DATA','iberia-data','IBE','ES','Spain','#e2574c','#ffffff','Pablo Serrano','Nacho Ferrer','Group B'),
 ('LEVANT CAPITAL','levant-capital','LEV','FR','France','#7a5cff','#ffffff','Julien Rousseau','Marc Devaux','Group B')
) as v(name, slug, short_name, cc, country, primary_color, secondary_color, manager, coach, grp)
where s.slug = 'ccl-2026-antalya';

-- 6. Squads.
insert into public.players (team_id, full_name, shirt_number, position, strong_foot, birth_year, nationality, is_captain, active_seasons, is_published)
select t.id, v.pname, v.num, v.pos, v.foot, v.birth, t.country_code, v.cap, array['2026 - Corporate Champions League'], true
from (values
 ('NOVA DYNAMICS','Emre Yılmaz',10,'forward','right',1996,true),
 ('NOVA DYNAMICS','Can Demir',7,'midfielder','left',1998,false),
 ('NOVA DYNAMICS','Burak Kaya',4,'defender','right',1995,false),
 ('NOVA DYNAMICS','Mert Aksoy',1,'goalkeeper','right',1997,false),
 ('NOVA DYNAMICS','Sarp Güven',8,'midfielder','both',1999,false),
 ('NOVA DYNAMICS','Kaan Erdoğan',5,'defender','left',1994,false),
 ('MARMARA HOLDING','Tolga Çelik',9,'forward','right',1994,true),
 ('MARMARA HOLDING','Oğuzhan Kurt',8,'midfielder','right',1999,false),
 ('MARMARA HOLDING','Serdar Şahin',3,'defender','left',1993,false),
 ('MARMARA HOLDING','Alican Polat',1,'goalkeeper','right',2000,false),
 ('MARMARA HOLDING','Kadir Baran',5,'defender','right',1996,false),
 ('MARMARA HOLDING','Umut Arı',11,'forward','left',1998,false),
 ('ATLAS LOGISTICS','Volkan Karaca',10,'forward','right',1995,true),
 ('ATLAS LOGISTICS','Cem Güler',8,'midfielder','right',1997,false),
 ('ATLAS LOGISTICS','Lars de Jong',1,'goalkeeper','right',1996,false),
 ('ATLAS LOGISTICS','Daan Meijer',4,'defender','left',1994,false),
 ('ATLAS LOGISTICS','Bram Bakker',6,'midfielder','right',1998,false),
 ('ATLAS LOGISTICS','Sven Visser',9,'forward','right',1999,false),
 ('NORTHGATE SYSTEMS','Deniz Arslan',10,'midfielder','right',1998,true),
 ('NORTHGATE SYSTEMS','Oliver Brown',7,'forward','left',1999,false),
 ('NORTHGATE SYSTEMS','James Wilson',1,'goalkeeper','right',1995,false),
 ('NORTHGATE SYSTEMS','Harry Davies',3,'defender','right',1997,false),
 ('NORTHGATE SYSTEMS','Alper Yıldız',9,'forward','right',1996,false),
 ('NORTHGATE SYSTEMS','Thomas Reid',6,'midfielder','both',1993,false),
 ('BOSPHORUS SHIPPING','Kaan Tekin',9,'forward','right',1996,true),
 ('BOSPHORUS SHIPPING','Onur Eren',4,'defender','left',1994,false),
 ('BOSPHORUS SHIPPING','Tayfun Balcı',1,'goalkeeper','right',1995,false),
 ('BOSPHORUS SHIPPING','Murat Doğan',7,'midfielder','right',1997,false),
 ('BOSPHORUS SHIPPING','Eren Can',11,'forward','left',1999,false),
 ('BOSPHORUS SHIPPING','Yusuf Alp',5,'defender','right',1998,false),
 ('UNION WERKE','Kerem Aydın',11,'forward','right',1997,true),
 ('UNION WERKE','Sinan Öztürk',6,'midfielder','left',1995,false),
 ('UNION WERKE','Hakan Koç',5,'defender','right',1992,false),
 ('UNION WERKE','Markus Weber',1,'goalkeeper','right',1994,false),
 ('UNION WERKE','Felix Schneider',4,'defender','right',1998,false),
 ('UNION WERKE','Jonas Richter',9,'forward','left',1996,false),
 ('IBERIA DATA','Álvaro Nieto',9,'forward','right',1995,true),
 ('IBERIA DATA','Sergio Lama',8,'midfielder','left',1997,false),
 ('IBERIA DATA','Unai Prieto',1,'goalkeeper','right',1996,false),
 ('IBERIA DATA','Raúl Bermejo',4,'defender','right',1994,false),
 ('IBERIA DATA','Marc Solé',7,'midfielder','both',1999,false),
 ('IBERIA DATA','Iker Fuentes',11,'forward','right',1998,false),
 ('LEVANT CAPITAL','Théo Marchand',10,'forward','left',1996,true),
 ('LEVANT CAPITAL','Hugo Lambert',6,'midfielder','right',1998,false),
 ('LEVANT CAPITAL','Antoine Rey',1,'goalkeeper','right',1995,false),
 ('LEVANT CAPITAL','Nicolas Perrin',3,'defender','left',1993,false),
 ('LEVANT CAPITAL','Lucas Girard',8,'midfielder','right',1997,false),
 ('LEVANT CAPITAL','Enzo Blanc',9,'forward','right',1999,false)
) as v(club, pname, num, pos, foot, birth, cap)
join public.teams t on t.name = v.club;

insert into public.matches (season_id, group_id, home_team_id, away_team_id, venue_id, stage, kickoff_at, referee_name, home_score, away_score, match_status, publication_status)
select s.id, g.id, h.id, a.id, ve.id, 'group', v.ko, v.ref, v.hs, v.aw, v.st, 'published'
from (values
 ('NOVA DYNAMICS','NORTHGATE SYSTEMS','Group A','Central Arena',timestamptz '2026-08-14 19:00:00+03','Mehmet Ali Yılmaz',3,1,'completed'),
 ('MARMARA HOLDING','ATLAS LOGISTICS','Group A','Riverside Pitch',timestamptz '2026-08-14 21:00:00+03','Cüneyt Akın',3,0,'completed'),
 ('NOVA DYNAMICS','MARMARA HOLDING','Group A','Central Arena',timestamptz '2026-08-17 20:30:00+03','Serkan Çakar',1,2,'completed'),
 ('ATLAS LOGISTICS','NORTHGATE SYSTEMS','Group A','Harbour Ground',timestamptz '2026-08-18 19:00:00+03','Ahmet Taşçı',2,2,'completed'),
 ('NOVA DYNAMICS','ATLAS LOGISTICS','Group A','Central Arena',timestamptz '2026-08-20 20:30:00+03','Halil Umut Meler',1,0,'completed'),
 ('MARMARA HOLDING','NORTHGATE SYSTEMS','Group A','Riverside Pitch',timestamptz '2026-08-21 21:00:00+03','Cüneyt Akın',0,2,'completed'),
 ('BOSPHORUS SHIPPING','IBERIA DATA','Group B','Harbour Ground',timestamptz '2026-08-15 19:00:00+03','Ali Palabıyık',2,1,'completed'),
 ('UNION WERKE','LEVANT CAPITAL','Group B','Central Arena',timestamptz '2026-08-15 21:00:00+03','Zorbay Küçük',4,0,'completed'),
 ('BOSPHORUS SHIPPING','UNION WERKE','Group B','Harbour Ground',timestamptz '2026-08-19 20:30:00+03','Atilla Karaoğlan',1,1,'completed'),
 ('IBERIA DATA','LEVANT CAPITAL','Group B','Riverside Pitch',timestamptz '2026-08-22 19:00:00+03','Ali Palabıyık',3,2,'completed'),
 ('BOSPHORUS SHIPPING','LEVANT CAPITAL','Group B','Central Arena',timestamptz '2026-08-26 20:30:00+03','Zorbay Küçük',null::smallint,null::smallint,'scheduled'),
 ('UNION WERKE','IBERIA DATA','Group B','Riverside Pitch',timestamptz '2026-08-28 21:00:00+03','Atilla Karaoğlan',null::smallint,null::smallint,'scheduled')
) as v(home, away, grp, venue, ko, ref, hs, aw, st)
join public.seasons s on s.slug = 'ccl-2026-antalya'
join public.tournament_groups g on g.season_id = s.id and g.name = v.grp
join public.teams h on h.name = v.home
join public.teams a on a.name = v.away
join public.venues ve on lower(ve.name) = lower(v.venue);

insert into public.match_events (match_id, team_id, player_id, event_type, minute)
select m.id, t.id, p.id, v.kind, v.minute
from (values
 (timestamptz '2026-08-14 19:00:00+03','NOVA DYNAMICS','Emre Yılmaz','goal',12),
 (timestamptz '2026-08-14 19:00:00+03','NOVA DYNAMICS','Can Demir','goal',38),
 (timestamptz '2026-08-14 19:00:00+03','NORTHGATE SYSTEMS','Oliver Brown','goal',61),
 (timestamptz '2026-08-14 19:00:00+03','NOVA DYNAMICS','Emre Yılmaz','penalty_scored',77),
 (timestamptz '2026-08-14 19:00:00+03','NORTHGATE SYSTEMS','Harry Davies','yellow_card',55),
 (timestamptz '2026-08-14 21:00:00+03','MARMARA HOLDING','Tolga Çelik','goal',9),
 (timestamptz '2026-08-14 21:00:00+03','MARMARA HOLDING','Umut Arı','goal',45),
 (timestamptz '2026-08-14 21:00:00+03','MARMARA HOLDING','Tolga Çelik','goal',72),
 (timestamptz '2026-08-14 21:00:00+03','ATLAS LOGISTICS','Daan Meijer','yellow_card',66),
 (timestamptz '2026-08-17 20:30:00+03','MARMARA HOLDING','Tolga Çelik','goal',18),
 (timestamptz '2026-08-17 20:30:00+03','NOVA DYNAMICS','Sarp Güven','goal',44),
 (timestamptz '2026-08-17 20:30:00+03','MARMARA HOLDING','Oğuzhan Kurt','goal',89),
 (timestamptz '2026-08-17 20:30:00+03','NOVA DYNAMICS','Burak Kaya','yellow_card',62),
 (timestamptz '2026-08-17 20:30:00+03','MARMARA HOLDING','Kadir Baran','yellow_card',84),
 (timestamptz '2026-08-18 19:00:00+03','ATLAS LOGISTICS','Volkan Karaca','goal',22),
 (timestamptz '2026-08-18 19:00:00+03','NORTHGATE SYSTEMS','Alper Yıldız','goal',35),
 (timestamptz '2026-08-18 19:00:00+03','NORTHGATE SYSTEMS','Deniz Arslan','goal',58),
 (timestamptz '2026-08-18 19:00:00+03','ATLAS LOGISTICS','Sven Visser','goal',81),
 (timestamptz '2026-08-20 20:30:00+03','NOVA DYNAMICS','Emre Yılmaz','goal',67),
 (timestamptz '2026-08-20 20:30:00+03','ATLAS LOGISTICS','Cem Güler','yellow_card',74),
 (timestamptz '2026-08-20 20:30:00+03','ATLAS LOGISTICS','Daan Meijer','red_card',88),
 (timestamptz '2026-08-21 21:00:00+03','NORTHGATE SYSTEMS','Oliver Brown','goal',29),
 (timestamptz '2026-08-21 21:00:00+03','NORTHGATE SYSTEMS','Deniz Arslan','penalty_scored',70),
 (timestamptz '2026-08-21 21:00:00+03','MARMARA HOLDING','Serdar Şahin','yellow_card',41),
 (timestamptz '2026-08-15 19:00:00+03','BOSPHORUS SHIPPING','Kaan Tekin','goal',14),
 (timestamptz '2026-08-15 19:00:00+03','IBERIA DATA','Álvaro Nieto','goal',52),
 (timestamptz '2026-08-15 19:00:00+03','BOSPHORUS SHIPPING','Eren Can','goal',88),
 (timestamptz '2026-08-15 19:00:00+03','IBERIA DATA','Raúl Bermejo','yellow_card',63),
 (timestamptz '2026-08-15 21:00:00+03','UNION WERKE','Kerem Aydın','goal',8),
 (timestamptz '2026-08-15 21:00:00+03','UNION WERKE','Jonas Richter','goal',33),
 (timestamptz '2026-08-15 21:00:00+03','UNION WERKE','Kerem Aydın','goal',57),
 (timestamptz '2026-08-15 21:00:00+03','UNION WERKE','Sinan Öztürk','goal',79),
 (timestamptz '2026-08-19 20:30:00+03','UNION WERKE','Kerem Aydın','goal',27),
 (timestamptz '2026-08-19 20:30:00+03','BOSPHORUS SHIPPING','Kaan Tekin','goal',74),
 (timestamptz '2026-08-19 20:30:00+03','BOSPHORUS SHIPPING','Onur Eren','yellow_card',60),
 (timestamptz '2026-08-19 20:30:00+03','UNION WERKE','Hakan Koç','yellow_card',82),
 (timestamptz '2026-08-22 19:00:00+03','IBERIA DATA','Álvaro Nieto','goal',11),
 (timestamptz '2026-08-22 19:00:00+03','LEVANT CAPITAL','Théo Marchand','goal',24),
 (timestamptz '2026-08-22 19:00:00+03','IBERIA DATA','Iker Fuentes','goal',49),
 (timestamptz '2026-08-22 19:00:00+03','LEVANT CAPITAL','Enzo Blanc','goal',66),
 (timestamptz '2026-08-22 19:00:00+03','IBERIA DATA','Álvaro Nieto','goal',90),
 (timestamptz '2026-08-22 19:00:00+03','LEVANT CAPITAL','Nicolas Perrin','yellow_card',71)
) as v(ko, club, pname, kind, minute)
join public.matches m on m.kickoff_at = v.ko
join public.teams t on t.name = v.club
join public.players p on p.team_id = t.id and p.full_name = v.pname;

-- 9. Editorial.
insert into public.articles (season_id, title, slug, summary, body, category, status, published_at, is_headline)
select s.id, v.title, v.slug, v.summary, v.body, v.category, 'published', v.pub, v.headline
from public.seasons s,
(values
 ('Head-to-head decides it: Marmara edge Nova to top Group A',
  'head-to-head-decides-it-marmara-edge-nova-to-top-group-a',
  'Level on points, level on goal difference, level on goals scored — the group came down to the night the two met.',
  E'Group A finished in a dead heat by every ordinary measure. Marmara Holding and Nova Dynamics both closed on six points, both with a goal difference of plus two, both having scored five.\n\nThe separation came from 17 August, when Oğuzhan Kurt struck in the 89th minute at Central Arena to turn a one-all contest into a two-one win for Marmara. Under competition rules — points, then goal difference, then goals scored, then head-to-head — that late goal is what puts Marmara first and Nova second.\n\n"You play three matches and it comes down to one moment," said Marmara captain Tolga Çelik, joint leading scorer with three. "We will take it."',
  'match_report', timestamptz '2026-08-21 23:30:00+03', true),
 ('Union Werke set the pace in Group B with two to play',
  'union-werke-set-the-pace-in-group-b-with-two-to-play',
  'Four goals against Levant Capital and a hard-earned point at Harbour Ground leave the German side top on goal difference.',
  E'Union Werke lead Group B on goal difference after a commanding four-nil win over Levant Capital and a one-all draw with Bosphorus Shipping.\n\nKerem Aydın has three goals in two appearances and is level at the top of the scoring charts. Bosphorus match Union on points and will fancy their chances when the group concludes.\n\nTwo fixtures remain: Bosphorus host Levant Capital on 26 August, and Union Werke meet Iberia Data on 28 August in what may well decide first place.',
  'news', timestamptz '2026-08-22 12:00:00+03', false),
 ('Eight clubs, six nations, one cup: the 2026 season is under way',
  'eight-clubs-six-nations-one-cup-the-2026-season-is-under-way',
  'The Corporate Champions League returns to Antalya with a two-group format and a knockout stage to follow.',
  E'The 2026 Corporate Champions League opened in Antalya this month with eight clubs drawn into two groups of four.\n\nTurkey, the Netherlands, Great Britain, Germany, Spain and France are all represented. Every match is played across three venues — Central Arena, Riverside Pitch and Harbour Ground — with standings updating live as results are confirmed.\n\nThe group winners and runners-up advance to the knockout stage.',
  'announcement', timestamptz '2026-08-13 10:00:00+03', false)
) as v(title, slug, summary, body, category, pub, headline)
where s.slug = 'ccl-2026-antalya';

-- 10. Season group layout.
-- Mirrors the group membership into the season's `group_league` JSONB so the
-- group-league canvas opens pre-populated and computeGroupStandings() can take
-- its membership from the saved layout rather than falling back to group_name.
with ranked as (
  select t.group_name, t.id, t.name, t.logo_url, t.primary_color, t.country_code,
         row_number() over (partition by t.group_name order by t.name) as pos
  from public.teams t
), slots as (
  select group_name,
         jsonb_agg(jsonb_build_object(
           'position', pos,
           'teamId', id,
           'teamName', name,
           'teamLogo', logo_url,
           'teamColor', primary_color,
           'teamCountryCode', country_code
         ) order by pos) as slot_list
  from ranked group by group_name
), grouped as (
  select jsonb_agg(jsonb_build_object(
           'id', lower(replace(group_name, ' ', '_')),
           'name', group_name,
           'slots', slot_list
         ) order by group_name) as groups
  from slots
)
update public.seasons s
set group_league = jsonb_build_object('groupCount', 2, 'groups', g.groups)
from grouped g
where s.slug = 'ccl-2026-antalya';

commit;

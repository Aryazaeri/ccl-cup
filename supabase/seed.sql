-- Safe sample content for local development. Run after the initial migration.
insert into public.cities (name, country_code)
values ('Istanbul', 'TR')
on conflict (name) do nothing;

insert into public.seasons (city_id, name, slug, starts_on, ends_on, is_current, status)
select id, '2026 Season', '2026-season', '2026-08-01', '2026-10-31', true, 'published'
from public.cities where name = 'Istanbul'
on conflict (slug) do update set is_current = excluded.is_current, status = excluded.status;

insert into public.venues (city_id, name, address)
select id, venue.name, venue.address
from public.cities
cross join (values ('Central Arena', 'Istanbul'), ('Riverside Pitch', 'Istanbul')) as venue(name, address)
where cities.name = 'Istanbul'
on conflict (city_id, name) do nothing;

insert into public.teams (season_id, name, slug, primary_color, played, goal_difference, points)
select seasons.id, team.name, team.slug, team.color, team.played, team.gd, team.points
from public.seasons
cross join (values
  ('NOVA FC', 'nova-fc', '#63e35b', 3, 6, 9),
  ('MARMARA', 'marmara', '#3f76ff', 3, 2, 6),
  ('UNION', 'union', '#f2c230', 3, -1, 3),
  ('NORTHSIDE', 'northside', '#8c9bad', 3, -7, 0),
  ('ATLAS SK', 'atlas-sk', '#d7dce2', 0, 0, 0),
  ('BOSPHORUS', 'bosphorus', '#d7dce2', 0, 0, 0)
) as team(name, slug, color, played, gd, points)
where seasons.slug = '2026-season'
on conflict (season_id, slug) do nothing;

insert into public.matches (season_id, home_team_id, away_team_id, venue_id, stage, kickoff_at, match_status, publication_status)
select s.id, home.id, away.id, v.id, 'group', '2026-08-16 20:30:00+03', 'scheduled', 'published'
from public.seasons s
join public.teams home on home.season_id = s.id and home.slug = 'nova-fc'
join public.teams away on away.season_id = s.id and away.slug = 'atlas-sk'
join public.venues v on v.name = 'Central Arena'
where s.slug = '2026-season'
  and not exists (select 1 from public.matches where season_id = s.id and home_team_id = home.id and away_team_id = away.id and kickoff_at = '2026-08-16 20:30:00+03');

insert into public.articles (season_id, title, slug, summary, category, status, published_at)
select id, article.title, article.slug, article.summary, article.category, 'published', now()
from public.seasons
cross join (values
  ('A night decided in the final minute', 'night-decided-final-minute', 'A stoppage-time strike sealed all three points.', 'match_report'),
  ('Quarter-final draw confirmed', 'quarter-final-draw-confirmed', 'The route to the final is set.', 'news'),
  ('Meet the captains: voices from the pitch', 'meet-the-captains', 'The leaders share their tournament ambitions.', 'news')
) as article(title, slug, summary, category)
where seasons.slug = '2026-season'
on conflict (slug) do nothing;


-- Restore row-level security.
--
-- Migration 202608160001 added `<table>_all_access` policies defined as
-- `using (true) with check (true)` to seasons, teams, players, matches and
-- articles "for development". Postgres combines permissive policies with OR,
-- so those five policies overrode every carefully-scoped staff policy beside
-- them: any holder of the public anon key — that is, anyone who loads the
-- site — could read, insert, update and delete every row in those tables.
--
-- The original per-role policies from 202608150001 were never removed, so
-- dropping the overrides is enough to put the designed model back in force:
--   anon           → read published content only
--   match_operator → teams, players, fixtures, events
--   editor         → articles, media, sponsors
--   admin          → the above plus seasons, cities, venues, user roles
--   super_admin    → everything, and the only role that can grant super_admin

drop policy if exists "seasons_all_access" on public.seasons;
drop policy if exists "teams_all_access" on public.teams;
drop policy if exists "players_all_access" on public.players;
drop policy if exists "matches_all_access" on public.matches;
drop policy if exists "articles_all_access" on public.articles;

-- Saving a fixture at a new ground creates the venue, and a venue requires a
-- city. Venues and groups already allow match operators; cities did not, which
-- would have made that path fail for exactly the role that uses it most.
drop policy if exists "competition_staff_manage_cities" on public.cities;
create policy "competition_staff_manage_cities" on public.cities
  for all
  using ((select public.is_staff(array['super_admin', 'admin', 'match_operator'])))
  with check ((select public.is_staff(array['super_admin', 'admin', 'match_operator'])));

-- `seasons_public_read` requires status = 'published', but every existing row
-- was left at the 'draft' default, so the public site would show no seasons at
-- all once the override is gone. The admin panel now writes this column; this
-- backfills what is already there.
update public.seasons set status = 'published' where status = 'draft';

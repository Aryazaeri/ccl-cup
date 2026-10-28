-- Replace only the exact audited default rules; preserve administrator-written
-- text. Public copy changes are part of the reviewable production rollout.
update public.site_settings set rules=array[
'A club needs at least five players when entering a tournament. There is no squad maximum; the minimum applies only at entry.',
'A win earns three points, a draw one point per club, and a loss zero.',
'Ties use head-to-head mini-tables, reapplied to remaining tied clubs, then overall goal difference, goals scored, fewer forfeits, and lower disciplinary points (yellow 1, red 3). Staff records the drawing-of-lots order if still tied.',
'Club transfers are locked after the tournament’s first match kicks off. New players may still register; earlier match records keep their original attribution.',
'Matches use eight players per side including a goalkeeper, with at least six to start. Play stops below five players and staff decides the outcome.',
'Match duration is two 25-minute halves plus stoppage time. Drawn knockout matches go directly to penalties; there is no extra time.',
'Up to five outfield substitutions and one goalkeeper substitution are allowed. A substituted player cannot return.',
'Staff assigns tournament-only suspensions case by case. There is no automatic yellow-card accumulation ban.',
'Normal scores are calculated from goals attributed to registered tournament squad players. Administrative forfeits are recorded separately as 3–0.'] where rules=array['Each club registers at least five players, and its squad may not drop below five during the season.','Group stage points: three for a win, one for a draw.','Ties are separated by goal difference, then goals scored, then head-to-head.','A player plays for one club at a time. Transfers during a season are allowed; goals, cards and match squads already recorded stay with the club the player played for.'];

-- Parent archive visibility also covers sponsor metadata.
drop policy sponsors_public_read on public.sponsors;
create policy sponsors_public_read on public.sponsors for select to anon,authenticated
 using(is_active and (season_id is null or public.is_published_season(season_id)));

create or replace function public.asset_is_referenced(object_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select not public.can_manage_asset(object_name)
   or exists(select 1 from public.teams where public.asset_object_path(logo_url)=object_name)
   or exists(select 1 from public.clubs where public.asset_object_path(profile->>'logoUrl')=object_name)
   or exists(select 1 from public.players where public.asset_object_path(photo_url)=object_name)
   or exists(select 1 from public.articles where public.asset_object_path(cover_image_url)=object_name)
   or exists(select 1 from public.media_assets where public.asset_object_path(thumbnail_url)=object_name or public.asset_object_path(external_url)=object_name)
   or exists(select 1 from public.sponsors where public.asset_object_path(logo_url)=object_name)
   or exists(select 1 from public.seasons s cross join lateral
      jsonb_path_query(jsonb_build_array(s.bracket,s.league,s.group_league),'$.**.teamLogo') ref
      where public.asset_object_path(ref #>> '{}')=object_name)
$$;
notify pgrst,'reload schema';

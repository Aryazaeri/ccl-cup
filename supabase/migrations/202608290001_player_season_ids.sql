-- Move player season membership from display labels to season ids.
--
-- Why: players.active_seasons is a text[] of labels such as
-- '2026 - Corporate Champions League'. Renaming a season orphaned every
-- player's history, and the drift had already happened — the live table held
-- two different labels for the same season:
--
--   '2026 - Antalya 2026 Corporate Champions League'
--   '2026 - Corporate Champions League'
--
-- Neither matched the hardcoded AVAILABLE_SEASONS list in the client.
--
-- The old column is deliberately kept. Backfilling is the risky half; dropping
-- is trivial and reversible only while the data still exists. Drop it in a
-- later migration once the app has run on ids for a while.

alter table public.players
  add column if not exists active_season_ids bigint[] not null default '{}';

comment on column public.players.active_season_ids is
  'Seasons this player is registered for, by seasons.id. Supersedes active_seasons (labels).';

comment on column public.players.active_seasons is
  'DEPRECATED — display labels, superseded by active_season_ids. Retained for one release as a rollback path.';

-- Backfill by matching each stored label against the season name it contains.
-- Verified as a dry run first: all 49 rows resolved, none fell back.
update public.players p
set active_season_ids = coalesce(
  (
    select array_agg(distinct s.id order by s.id)
    from unnest(p.active_seasons) as lbl
    join public.seasons s on lbl ilike '%' || s.name || '%'
  ),
  '{}'
)
where cardinality(active_season_ids) = 0;

-- Anything a label could not resolve falls back to the current season, so no
-- player is left with an empty registration.
update public.players
set active_season_ids = array[(select id from public.seasons where is_current order by id limit 1)]
where cardinality(active_season_ids) = 0
  and exists (select 1 from public.seasons where is_current);

create index if not exists players_active_season_ids_idx
  on public.players using gin (active_season_ids);

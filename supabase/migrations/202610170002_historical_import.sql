-- One-off import of the old site's seasons (arsiv.cclcup.com), football data
-- only. Each call imports one season in one transaction, as a hidden draft.
--
-- import.source_map remembers which archive record became which row, so a
-- season cannot be imported twice and later imports reuse clubs and players.
-- import.source_standings keeps the archive's published tables, to check the
-- standings the app computes from the imported results.
--
-- Scores are the archive's displayed scores. Shootout kicks (penalties logged
-- at minute 50+ in knockout matches) are not imported as goals; the review
-- report lists those matches. Drop public.import_historical_season once the
-- import is finished.

create schema if not exists import;
revoke all on schema import from public, anon, authenticated;

create table import.source_map (
  kind text not null,          -- season | club | team | player | match
  source_id text not null,
  app_id bigint not null,
  imported_at timestamptz not null default now(),
  primary key (kind, source_id)
);

create table import.source_standings (
  season_source_id text not null,
  group_name text not null,
  club_source_id text not null,
  played int, won int, drawn int, lost int, goals_for int, goals_against int, points int,
  primary key (season_source_id, group_name, club_source_id)
);

-- The archive has no recorded lineups for a few clubs that did play (SİNTEK in
-- two seasons). The five-player rule is waived only inside the import's own
-- transaction; everywhere else it applies as before.
create or replace function public.enforce_min_squad() returns trigger
language plpgsql set search_path to 'public' as $$
declare
  checked_team bigint;
  squad_size int;
  club_name text;
begin
  if current_setting('ccl.historical_import', true) = 'on' then
    return null;
  end if;
  -- OLD/NEW have different shapes per table, so branch before touching fields.
  if tg_table_name = 'teams' then
    checked_team := new.id;
  elsif tg_op = 'UPDATE' and new.team_id = old.team_id then
    return null;
  else
    checked_team := old.team_id;
  end if;
  select name into club_name from teams where id = checked_team;
  if not found then return null; end if; -- the entry itself was deleted
  select count(*) into squad_size from squad_memberships where team_id = checked_team;
  if squad_size < 5 then
    raise exception '% needs at least five players in its squad (it would have %).', club_name, squad_size
      using errcode = '23514';
  end if;
  return null;
end $$;

create function public.import_historical_season(payload jsonb, dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public, import
as $$
declare
  src text := payload->>'source_id';
  v_season bigint;
  v_id bigint;
  c jsonb; p jsonb; m jsonb; e jsonb; g jsonb; s jsonb; l jsonb;
  team_of jsonb := '{}';     -- club source id -> team id (this season)
  player_of jsonb := '{}';   -- player source id -> player id
  group_of jsonb := '{}';    -- group name -> tournament_groups id
  layout jsonb := '[]';
  slots jsonb;
  pos int;
  n_clubs int := 0; n_new_clubs int := 0; n_players int := 0; n_new_players int := 0;
  n_members int := 0; n_matches int := 0; n_events int := 0; n_lineups int := 0;
  summary jsonb;
begin
  if not public.is_staff(array['super_admin']) then
    raise exception 'Only a super admin can import historical seasons.';
  end if;
  if exists (select 1 from source_map where kind = 'season' and source_id = src) then
    raise exception 'Archive season % is already imported.', src;
  end if;
  perform set_config('ccl.historical_import', 'on', true);  -- this transaction only

  insert into seasons (name, slug, full_name, city, year, season_type, group_count, starts_on, ends_on, status, is_current)
  values (payload->>'name', payload->>'slug', payload->>'full_name', payload->>'city', (payload->>'year')::smallint,
          payload->>'season_type', nullif(jsonb_array_length(payload->'groups'), 0),
          (payload->>'starts_on')::date, (payload->>'ends_on')::date, 'draft', false)
  returning id into v_season;
  insert into source_map values ('season', src, v_season);

  -- Clubs: reuse a mapped club, then one with the same name, else create it.
  for c in select * from jsonb_array_elements(payload->'clubs') loop
    select app_id into v_id from source_map where kind = 'club' and source_id = c->>'source_id';
    if v_id is null then
      select id into v_id from clubs where upper(name) = upper(c->>'name') order by id limit 1;
      if v_id is null then
        insert into clubs (name) values (c->>'name') returning id into v_id;
        n_new_clubs := n_new_clubs + 1;
      end if;
      insert into source_map values ('club', c->>'source_id', v_id);
    end if;
    insert into teams (season_id, club_id, name, slug, short_name, country_code, country_name, primary_color,
                       logo_url, tournament_format, group_name, is_published)
    values (v_season, v_id, c->>'name', c->>'slug', left(c->>'name', 3), 'TR', 'Turkey', '#63e35b',
            c->>'logo_url', payload->>'full_name', c->>'group_name', true)
    returning id into v_id;
    insert into source_map values ('team', src || ':' || (c->>'source_id'), v_id);
    team_of := team_of || jsonb_build_object(c->>'source_id', v_id);
    n_clubs := n_clubs + 1;
  end loop;

  -- Players: one row per archive profile, shared across seasons.
  for p in select * from jsonb_array_elements(payload->'players') loop
    select app_id into v_id from source_map where kind = 'player' and source_id = p->>'source_id';
    if v_id is null then
      insert into players (full_name, position, strong_foot, height_cm, weight_kg, photo_url, is_published)
      values (p->>'full_name', p->>'position', p->>'strong_foot', (p->>'height_cm')::smallint,
              (p->>'weight_kg')::smallint, p->>'photo_url', true)
      returning id into v_id;
      insert into source_map values ('player', p->>'source_id', v_id);
      n_new_players := n_new_players + 1;
    end if;
    player_of := player_of || jsonb_build_object(p->>'source_id', v_id);
    n_players := n_players + 1;
  end loop;

  -- Squads: the players recorded in this club's match lineups this season.
  for s in select * from jsonb_array_elements(payload->'squads') loop
    insert into squad_memberships (player_id, team_id, season_id)
    select (player_of->>x)::bigint, (team_of->>(s->>'club'))::bigint, v_season
    from jsonb_array_elements_text(s->'players') x;
    get diagnostics pos = row_count;
    n_members := n_members + pos;
  end loop;

  -- Groups: tournament_groups rows for fixtures, and the draw for the tables.
  pos := 0;
  for g in select * from jsonb_array_elements(payload->'groups') loop
    pos := pos + 1;
    insert into tournament_groups (season_id, name, display_order) values (v_season, g->>'name', pos) returning id into v_id;
    group_of := group_of || jsonb_build_object(g->>'name', v_id);
    select coalesce(jsonb_agg(jsonb_build_object(
             'position', ord, 'teamId', (team_of->>club)::bigint,
             'teamName', (select name from teams where id = (team_of->>club)::bigint),
             'teamColor', '#63e35b', 'teamCountryCode', 'TR') order by ord), '[]')
      into slots
      from jsonb_array_elements_text(g->'clubs') with ordinality as t(club, ord);
    layout := layout || jsonb_build_array(jsonb_build_object('id', 'group_' || lower(right(g->>'name', 1)), 'name', g->>'name', 'slots', slots));
  end loop;
  if jsonb_array_length(layout) > 0 then
    update seasons set group_league = jsonb_build_object('groupCount', jsonb_array_length(layout), 'groups', layout) where id = v_season;
  end if;

  -- Matches: scheduled first, then the recorded lineup (so completing the match
  -- does not copy the whole season squad), the events, and the archive score.
  for m in select * from jsonb_array_elements(payload->'matches') loop
    insert into matches (season_id, group_id, home_team_id, away_team_id, stage, week, kickoff_at, match_status, publication_status)
    values (v_season, (group_of->>(m->>'group'))::bigint, (team_of->>(m->>'home'))::bigint, (team_of->>(m->>'away'))::bigint,
            m->>'stage', (m->>'week')::smallint, (m->>'kickoff_at')::timestamptz, 'scheduled', 'published')
    returning id into v_id;
    insert into source_map values ('match', m->>'source_id', v_id);

    for l in select * from jsonb_array_elements(m->'lineups') loop
      insert into match_squads (match_id, team_id, player_id, player_name)
      select v_id, (team_of->>(l->>0))::bigint, (player_of->>(l->>1))::bigint, pl.full_name
      from players pl where pl.id = (player_of->>(l->>1))::bigint
      on conflict do nothing;
      n_lineups := n_lineups + 1;
    end loop;

    for e in select * from jsonb_array_elements(m->'events') loop
      insert into match_events (match_id, team_id, player_id, player_name, event_type, minute, extra_minute, notes)
      values (v_id, (team_of->>(e->>'club'))::bigint, (player_of->>(e->>'player'))::bigint,
              case when e->>'player' is null then e->>'player_name' end,
              e->>'type', (e->>'minute')::smallint, (e->>'extra')::smallint, e->>'notes');
      n_events := n_events + 1;
    end loop;

    update matches set match_status = m->>'status',
      home_score = (m->>'home_score')::smallint, away_score = (m->>'away_score')::smallint
    where id = v_id;
    n_matches := n_matches + 1;
  end loop;

  insert into source_standings
  select src, r->>'group', r->>'club', (r->>'played')::int, (r->>'won')::int, (r->>'drawn')::int, (r->>'lost')::int,
         (r->>'goals_for')::int, (r->>'goals_against')::int, (r->>'points')::int
  from jsonb_array_elements(payload->'standings') r
  on conflict do nothing;

  summary := jsonb_build_object('season', payload->>'full_name', 'season_id', v_season, 'clubs', n_clubs,
    'new_clubs', n_new_clubs, 'players', n_players, 'new_players', n_new_players, 'squad_entries', n_members,
    'matches', n_matches, 'events', n_events, 'lineup_entries', n_lineups);

  if dry_run then
    set constraints all immediate;  -- run the deferred checks now
    raise exception 'DRY RUN OK %', summary::text;
  end if;
  return summary;
end $$;

revoke all on function public.import_historical_season(jsonb, boolean) from public, anon;
grant execute on function public.import_historical_season(jsonb, boolean) to authenticated;

-- Seasonal clubs and squads (audit backlog items 1, 3, 6).
--
-- A club is a lasting identity (public.clubs). Each existing teams row becomes
-- that club's entry for one season: matches, events, group memberships and
-- standings keep pointing at it, so every recorded score and attribution is
-- untouched. A player is one person across seasons; squad_memberships says which
-- season entry they play for, at most one per season (a transfer moves it).
--
-- players.team_id and players.active_season_ids are backfilled into
-- squad_memberships and no longer written by the app. They are left in place
-- until the new model is verified in production, then dropped separately.

/* ---- Clubs ------------------------------------------------------------- */

create table public.clubs (
  id bigint generated always as identity primary key,
  name text not null check (length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index clubs_name_unique on public.clubs (lower(trim(name)));
create trigger clubs_set_updated_at before update on public.clubs
  for each row execute function public.set_updated_at();

alter table public.clubs enable row level security;
create policy clubs_public_read on public.clubs for select using (true);
create policy competition_staff_manage_clubs on public.clubs for all to authenticated
  using ((select public.is_staff(array['super_admin', 'admin', 'match_operator'])))
  with check ((select public.is_staff(array['super_admin', 'admin', 'match_operator'])));

insert into public.clubs (name)
select distinct on (lower(trim(name))) trim(name) from public.teams order by lower(trim(name)), id;

alter table public.teams add column club_id bigint references public.clubs(id) on delete restrict;
update public.teams t set club_id = c.id from public.clubs c where lower(trim(t.name)) = lower(trim(c.name));
alter table public.teams alter column club_id set not null;
-- A club enters a season once; (id, season_id) lets memberships pin the season.
alter table public.teams add constraint teams_season_club_unique unique (season_id, club_id);
alter table public.teams add constraint teams_id_season_unique unique (id, season_id);
create index teams_club_idx on public.teams (club_id);

/* ---- Squads ------------------------------------------------------------ */

create table public.squad_memberships (
  id bigint generated always as identity primary key,
  player_id bigint not null references public.players(id) on delete cascade,
  team_id bigint not null,
  season_id bigint not null,
  created_at timestamptz not null default now(),
  constraint squad_memberships_team_fk foreign key (team_id, season_id)
    references public.teams (id, season_id) on delete cascade,
  constraint squad_memberships_one_club_per_season unique (player_id, season_id)
);
create index squad_memberships_team_idx on public.squad_memberships (team_id);

alter table public.squad_memberships enable row level security;
create policy squad_memberships_public_read on public.squad_memberships for select using (true);
create policy competition_staff_manage_squads on public.squad_memberships for all to authenticated
  using ((select public.is_staff(array['super_admin', 'admin', 'match_operator'])))
  with check ((select public.is_staff(array['super_admin', 'admin', 'match_operator'])));

insert into public.squad_memberships (player_id, team_id, season_id)
select p.id, t.id, t.season_id
from public.players p join public.teams t on t.id = p.team_id
where p.deleted_at is null;

-- The legacy link cascaded, so deleting a season entry deleted its players.
-- Players now outlive a season; deleting an entry only ends their squad places.
alter table public.players drop constraint players_team_id_fkey;
alter table public.players add constraint players_team_id_fkey
  foreign key (team_id) references public.teams(id) on delete set null;

/* ---- Five-player minimum ---------------------------------------------- */

-- Checked at commit, so a club entry and its squad can be written in one
-- transaction (create_season_entry). Only removals and new entries are
-- checked: adding a player never breaks the rule, and entries recorded before
-- this rule with fewer players can still grow.
create function public.enforce_min_squad() returns trigger
language plpgsql set search_path = public as $$
declare
  checked_team bigint;
  squad_size int;
  club_name text;
begin
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

create constraint trigger teams_min_squad after insert on public.teams
  deferrable initially deferred for each row execute function public.enforce_min_squad();
create constraint trigger squad_memberships_min_squad after delete or update on public.squad_memberships
  deferrable initially deferred for each row execute function public.enforce_min_squad();

/* ---- Creating a season entry ------------------------------------------ */

-- Creates (or reuses) the club, its entry for the season, any new players and
-- the whole squad in one transaction. Players already in another club this
-- season are transferred, which the minimum rule then checks for that club.
-- Runs as the caller, so the staff RLS policies above still apply.
create function public.create_season_entry(entry jsonb, player_ids bigint[], new_players jsonb default '[]')
returns bigint
language plpgsql security invoker set search_path = public as $$
declare
  entry_season bigint := (entry->>'season_id')::bigint;
  entry_club bigint := nullif(entry->>'club_id', '')::bigint;
  entry_id bigint;
  new_player jsonb;
  new_id bigint;
  all_ids bigint[] := coalesce(player_ids, '{}');
begin
  if entry_club is null then
    insert into clubs (name) values (trim(entry->>'name'))
    on conflict (lower(trim(name))) do update set updated_at = now()
    returning id into entry_club;
  end if;

  insert into teams (season_id, club_id, name, slug, short_name, country_code, country_name, primary_color,
                     secondary_color, logo_url, manager_name, coach_name, biography, tournament_format, group_name)
  values (entry_season, entry_club, trim(entry->>'name'), entry->>'slug', entry->>'short_name',
          coalesce(entry->>'country_code', 'TR'), coalesce(entry->>'country_name', 'Turkey'),
          coalesce(entry->>'primary_color', '#63e35b'), coalesce(entry->>'secondary_color', '#071525'),
          entry->>'logo_url', entry->>'manager_name', entry->>'coach_name', entry->>'biography',
          coalesce(entry->>'tournament_format', 'Champions Cup'), entry->>'group_name')
  returning id into entry_id;

  for new_player in select * from jsonb_array_elements(coalesce(new_players, '[]')) loop
    insert into players (full_name, shirt_number, position, nationality, birth_year)
    values (trim(new_player->>'full_name'), (new_player->>'shirt_number')::smallint,
            coalesce(new_player->>'position', 'forward'), coalesce(new_player->>'nationality', 'TR'),
            (new_player->>'birth_year')::smallint)
    returning id into new_id;
    all_ids := all_ids || new_id;
  end loop;

  insert into squad_memberships (player_id, team_id, season_id)
  select distinct unnest(all_ids), entry_id, entry_season
  on conflict (player_id, season_id) do update set team_id = excluded.team_id;

  return entry_id;
end $$;

grant execute on function public.create_season_entry(jsonb, bigint[], jsonb) to authenticated;

/* ---- Match-day squads -------------------------------------------------- */

-- The squads that were registered when a match was completed, so later
-- transfers do not rewrite old match pages. Names are kept in case a player
-- record is deleted, as match_events.player_name already does.
create table public.match_squads (
  match_id bigint not null references public.matches(id) on delete cascade,
  team_id bigint not null references public.teams(id) on delete cascade,
  player_id bigint references public.players(id) on delete set null,
  player_name text not null,
  shirt_number smallint,
  created_at timestamptz not null default now(),
  constraint match_squads_player_unique unique (match_id, player_id)
);
create index match_squads_match_idx on public.match_squads (match_id);

alter table public.match_squads enable row level security;
create policy match_squads_public_read on public.match_squads for select using (true);
create policy competition_staff_manage_match_squads on public.match_squads for all to authenticated
  using ((select public.is_staff(array['super_admin', 'admin', 'match_operator'])))
  with check ((select public.is_staff(array['super_admin', 'admin', 'match_operator'])));

create function public.snapshot_match_squads() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Only the first completion records the squads; re-saving a result keeps them.
  if new.match_status = 'completed' and not exists (select 1 from match_squads where match_id = new.id) then
    insert into match_squads (match_id, team_id, player_id, player_name, shirt_number)
    select new.id, m.team_id, p.id, p.full_name, p.shirt_number
    from squad_memberships m join players p on p.id = m.player_id
    where m.team_id in (new.home_team_id, new.away_team_id) and p.deleted_at is null
    on conflict do nothing;
  end if;
  return null;
end $$;

create trigger matches_snapshot_squads after insert or update of match_status on public.matches
  for each row execute function public.snapshot_match_squads();

-- Matches completed before this migration get today's squads: the closest
-- record available, since earlier squads were never stored.
insert into public.match_squads (match_id, team_id, player_id, player_name, shirt_number)
select mt.id, m.team_id, p.id, p.full_name, p.shirt_number
from public.matches mt
join public.squad_memberships m on m.team_id in (mt.home_team_id, mt.away_team_id)
join public.players p on p.id = m.player_id and p.deleted_at is null
where mt.match_status = 'completed'
on conflict do nothing;

-- CCL Cup initial schema
-- Apply with the Supabase CLI or paste into the Supabase SQL editor.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'viewer' check (role in ('super_admin', 'admin', 'editor', 'match_operator', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cities (
  id bigint generated always as identity primary key,
  name text not null unique,
  country_code text not null default 'TR' check (char_length(country_code) = 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.seasons (
  id bigint generated always as identity primary key,
  city_id bigint not null references public.cities(id) on delete restrict,
  name text not null,
  slug text not null unique,
  starts_on date not null,
  ends_on date not null,
  is_current boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seasons_valid_date_range check (ends_on >= starts_on),
  constraint seasons_city_name_unique unique (city_id, name)
);

create table public.venues (
  id bigint generated always as identity primary key,
  city_id bigint not null references public.cities(id) on delete restrict,
  name text not null,
  address text,
  map_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint venues_city_name_unique unique (city_id, name)
);

create table public.teams (
  id bigint generated always as identity primary key,
  season_id bigint not null references public.seasons(id) on delete cascade,
  name text not null,
  slug text not null,
  manager_name text,
  coach_name text,
  biography text,
  logo_url text,
  primary_color text not null default '#63e35b' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  played smallint not null default 0 check (played >= 0),
  goal_difference smallint not null default 0,
  points smallint not null default 0 check (points >= 0),
  is_published boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teams_season_slug_unique unique (season_id, slug),
  constraint teams_season_name_unique unique (season_id, name)
);

create table public.players (
  id bigint generated always as identity primary key,
  team_id bigint not null references public.teams(id) on delete cascade,
  full_name text not null,
  birth_year smallint check (birth_year between 1940 and 2100),
  strong_foot text check (strong_foot in ('left', 'right', 'both')),
  position text check (position in ('goalkeeper', 'defender', 'midfielder', 'forward')),
  height_cm smallint check (height_cm between 120 and 230),
  weight_kg smallint check (weight_kg between 35 and 180),
  biography text,
  photo_url text,
  shirt_number smallint check (shirt_number between 1 and 99),
  is_published boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tournament_groups (
  id bigint generated always as identity primary key,
  season_id bigint not null references public.seasons(id) on delete cascade,
  name text not null,
  display_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tournament_groups_season_name_unique unique (season_id, name)
);

create table public.team_group_memberships (
  id bigint generated always as identity primary key,
  group_id bigint not null references public.tournament_groups(id) on delete cascade,
  team_id bigint not null references public.teams(id) on delete cascade,
  displayed_rank smallint check (displayed_rank > 0),
  created_at timestamptz not null default now(),
  constraint team_group_memberships_unique unique (group_id, team_id)
);

create table public.matches (
  id bigint generated always as identity primary key,
  season_id bigint not null references public.seasons(id) on delete cascade,
  group_id bigint references public.tournament_groups(id) on delete set null,
  home_team_id bigint not null references public.teams(id) on delete restrict,
  away_team_id bigint not null references public.teams(id) on delete restrict,
  venue_id bigint references public.venues(id) on delete set null,
  stage text not null default 'group' check (stage in ('group', 'round_of_16', 'quarter_final', 'semi_final', 'third_place', 'final')),
  week smallint check (week > 0),
  kickoff_at timestamptz not null,
  referee_name text,
  home_score smallint check (home_score >= 0),
  away_score smallint check (away_score >= 0),
  match_status text not null default 'scheduled' check (match_status in ('scheduled', 'live', 'completed', 'postponed', 'cancelled')),
  publication_status text not null default 'draft' check (publication_status in ('draft', 'published')),
  pre_match_video_id text,
  title text,
  description text,
  match_info text,
  sharing_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matches_distinct_teams check (home_team_id <> away_team_id),
  constraint matches_score_pair check ((home_score is null) = (away_score is null))
);

create table public.match_events (
  id bigint generated always as identity primary key,
  match_id bigint not null references public.matches(id) on delete cascade,
  team_id bigint references public.teams(id) on delete set null,
  player_id bigint references public.players(id) on delete set null,
  event_type text not null check (event_type in ('goal', 'own_goal', 'yellow_card', 'red_card', 'substitution', 'penalty_scored', 'penalty_missed')),
  minute smallint not null check (minute between 0 and 150),
  extra_minute smallint check (extra_minute between 0 and 30),
  notes text,
  created_at timestamptz not null default now()
);

create table public.articles (
  id bigint generated always as identity primary key,
  season_id bigint references public.seasons(id) on delete set null,
  author_id uuid references public.profiles(id) on delete set null,
  title text not null,
  slug text not null unique,
  summary text,
  body text,
  category text not null default 'news' check (category in ('news', 'match_report', 'announcement', 'press', 'panorama', 'award')),
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published', 'archived')),
  is_headline boolean not null default false,
  cover_image_url text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint articles_published_date check (status <> 'published' or published_at is not null)
);

create table public.media_assets (
  id bigint generated always as identity primary key,
  season_id bigint references public.seasons(id) on delete set null,
  match_id bigint references public.matches(id) on delete set null,
  team_id bigint references public.teams(id) on delete set null,
  kind text not null check (kind in ('photo', 'video', 'highlight', 'press_conference', 'panorama', 'document')),
  title text not null,
  storage_path text,
  external_url text,
  thumbnail_url text,
  duration_seconds integer check (duration_seconds >= 0),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_assets_source check (storage_path is not null or external_url is not null)
);

create table public.sponsors (
  id bigint generated always as identity primary key,
  season_id bigint references public.seasons(id) on delete cascade,
  name text not null,
  logo_url text,
  website_url text,
  display_order smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  entity_type text not null,
  entity_id text not null,
  action text not null check (action in ('create', 'update', 'delete', 'publish', 'unpublish')),
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Foreign-key and high-traffic query indexes.
create index seasons_city_id_idx on public.seasons(city_id);
create unique index seasons_one_current_idx on public.seasons(city_id) where is_current;
create index venues_city_id_idx on public.venues(city_id);
create index teams_season_id_idx on public.teams(season_id) where deleted_at is null;
create index players_team_id_idx on public.players(team_id) where deleted_at is null;
create index tournament_groups_season_id_idx on public.tournament_groups(season_id);
create index team_group_memberships_group_id_idx on public.team_group_memberships(group_id);
create index team_group_memberships_team_id_idx on public.team_group_memberships(team_id);
create index matches_season_kickoff_idx on public.matches(season_id, kickoff_at);
create index matches_group_id_idx on public.matches(group_id);
create index matches_home_team_id_idx on public.matches(home_team_id);
create index matches_away_team_id_idx on public.matches(away_team_id);
create index matches_venue_id_idx on public.matches(venue_id);
create index matches_public_upcoming_idx on public.matches(kickoff_at) where publication_status = 'published' and match_status = 'scheduled';
create index match_events_match_minute_idx on public.match_events(match_id, minute, extra_minute);
create index match_events_team_id_idx on public.match_events(team_id);
create index match_events_player_id_idx on public.match_events(player_id);
create index articles_season_status_published_idx on public.articles(season_id, status, published_at desc);
create index articles_author_id_idx on public.articles(author_id);
create index media_assets_season_id_idx on public.media_assets(season_id);
create index media_assets_match_id_idx on public.media_assets(match_id);
create index media_assets_team_id_idx on public.media_assets(team_id);
create index sponsors_season_order_idx on public.sponsors(season_id, display_order);
create index audit_logs_actor_created_idx on public.audit_logs(actor_id, created_at desc);

-- Keep updated_at consistent.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['profiles', 'cities', 'seasons', 'venues', 'teams', 'players', 'tournament_groups', 'matches', 'articles', 'media_assets', 'sponsors']
  loop
    execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
  end loop;
end $$;

-- Create a locked-down profile for every new Auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), 'viewer')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_staff(required_roles text[] default array['super_admin', 'admin', 'editor', 'match_operator'])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and role = any(required_roles)
  );
$$;

create or replace function public.set_user_role(target_user_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff(array['super_admin', 'admin']) then
    raise exception 'Only administrators can change user roles';
  end if;
  if new_role not in ('super_admin', 'admin', 'editor', 'match_operator', 'viewer') then
    raise exception 'Invalid role';
  end if;
  if new_role = 'super_admin' and not public.is_staff(array['super_admin']) then
    raise exception 'Only a super administrator can grant that role';
  end if;
  update public.profiles set role = new_role where id = target_user_id;
end;
$$;

-- RLS is the security boundary for browser clients.
alter table public.profiles enable row level security;
alter table public.cities enable row level security;
alter table public.seasons enable row level security;
alter table public.venues enable row level security;
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.tournament_groups enable row level security;
alter table public.team_group_memberships enable row level security;
alter table public.matches enable row level security;
alter table public.match_events enable row level security;
alter table public.articles enable row level security;
alter table public.media_assets enable row level security;
alter table public.sponsors enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_read_own_or_staff on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_staff(array['super_admin', 'admin'])));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy profiles_admin_manage on public.profiles for all to authenticated
  using ((select public.is_staff(array['super_admin', 'admin'])))
  with check ((select public.is_staff(array['super_admin', 'admin'])));

create policy cities_public_read on public.cities for select to anon, authenticated using (true);
create policy seasons_public_read on public.seasons for select to anon, authenticated using (status = 'published');
create policy venues_public_read on public.venues for select to anon, authenticated using (is_active);
create policy teams_public_read on public.teams for select to anon, authenticated using (is_published and deleted_at is null);
create policy players_public_read on public.players for select to anon, authenticated using (is_published and deleted_at is null);
create policy groups_public_read on public.tournament_groups for select to anon, authenticated using (true);
create policy memberships_public_read on public.team_group_memberships for select to anon, authenticated using (true);
create policy matches_public_read on public.matches for select to anon, authenticated using (publication_status = 'published');
create policy events_public_read on public.match_events for select to anon, authenticated using (exists (select 1 from public.matches where matches.id = match_events.match_id and matches.publication_status = 'published'));
create policy articles_public_read on public.articles for select to anon, authenticated using (status = 'published' and published_at <= now());
create policy media_public_read on public.media_assets for select to anon, authenticated using (is_published);
create policy sponsors_public_read on public.sponsors for select to anon, authenticated using (is_active);

create policy competition_staff_manage_cities on public.cities for all to authenticated using ((select public.is_staff(array['super_admin', 'admin']))) with check ((select public.is_staff(array['super_admin', 'admin'])));
create policy competition_staff_manage_seasons on public.seasons for all to authenticated using ((select public.is_staff(array['super_admin', 'admin']))) with check ((select public.is_staff(array['super_admin', 'admin'])));
create policy competition_staff_manage_venues on public.venues for all to authenticated using ((select public.is_staff(array['super_admin', 'admin', 'match_operator']))) with check ((select public.is_staff(array['super_admin', 'admin', 'match_operator'])));
create policy competition_staff_manage_teams on public.teams for all to authenticated using ((select public.is_staff(array['super_admin', 'admin', 'match_operator']))) with check ((select public.is_staff(array['super_admin', 'admin', 'match_operator'])));
create policy competition_staff_manage_players on public.players for all to authenticated using ((select public.is_staff(array['super_admin', 'admin', 'match_operator']))) with check ((select public.is_staff(array['super_admin', 'admin', 'match_operator'])));
create policy competition_staff_manage_groups on public.tournament_groups for all to authenticated using ((select public.is_staff(array['super_admin', 'admin', 'match_operator']))) with check ((select public.is_staff(array['super_admin', 'admin', 'match_operator'])));
create policy competition_staff_manage_memberships on public.team_group_memberships for all to authenticated using ((select public.is_staff(array['super_admin', 'admin', 'match_operator']))) with check ((select public.is_staff(array['super_admin', 'admin', 'match_operator'])));
create policy competition_staff_manage_matches on public.matches for all to authenticated using ((select public.is_staff(array['super_admin', 'admin', 'match_operator']))) with check ((select public.is_staff(array['super_admin', 'admin', 'match_operator'])));
create policy competition_staff_manage_events on public.match_events for all to authenticated using ((select public.is_staff(array['super_admin', 'admin', 'match_operator']))) with check ((select public.is_staff(array['super_admin', 'admin', 'match_operator'])));
create policy content_staff_manage_articles on public.articles for all to authenticated using ((select public.is_staff(array['super_admin', 'admin', 'editor']))) with check ((select public.is_staff(array['super_admin', 'admin', 'editor'])));
create policy content_staff_manage_media on public.media_assets for all to authenticated using ((select public.is_staff(array['super_admin', 'admin', 'editor']))) with check ((select public.is_staff(array['super_admin', 'admin', 'editor'])));
create policy content_staff_manage_sponsors on public.sponsors for all to authenticated using ((select public.is_staff(array['super_admin', 'admin', 'editor']))) with check ((select public.is_staff(array['super_admin', 'admin', 'editor'])));
create policy audit_staff_read on public.audit_logs for select to authenticated using ((select public.is_staff(array['super_admin', 'admin'])));
create policy audit_staff_insert on public.audit_logs for insert to authenticated with check (actor_id = (select auth.uid()));

grant usage on schema public to anon, authenticated;
grant select on public.cities, public.seasons, public.venues, public.teams, public.players, public.tournament_groups, public.team_group_memberships, public.matches, public.match_events, public.articles, public.media_assets, public.sponsors to anon;
grant select on all tables in schema public to authenticated;
grant update(full_name) on public.profiles to authenticated;
grant insert, update, delete on public.cities, public.seasons, public.venues, public.teams, public.players, public.tournament_groups, public.team_group_memberships, public.matches, public.match_events, public.articles, public.media_assets, public.sponsors to authenticated;
grant insert on public.audit_logs to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.set_user_role(uuid, text) to authenticated;
revoke all on public.audit_logs from anon;

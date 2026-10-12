-- Nullable for manually entered fixtures. The full unique index supports
-- ON CONFLICT (season_id, fixture_key) DO NOTHING, preserving entered scores.
alter table public.matches add column if not exists fixture_key text;
create unique index if not exists matches_season_fixture_key_unique
  on public.matches (season_id, fixture_key);

alter table public.matches drop constraint if exists matches_stage_check;
alter table public.matches add constraint matches_stage_check
  check (stage in ('group', 'round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'third_place', 'final'));

comment on column public.matches.fixture_key is
  'Stable generator key within a season. Retries never replace fixture scores or publication state.';

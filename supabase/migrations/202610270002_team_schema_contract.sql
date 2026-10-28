-- Forward-only reconciliation of columns present in production but missing
-- from the migration chain. IF NOT EXISTS preserves deployed values.
alter table public.teams
  add column if not exists short_name text,
  add column if not exists country_code text,
  add column if not exists country_name text,
  add column if not exists secondary_color text,
  add column if not exists tournament_format text,
  add column if not exists group_name text;

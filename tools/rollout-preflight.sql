-- Production inspection only. No data, schema, roles, policies or settings are changed.
-- Run in the CCL SQL editor; retain the result privately with the rollout record.
-- This inventory is NOT a migration approval, full schema diff or restore test.
begin transaction isolation level repeatable read read only;
set local statement_timeout = '30s';

select current_setting('transaction_read_only') as read_only,
       current_setting('server_version') as postgres_version,
       now() as inspected_at;

select name, to_regclass(name) is not null as present
from (values ('supabase_migrations.schema_migrations'), ('public.seasons'),
             ('public.teams'), ('public.players'), ('public.matches'),
             ('public.articles'), ('public.clubs'), ('public.squad_memberships'),
             ('public.club_roster'), ('public.match_squads'),
             ('public.player_suspensions'), ('public.tournament_player_clubs'),
             ('public.club_entry_identity')) as expected(name)
order by name;

-- Baseline tables already used by the live application. Counts expose no user records.
select 'seasons' as entity, count(*) as rows from public.seasons
union all select 'clubs', count(*) from public.clubs
union all select 'teams', count(*) from public.teams
union all select 'players', count(*) from public.players
union all select 'squad_memberships', count(*) from public.squad_memberships
union all select 'matches', count(*) from public.matches
union all select 'match_events', count(*) from public.match_events
union all select 'articles', count(*) from public.articles
union all select 'media_assets', count(*) from public.media_assets
union all select 'sponsors', count(*) from public.sponsors
union all select 'comments', count(*) from public.comments
order by entity;

select role, count(*) as accounts from public.profiles group by role order by role;
select status, count(*) as tournaments from public.seasons group by status order by status;
select count(*) filter(where starts_on is null) as tournaments_without_start_date,
       count(*) filter(where starts_on is not null and ends_on < starts_on) as invalid_date_ranges
from public.seasons;

select b.id as bucket, b.public, count(o.id) as object_records
from storage.buckets b left join storage.objects o on o.bucket_id = b.id
where b.id = 'club-assets'
group by b.id, b.public;
-- Object metadata counts do not prove the file bytes were backed up or can be restored.

select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and
      ((table_name = 'seasons' and column_name in ('starts_on','ends_on','lots_order','started_at')) or
       (table_name = 'matches' and column_name in ('result_kind','score_source','lineup_source','started_at','completed_at')) or
       (table_name = 'clubs' and column_name = 'profile'))
order by table_name, column_name;

select n.nspname as schema, c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r' and n.nspname in ('public','storage')
order by n.nspname, c.relname;

select schemaname, tablename, policyname, roles, cmd,
       md5(coalesce(qual,'') || '|' || coalesce(with_check,'')) as definition_fingerprint
from pg_policies where schemaname in ('public','storage')
order by schemaname, tablename, policyname;

select p.proname as function_name, pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer, md5(pg_get_functiondef(p.oid)) as definition_fingerprint
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
order by p.proname, arguments;

rollback;

-- ONLY if the first result confirmed migration history exists, run separately:
-- begin transaction read only;
-- select version from supabase_migrations.schema_migrations order by version;
-- rollback;
-- If history is absent or inconsistent, STOP. Do not create/repair history or
-- apply migrations blindly. Reconcile against the actual production schema first.

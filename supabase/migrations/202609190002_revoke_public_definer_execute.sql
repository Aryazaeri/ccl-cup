-- Finish what 202608240003 set out to do.
--
-- That migration revoked EXECUTE from `anon`, but Postgres grants EXECUTE on
-- every new function to PUBLIC, and anon inherits PUBLIC. The ACLs still read
-- `=X/postgres`, so both functions stayed callable over /rest/v1/rpc by anyone
-- holding the public key. Revoking from PUBLIC is what actually removes it.

-- Trigger function: not meant to be called directly by anyone. Triggers still
-- fire — EXECUTE is only checked when the trigger is created, not when it runs.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Admin-only RPC: keep the explicit `authenticated` grant (the function checks
-- the caller's role itself); nobody signed out needs to reach it.
revoke execute on function public.set_user_role(uuid, text) from public, anon;
grant execute on function public.set_user_role(uuid, text) to authenticated;

-- is_staff() stays executable on purpose — see 202608240003.

-- Restrict who can call the SECURITY DEFINER functions over the REST API.
--
-- Supabase's security advisor flags every SECURITY DEFINER function that is
-- reachable as an RPC endpoint. Two of the three flagged here should not be.

-- handle_new_user() is a trigger function. It has no business being callable
-- as /rest/v1/rpc/handle_new_user by anyone.
revoke execute on function public.handle_new_user() from anon, authenticated;

-- set_user_role() guards itself — it raises unless the caller is an admin, and
-- only a super_admin may grant super_admin — but there is no reason for it to
-- be reachable before signing in at all.
revoke execute on function public.set_user_role(uuid, text) from anon;

-- is_staff() is deliberately left executable. The row-level policies call it as
-- the querying role, so revoking EXECUTE would break every staff policy in the
-- database. It discloses only whether the caller themselves is staff, which is
-- information they already have.

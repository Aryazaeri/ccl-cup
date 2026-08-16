# CCL Cup website and admin

A responsive React/Vite tournament website with a role-protected admin panel. It runs immediately with persistent local demo data and switches to Supabase when valid project environment values are present.

## Run locally

```bash
npm install
npm run dev
```

- Public site: `http://127.0.0.1:5173/#site`
- Admin: `http://127.0.0.1:5173/#admin`
- Local demo login: `admin@ccl.test` / `demo1234`

Local demo changes are stored in the browser and survive refreshes. They are isolated from any production database.

## Connect Supabase

1. Create a Supabase project.
2. Apply [`supabase/migrations/202608150001_initial_schema.sql`](supabase/migrations/202608150001_initial_schema.sql) in the Supabase SQL editor or through the Supabase CLI.
3. Apply [`supabase/seed.sql`](supabase/seed.sql).
4. Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the Supabase project settings.
5. Create the first user in Supabase Auth.
6. Promote the first administrator once from the SQL editor:

```sql
update public.profiles
set role = 'super_admin'
where id = (select id from auth.users where email = 'your-admin@example.com');
```

7. Restart `npm run dev` and sign in through `/#admin`.

Do not put a Supabase service-role key in this frontend project. Browser access is protected by the migration's grants and Row-Level Security policies.

## Roles

- `super_admin`: all administration, including granting super-admin access
- `admin`: competition, content and user-role administration
- `editor`: articles, media and sponsors
- `match_operator`: teams, players, fixtures and match events
- `viewer`: public/read-only access

New Auth users receive `viewer` by default. Administrators change roles through the secured `set_user_role` database function.

## Current data workflows

- Teams: create and soft-delete
- Matches: create and delete
- Stories: create, publish and unpublish
- Public site: reads only scheduled/published records
- Local and Supabase repositories use the same UI contract


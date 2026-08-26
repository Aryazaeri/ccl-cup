-- Public portal features: live stream link-out and visitor comments.
--
-- Apply in the Supabase SQL editor. Both changes are additive; nothing here
-- drops or rewrites existing data.

-- ------------------------------------------------------------------
-- 1. Live stream link-out
--
-- The public site already renders a LIVE badge on in-progress matches but had
-- nothing to link to. Match operators can now attach a broadcast URL.
-- ------------------------------------------------------------------

alter table public.matches
  add column if not exists stream_url text;

comment on column public.matches.stream_url is
  'External broadcast link (YouTube or similar). Shown as a link-out from the LIVE badge on the public site.';

-- ------------------------------------------------------------------
-- 2. Visitor comments
--
-- Submissions are always created as 'pending'. The public read policy exposes
-- approved rows only, so nothing a visitor writes can reach the site until a
-- moderator approves it. That is enforced here rather than in the client,
-- which means it holds even though the moderation UI does not exist yet.
-- ------------------------------------------------------------------

create table if not exists public.comments (
  id bigint generated always as identity primary key,
  author_name text not null,
  body text not null,
  match_id bigint references public.matches(id) on delete cascade,
  story_id bigint references public.articles(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comments_status_check check (status in ('pending', 'approved', 'rejected')),
  constraint comments_author_length check (char_length(trim(author_name)) between 2 and 60),
  constraint comments_body_length check (char_length(trim(body)) between 2 and 2000)
);

create index if not exists comments_status_created_idx
  on public.comments (status, created_at desc);

drop trigger if exists comments_set_updated_at on public.comments;
create trigger comments_set_updated_at
  before update on public.comments
  for each row execute function public.set_updated_at();

alter table public.comments enable row level security;

-- Read: approved rows only, for everyone.
drop policy if exists comments_public_read on public.comments;
create policy comments_public_read on public.comments
  for select to anon, authenticated
  using (status = 'approved');

-- Write: anyone may submit, but only as 'pending'. The WITH CHECK is what
-- stops a caller crafting a request that self-approves.
drop policy if exists comments_public_submit on public.comments;
create policy comments_public_submit on public.comments
  for insert to anon, authenticated
  with check (status = 'pending');

-- Moderation: content staff see every row and may change status or delete.
drop policy if exists content_staff_manage_comments on public.comments;
create policy content_staff_manage_comments on public.comments
  for all to authenticated
  using ((select public.is_staff(array['super_admin', 'admin', 'editor'])))
  with check ((select public.is_staff(array['super_admin', 'admin', 'editor'])));

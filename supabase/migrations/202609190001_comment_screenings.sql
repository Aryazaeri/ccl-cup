-- Automated comment screening (TypeSafe / Jev).
--
-- The `submit-comment` Edge Function screens each visitor comment and records
-- what the model said here: one probability per hazard, a severity score, and
-- the action its policy took. Moderators see this next to the comment.
--
-- Kept in its own table rather than as columns on `comments` because the
-- public can read approved comment rows: model scores are for staff only, and
-- a separate table lets RLS keep them that way. It also means a visitor has no
-- way to submit a comment with a forged "clean" assessment attached — there is
-- no insert policy at all, so only the service role (the Edge Function) writes.
--
-- Additive; apply in the Supabase SQL editor after 202608260001.

create table if not exists public.comment_screenings (
  comment_id bigint primary key references public.comments(id) on delete cascade,
  model text not null,
  policy text not null,
  action text not null,
  reasons text[] not null default '{}',
  hazards jsonb not null,
  severity real not null,
  screened_at timestamptz not null default now(),
  constraint comment_screenings_action_check check (action in ('approve', 'review', 'reject'))
);

comment on table public.comment_screenings is
  'TypeSafe assessment of each visitor comment, written by the submit-comment Edge Function. Staff-only.';
comment on column public.comment_screenings.hazards is
  'Probability (0-1) per hazard: spam, abuse, hate, personal_info, off_topic.';
comment on column public.comment_screenings.severity is
  'Probability-weighted severity, 0 (harmless) to 3 (severe).';

alter table public.comment_screenings enable row level security;

-- Read: the same content staff who moderate comments. No write policies:
-- only the service role, which bypasses RLS, can insert or update.
drop policy if exists content_staff_read_comment_screenings on public.comment_screenings;
create policy content_staff_read_comment_screenings on public.comment_screenings
  for select to authenticated
  using ((select public.is_staff(array['super_admin', 'admin', 'editor'])));

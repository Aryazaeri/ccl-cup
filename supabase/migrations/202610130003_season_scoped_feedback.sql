-- Season-scoped feedback (audit backlog item 11). Seasons already carry a
-- draft/published/archived status, separate from is_current; the app now
-- edits it and hides draft and archived seasons publicly (item 10).
--
-- Feedback belongs to the season it was left under. Deleting a season keeps
-- its comments for moderation history (season_id becomes null), and the
-- public site only lists comments for the season being viewed.

alter table public.comments add column season_id bigint references public.seasons(id) on delete set null;
create index comments_season_idx on public.comments (season_id);

-- Comments on a match or article belong to that match's or article's season.
update public.comments c set season_id = m.season_id from public.matches m where c.match_id = m.id and c.season_id is null;
update public.comments c set season_id = a.season_id from public.articles a where c.story_id = a.id and c.season_id is null;

-- Visitors may only leave feedback under a published season.
drop policy comments_public_submit on public.comments;
create policy comments_public_submit on public.comments for insert to anon, authenticated
  with check (
    status = 'pending'
    and (season_id is null or exists (select 1 from public.seasons s where s.id = season_id and s.status = 'published'))
  );

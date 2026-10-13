-- Deleting a season no longer publishes its articles and media everywhere
-- (audit backlog item 21). Their season_id is set null on delete, and a null
-- season means "not tied to a season", so the public site showed them in
-- every season. Unpublish them first: they survive as hidden drafts without a
-- season, for staff to reassign or delete.
create function public.hide_season_content() returns trigger
language plpgsql set search_path = public as $$
begin
  update articles set status = 'draft' where season_id = old.id and status <> 'draft';
  update media_assets set is_published = false where season_id = old.id and is_published;
  return old;
end $$;

create trigger seasons_hide_content_before_delete before delete on public.seasons
  for each row execute function public.hide_season_content();

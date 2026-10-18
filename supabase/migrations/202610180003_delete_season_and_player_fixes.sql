-- Two deletes that failed in production (audit item 43, rolled-back checks):
--
-- 1. Deleting a season whose media is linked to one of its sponsors failed:
--    hide_season_content updated those media rows, and the sponsor cascade's
--    SET NULL then collided with that update (media_assets_sponsor_id_fkey).
--    The trigger now unlinks them first, as the cascade would.
-- 2. Deleting a player with recorded events failed: the events' player_id is
--    set null, and an event must name its player (match_events_player_identified).
--    The player's name is now written onto those events before the delete, so
--    the match history keeps it.

create or replace function public.hide_season_content() returns trigger
language plpgsql set search_path = public as $$
begin
  update media_assets set sponsor_id = null
  where sponsor_id in (select id from sponsors where season_id = old.id);
  update articles set status = 'draft' where season_id = old.id and status <> 'draft';
  update media_assets set is_published = false where season_id = old.id and is_published;
  return old;
end $$;

create function public.keep_player_name_on_events() returns trigger
language plpgsql set search_path = public as $$
begin
  update match_events set player_name = old.full_name
  where player_id = old.id and player_name is null;
  return old;
end $$;

create trigger players_keep_name_on_events before delete on public.players
  for each row execute function public.keep_player_name_on_events();

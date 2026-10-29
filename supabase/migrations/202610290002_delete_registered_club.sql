-- Staff can delete a registered club once it has no season entries.
-- club_entry_identity keeps the club behind deleted entries so players cannot
-- switch clubs after kickoff; it is dropped only when no tournament still
-- records a player under one of those entries.
create function public.delete_registered_club(club bigint) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not (select public.is_staff(array['super_admin','admin','match_operator'])) then
  raise exception 'Only competition staff can delete clubs';
 end if;
 -- Lock the club so a concurrent season entry cannot slip in.
 perform 1 from public.clubs where id=club for update;
 if not found then raise exception 'Club not found'; end if;
 if exists(select 1 from public.teams where club_id=club) then
  raise exception 'Remove this club from every season before deleting it';
 end if;
 if exists(select 1 from public.tournament_player_clubs t join public.club_entry_identity i on i.entry_id=t.team_id where i.club_id=club) then
  raise exception 'This club still has tournament history and cannot be deleted';
 end if;
 delete from public.club_entry_identity where club_id=club;
 delete from public.clubs where id=club;
end $$;
revoke all on function public.delete_registered_club(bigint) from public,anon;
grant execute on function public.delete_registered_club(bigint) to authenticated;
notify pgrst,'reload schema';

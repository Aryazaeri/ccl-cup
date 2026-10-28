-- Fail explicitly when a read-only staff member calls the write RPC.
create or replace function public.save_match_details(fixture bigint, details jsonb, lineups jsonb default null) returns void
language plpgsql security invoker set search_path=public as $$
declare current_match public.matches; r jsonb;
begin
 if not public.is_staff(array['super_admin','admin','match_operator']) and current_user not in ('postgres','supabase_admin') then
   raise exception 'Competition staff access required' using errcode='42501';
 end if;
 select * into current_match from public.matches where id=fixture for update;
 if not found then raise exception 'Match not found'; end if;
 if lineups is not null then
   if current_match.started_at is not null then raise exception 'Match-day lineups lock at kickoff'; end if;
   delete from public.match_squads where match_id=fixture;
   for r in select * from jsonb_array_elements(lineups) loop
     insert into public.match_squads(match_id,team_id,player_id,player_name,shirt_number,lineup_role,is_goalkeeper)
       select fixture,(r->>'team_id')::bigint,p.id,p.full_name,p.shirt_number,r->>'lineup_role',coalesce((r->>'is_goalkeeper')::boolean,false)
       from public.players p where p.id=(r->>'player_id')::bigint;
     if not found then raise exception 'Selected player not found'; end if;
   end loop;
 end if;
 update public.matches set
   stage=details->>'stage', group_id=(details->>'group_id')::bigint,
   venue_id=(details->>'venue_id')::bigint, kickoff_at=(details->>'kickoff_at')::timestamptz,
   match_status=details->>'match_status', publication_status='published',
   home_score=(details->>'home_score')::integer, away_score=(details->>'away_score')::integer,
   home_penalties=(details->>'home_penalties')::integer, away_penalties=(details->>'away_penalties')::integer,
   referee_name=details->>'referee_name', stream_url=details->>'stream_url',
   result_kind=coalesce(details->>'result_kind','normal'), forfeit_team_id=(details->>'forfeit_team_id')::bigint,
   decision_note=details->>'decision_note'
 where id=fixture;
 if not found then raise exception 'Match could not be updated' using errcode='42501'; end if;
end $$;

notify pgrst, 'reload schema';

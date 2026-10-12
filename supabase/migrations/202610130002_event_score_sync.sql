-- Goal events keep the score in step (audit backlog item 9).
--
-- Adding a goal or scored penalty raises its club's score by one; removing it
-- lowers it again. An own goal counts for the other club. The score is
-- adjusted rather than recounted from events, so results entered without a
-- full event log (older and partially recorded matches) keep their score.
-- Standings, knockout progression and scorer tables already derive from the
-- score and events, so they follow.

create function public.apply_goal_event(event_match bigint, event_team bigint, event_kind text, step int)
returns void language sql set search_path = public as $$
  update matches m set
    home_score = greatest(coalesce(m.home_score, 0) + case
      when (event_kind <> 'own_goal' and event_team = m.home_team_id)
        or (event_kind = 'own_goal' and event_team = m.away_team_id) then step else 0 end, 0),
    away_score = greatest(coalesce(m.away_score, 0) + case
      when (event_kind <> 'own_goal' and event_team = m.away_team_id)
        or (event_kind = 'own_goal' and event_team = m.home_team_id) then step else 0 end, 0)
  where m.id = event_match
    and event_kind in ('goal', 'penalty_scored', 'own_goal')
    and event_team in (m.home_team_id, m.away_team_id);
$$;

create function public.sync_score_from_event() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op in ('DELETE', 'UPDATE') then
    perform apply_goal_event(old.match_id, old.team_id, old.event_type, -1);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform apply_goal_event(new.match_id, new.team_id, new.event_type, 1);
  end if;
  return null;
end $$;

create trigger match_events_sync_score
  after insert or delete or update of event_type, team_id, match_id on public.match_events
  for each row execute function public.sync_score_from_event();

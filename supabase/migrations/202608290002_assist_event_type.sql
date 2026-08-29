-- Allow assists to be recorded as match events.
--
-- Player assists were stored as a plain integer on players.assists and edited
-- nowhere, so the number could never be verified against what happened in a
-- match. Goals and cards already derive from the event log; assists could not,
-- because match_events_event_type_check had no 'assist' value.
--
-- The constraint also already permits 'own_goal' and 'penalty_missed', which
-- the client has never offered. Those stay available for a later change; this
-- migration only adds what the statistics requirement needs.

alter table public.match_events
  drop constraint if exists match_events_event_type_check;

alter table public.match_events
  add constraint match_events_event_type_check
  check (
    event_type = any (array[
      'goal',
      'own_goal',
      'assist',
      'yellow_card',
      'red_card',
      'substitution',
      'penalty_scored',
      'penalty_missed'
    ])
  );

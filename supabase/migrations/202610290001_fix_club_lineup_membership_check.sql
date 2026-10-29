-- validate_club_lineup compared squad_memberships.player_id with its own id
-- column (the unqualified `id` bound to the table, not the lineup player), so
-- every saved club formation was rejected. Qualify both sides.
create or replace function public.validate_club_lineup() returns trigger language plpgsql set search_path='' as $$
declare ids bigint[];
begin
 if new.lineup is null or (tg_op='UPDATE' and new.lineup is not distinct from old.lineup) then return new; end if;
 if new.lineup->>'formation'<>'8v8' then raise exception 'CCL uses eight-a-side lineups'; end if;
 select array_agg(p.player_id) into ids from (
  select value::bigint player_id from jsonb_each_text(new.lineup->'starters')
  union all select value::text::bigint from jsonb_array_elements(new.lineup->'bench')
 ) p;
 if (select count(*) from jsonb_object_keys(new.lineup->'starters'))>8
 or cardinality(ids)<>(select count(distinct l.player_id) from unnest(ids) l(player_id))
 or exists(select 1 from unnest(ids) l(player_id) where not exists(
   select 1 from public.squad_memberships m where m.player_id=l.player_id and m.team_id=new.id)) then
  raise exception 'Select each registered squad player at most once in the lineup';
 end if;
 return new;
end $$;

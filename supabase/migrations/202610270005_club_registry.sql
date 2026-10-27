alter table public.clubs add column profile jsonb not null default '{}';
create table public.club_roster (
 club_id bigint not null references public.clubs(id) on delete cascade,
 player_id bigint not null references public.players(id) on delete cascade,
 primary key(club_id,player_id)
);
alter table public.club_roster enable row level security;
create policy club_roster_staff_read on public.club_roster for select to authenticated
 using((select public.is_staff(array['super_admin','admin','editor','match_operator'])));
create policy club_roster_staff_manage on public.club_roster for all to authenticated
 using((select public.is_staff(array['super_admin','admin','match_operator'])))
 with check((select public.is_staff(array['super_admin','admin','match_operator'])));
grant select,insert,update,delete on public.club_roster to authenticated;

create function public.save_registered_club(details jsonb, player_ids bigint[], new_players jsonb, club bigint default null) returns bigint
language plpgsql security invoker set search_path=public as $$
declare cid bigint:=club; person jsonb; pid bigint; ids bigint[]:=coalesce(player_ids,'{}');
begin
 if cid is null then
   insert into public.clubs(name,profile) values(trim(details->>'name'),details) returning id into cid;
 else
   update public.clubs set name=trim(details->>'name'),profile=details where id=cid;
   if not found then raise exception 'Club not found or not permitted'; end if;
 end if;
 for person in select * from jsonb_array_elements(coalesce(new_players,'[]')) loop
   insert into public.players(full_name,position,shirt_number,nationality,birth_year)
   values(trim(person->>'full_name'),coalesce(person->>'position','forward'),(person->>'shirt_number')::smallint,
     coalesce(person->>'nationality','TR'),(person->>'birth_year')::smallint) returning id into pid;
   ids:=array_append(ids,pid);
 end loop;
 delete from public.club_roster where club_id=cid;
 insert into public.club_roster select cid,unnest(ids) on conflict do nothing;
 return cid;
end $$;
revoke all on function public.save_registered_club(jsonb,bigint[],jsonb,bigint) from public,anon;
grant execute on function public.save_registered_club(jsonb,bigint[],jsonb,bigint) to authenticated;

-- Club registry crests use the same protected storage lifecycle as entries.
create or replace function public.asset_is_referenced(object_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.teams where public.asset_object_path(logo_url)=object_name)
   or exists(select 1 from public.clubs where public.asset_object_path(profile->>'logoUrl')=object_name)
   or exists(select 1 from public.players where public.asset_object_path(photo_url)=object_name)
   or exists(select 1 from public.articles where public.asset_object_path(cover_image_url)=object_name)
   or exists(select 1 from public.media_assets where public.asset_object_path(thumbnail_url)=object_name or public.asset_object_path(external_url)=object_name)
   or exists(select 1 from public.sponsors where public.asset_object_path(logo_url)=object_name)
$$;

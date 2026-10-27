-- Role changes have one serialized entry point. Profile-name editing remains
-- available without giving browser clients access to the authorization column.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name) on public.profiles to authenticated;
drop policy if exists profiles_admin_manage on public.profiles;

create or replace function public.guard_profile_role() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.role = old.role then return new; end if;
  perform pg_advisory_xact_lock(20261027, 1);
  if tg_op = 'UPDATE' and auth.uid() is not null then
    if not public.is_staff(array['super_admin','admin']) then
      raise exception 'Only administrators can change roles' using errcode = '42501';
    end if;
    if (old.role = 'super_admin' or new.role = 'super_admin')
       and not public.is_staff(array['super_admin']) then
      raise exception 'Only super admins can change a super admin role' using errcode = '42501';
    end if;
  end if;
  if old.role = 'super_admin' and
     not exists(select 1 from public.profiles where role='super_admin' and id<>old.id) then
    raise exception 'At least one super admin must remain' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger profiles_guard_role before update of role or delete on public.profiles
  for each row execute function public.guard_profile_role();

create or replace function public.set_user_role(target_user_id uuid, new_role text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- Acquire before touching any profile row: concurrent demotions cannot both
  -- observe another super admin and leave the project without one.
  perform pg_advisory_xact_lock(20261027, 1);
  if not public.is_staff(array['super_admin','admin']) then
    raise exception 'Only administrators can change roles' using errcode='42501';
  end if;
  if new_role is null or new_role not in ('super_admin','admin','editor','match_operator','viewer') then
    raise exception 'Invalid role' using errcode='23514';
  end if;
  update public.profiles set role=new_role where id=target_user_id;
  if not found then raise exception 'Account not found'; end if;
end $$;
revoke all on function public.set_user_role(uuid,text) from public, anon;
grant execute on function public.set_user_role(uuid,text) to authenticated;

-- Read-only standings includes drafts for both operational and editorial staff.
do $$ declare t text; begin
  foreach t in array array['seasons','teams','players','matches','match_events',
    'tournament_groups','team_group_memberships','squad_memberships','match_squads'] loop
    execute format('create policy staff_standings_read on public.%I for select to authenticated using ((select public.is_staff(array[''super_admin'',''admin'',''editor'',''match_operator''])))',t);
  end loop;
end $$;

-- Every match follows its parent tournament, including fixtures formerly
-- marked draft. Event visibility must follow that same boundary.
drop policy matches_public_read on public.matches;
create policy matches_public_read on public.matches for select to anon, authenticated
  using (public.is_published_season(season_id));
drop policy events_public_read on public.match_events;
create policy events_public_read on public.match_events for select to anon, authenticated
  using (exists(select 1 from public.matches m where m.id=match_id and public.is_published_season(m.season_id)));

create function public.asset_object_path(url text) returns text
language sql immutable set search_path='' as $$
 select nullif(split_part(regexp_replace(url, '^.*/storage/v1/object/(public|sign|authenticated)/club-assets/', ''), '?', 1), url)
$$;

create function public.can_manage_asset(object_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select object_name ~ '^(logos|players|sponsors|articles|media)/[^/]+$'
   and (public.is_staff(array['super_admin','admin'])
     or (split_part(object_name,'/',1) in ('logos','players') and public.is_staff(array['match_operator']))
     or (split_part(object_name,'/',1) in ('articles','media','sponsors') and public.is_staff(array['editor'])))
$$;

-- This lookup deliberately bypasses row visibility: a failed HTTP response
-- can hide a successful commit from the caller. Never remove a referenced file.
create function public.asset_is_referenced(object_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.teams where public.asset_object_path(logo_url)=object_name)
   or exists(select 1 from public.players where public.asset_object_path(photo_url)=object_name)
   or exists(select 1 from public.articles where public.asset_object_path(cover_image_url)=object_name)
   or exists(select 1 from public.media_assets where public.asset_object_path(thumbnail_url)=object_name or public.asset_object_path(external_url)=object_name)
   or exists(select 1 from public.sponsors where public.asset_object_path(logo_url)=object_name)
$$;
revoke all on function public.asset_is_referenced(text) from public, anon;
grant execute on function public.asset_is_referenced(text) to authenticated;

create function public.is_public_asset(object_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select case split_part(object_name,'/',1)
   when 'articles' then exists(select 1 from public.articles a
     where public.asset_object_path(a.cover_image_url)=object_name
       and a.status='published' and a.published_at<=now()
       and (a.season_id is null or public.is_published_season(a.season_id)))
   when 'media' then exists(select 1 from public.media_assets m
     where (public.asset_object_path(m.thumbnail_url)=object_name or public.asset_object_path(m.external_url)=object_name)
       and m.is_published and (m.season_id is null or public.is_published_season(m.season_id)))
   else split_part(object_name,'/',1) in ('logos','players','sponsors')
 end
$$;

update storage.buckets set public=false where id='club-assets';
drop policy club_assets_public_read on storage.objects;
drop policy club_assets_staff_insert on storage.objects;
drop policy club_assets_staff_update on storage.objects;
drop policy club_assets_staff_delete on storage.objects;
create policy club_assets_read on storage.objects for select to anon, authenticated
 using(bucket_id='club-assets' and (public.is_public_asset(name) or public.can_manage_asset(name)));
create policy club_assets_insert on storage.objects for insert to authenticated
 with check(bucket_id='club-assets' and public.can_manage_asset(name));
create policy club_assets_update on storage.objects for update to authenticated
 using(bucket_id='club-assets' and public.can_manage_asset(name))
 with check(bucket_id='club-assets' and public.can_manage_asset(name));
create policy club_assets_delete on storage.objects for delete to authenticated
 using(bucket_id='club-assets' and public.can_manage_asset(name) and not public.asset_is_referenced(name));

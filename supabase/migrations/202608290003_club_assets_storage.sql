-- A place to put uploaded images.
--
-- Club crests, player cutouts, sponsor logos and article covers were all read
-- into the browser with FileReader and stored as base64 data URLs in the text
-- column. That inlines a multi-megabyte string into every row, into every
-- query that selects it, and into the public site's payload — so in practice
-- nothing was ever saved and every teams.logo_url is null.
--
-- One public bucket, foldered by subject. Public read because the portal is
-- public; writes restricted to the same staff roles that may edit the rows
-- these assets belong to.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'club-assets',
  'club-assets',
  true,
  5242880, -- 5 MB; crests and cutouts are small, and this caps abuse
  array['image/png','image/jpeg','image/webp','image/svg+xml','image/gif']
)
on conflict (id) do nothing;

drop policy if exists "club_assets_public_read" on storage.objects;
create policy "club_assets_public_read"
  on storage.objects for select
  using (bucket_id = 'club-assets');

drop policy if exists "club_assets_staff_insert" on storage.objects;
create policy "club_assets_staff_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'club-assets'
    and (select is_staff(array['super_admin','admin','match_operator','editor']))
  );

drop policy if exists "club_assets_staff_update" on storage.objects;
create policy "club_assets_staff_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'club-assets'
    and (select is_staff(array['super_admin','admin','match_operator','editor']))
  );

drop policy if exists "club_assets_staff_delete" on storage.objects;
create policy "club_assets_staff_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'club-assets'
    and (select is_staff(array['super_admin','admin','match_operator','editor']))
  );

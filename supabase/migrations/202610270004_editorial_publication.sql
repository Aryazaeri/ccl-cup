alter table public.articles alter column status set default 'draft';
alter table public.articles add constraint articles_scheduled_date check(status<>'scheduled' or published_at is not null) not valid;
-- Scheduled publication is enforced at read time, so it works at the chosen
-- instant even without a cron worker. Staff retain the scheduled source row.
drop policy articles_public_read on public.articles;
create policy articles_public_read on public.articles for select to anon,authenticated
 using(status in ('published','scheduled') and published_at<=now()
   and (season_id is null or public.is_published_season(season_id)));
drop policy media_public_read on public.media_assets;
create policy media_public_read on public.media_assets for select to anon,authenticated
 using(is_published and (season_id is null or public.is_published_season(season_id)));
create or replace function public.is_public_asset(object_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select case split_part(object_name,'/',1)
   when 'articles' then exists(select 1 from public.articles a
     where public.asset_object_path(a.cover_image_url)=object_name
       and a.status in ('published','scheduled') and a.published_at<=now()
       and (a.season_id is null or public.is_published_season(a.season_id)))
   when 'media' then exists(select 1 from public.media_assets m
     where (public.asset_object_path(m.thumbnail_url)=object_name or public.asset_object_path(m.external_url)=object_name)
       and m.is_published and (m.season_id is null or public.is_published_season(m.season_id)))
   else split_part(object_name,'/',1) in ('logos','players','sponsors')
 end
$$;

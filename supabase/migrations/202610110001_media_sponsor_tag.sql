-- Optional "presented by" sponsor on a media asset. Deleting the sponsor
-- keeps the media and just clears the tag.
alter table public.media_assets
  add column if not exists sponsor_id bigint references public.sponsors(id) on delete set null;

create index if not exists media_assets_sponsor_id_idx on public.media_assets (sponsor_id);

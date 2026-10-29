-- ICC crests and news covers still loaded from arsiv.cclcup.com, which may go offline.
-- The 42 files were copied (same filenames; one .jfif saved as .jpg) into club-assets
-- logos/ and articles/. Repoint the stored URLs; no-op where no archive URLs remain.
update public.teams
set logo_url=replace(replace(logo_url,
  'https://arsiv.cclcup.com/internationalcorporatecup/images/takimlar/',
  'https://daxhvechjiahkfxccwym.supabase.co/storage/v1/object/public/club-assets/logos/'), '.jfif', '.jpg')
where logo_url like 'https://arsiv.cclcup.com/internationalcorporatecup/images/takimlar/%';

update public.clubs
set profile=jsonb_set(profile, '{logoUrl}', to_jsonb(replace(replace(profile->>'logoUrl',
  'https://arsiv.cclcup.com/internationalcorporatecup/images/takimlar/',
  'https://daxhvechjiahkfxccwym.supabase.co/storage/v1/object/public/club-assets/logos/'), '.jfif', '.jpg')))
where profile->>'logoUrl' like 'https://arsiv.cclcup.com/internationalcorporatecup/images/takimlar/%';

update public.articles
set cover_image_url=replace(cover_image_url,
  'https://arsiv.cclcup.com/internationalcorporatecup/images/haberler/',
  'https://daxhvechjiahkfxccwym.supabase.co/storage/v1/object/public/club-assets/articles/')
where cover_image_url like 'https://arsiv.cclcup.com/internationalcorporatecup/images/haberler/%';

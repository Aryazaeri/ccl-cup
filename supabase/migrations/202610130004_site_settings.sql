-- Editable site settings (audit backlog items 15, 16): the About copy,
-- competition rules, social links and WhatsApp contact, previously hard-coded
-- in the public site. One row; anyone may read it, admins edit it. Empty links
-- and an empty WhatsApp number are simply not shown, so nothing official is
-- invented before the organisation supplies it.

create table public.site_settings (
  id boolean primary key default true check (id),
  about_intro text not null default '' check (length(about_intro) <= 2000),
  about_history text not null default '' check (length(about_history) <= 2000),
  about_vision text not null default '' check (length(about_vision) <= 2000),
  rules text[] not null default '{}' check (cardinality(rules) <= 20),
  venue_note text not null default '' check (length(venue_note) <= 500),
  instagram_url text not null default '' check (instagram_url = '' or instagram_url ~ '^https://'),
  youtube_url text not null default '' check (youtube_url = '' or youtube_url ~ '^https://'),
  linkedin_url text not null default '' check (linkedin_url = '' or linkedin_url ~ '^https://'),
  whatsapp_number text not null default '' check (whatsapp_number ~ '^([0-9]{8,15})?$'),
  whatsapp_message text not null default '' check (length(whatsapp_message) <= 300),
  updated_at timestamptz not null default now()
);
create trigger site_settings_set_updated_at before update on public.site_settings
  for each row execute function public.set_updated_at();

alter table public.site_settings enable row level security;
create policy site_settings_public_read on public.site_settings for select using (true);
create policy site_admin_manage_settings on public.site_settings for all to authenticated
  using ((select public.is_staff(array['super_admin', 'admin'])))
  with check ((select public.is_staff(array['super_admin', 'admin'])));

-- The copy the site showed until now, with the rules brought in line with the
-- five-player minimum and permitted transfers (item 16).
insert into public.site_settings (about_intro, about_history, about_vision, rules, venue_note, whatsapp_message) values (
  'The CCL Cup brings corporate teams together for a season of competitive football, played to full match-day standards across the host city.',
  'Founded to give company sides a real competition rather than a series of friendlies, the Cup has grown into a multi-format season running group stages, league tables and knockout rounds side by side.',
  'A tournament that treats amateur football seriously: proper fixtures, published results, verified standings, and a record every club can point back to.',
  array[
    'Each club registers at least five players, and its squad may not drop below five during the season.',
    'Group stage points: three for a win, one for a draw.',
    'Ties are separated by goal difference, then goals scored, then head-to-head.',
    'A player plays for one club at a time. Transfers during a season are allowed; goals, cards and match squads already recorded stay with the club the player played for.'
  ],
  'Fixtures are played at the host city venues listed on each match. Kick-off times are local.',
  'Hello! I have a question about the CCL Cup.'
);

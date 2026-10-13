/**
 * What the public site says about the organisation and where it links out.
 * Stored in public.site_settings and edited in admin → Settings. An empty link
 * or WhatsApp number is not rendered, so nothing official is invented before
 * the organisation supplies it.
 */
export type SiteSettings = {
  aboutIntro: string
  aboutHistory: string
  aboutVision: string
  rules: string[]
  venueNote: string
  instagramUrl: string
  youtubeUrl: string
  linkedinUrl: string
  /** International format, digits only. */
  whatsappNumber: string
  whatsappMessage: string
}

/** Used when the settings row cannot be read, and as the local-demo starting point. Mirrors the migration's seed row. */
export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  aboutIntro:
    'The CCL Cup brings corporate teams together for a season of competitive football, played to full match-day standards across the host city.',
  aboutHistory:
    'Founded to give company sides a real competition rather than a series of friendlies, the Cup has grown into a multi-format season running group stages, league tables and knockout rounds side by side.',
  aboutVision:
    'A tournament that treats amateur football seriously: proper fixtures, published results, verified standings, and a record every club can point back to.',
  rules: [
    'Each club registers at least five players, and its squad may not drop below five during the season.',
    'Group stage points: three for a win, one for a draw.',
    'Ties are separated by goal difference, then goals scored, then head-to-head.',
    'A player plays for one club at a time. Transfers during a season are allowed; goals, cards and match squads already recorded stay with the club the player played for.',
  ],
  venueNote: 'Fixtures are played at the host city venues listed on each match. Kick-off times are local.',
  instagramUrl: '',
  youtubeUrl: '',
  linkedinUrl: '',
  whatsappNumber: '',
  whatsappMessage: 'Hello! I have a question about the CCL Cup.',
}

/**
 * Trims every field, drops blank rules and keeps only the digits of the
 * WhatsApp number. Returns the cleaned settings and the first problem found;
 * the same limits are enforced by the table's check constraints.
 */
export function cleanSiteSettings(input: SiteSettings): { settings: SiteSettings; error: string } {
  const settings: SiteSettings = {
    aboutIntro: input.aboutIntro.trim(),
    aboutHistory: input.aboutHistory.trim(),
    aboutVision: input.aboutVision.trim(),
    rules: input.rules.map((rule) => rule.trim()).filter(Boolean),
    venueNote: input.venueNote.trim(),
    instagramUrl: input.instagramUrl.trim(),
    youtubeUrl: input.youtubeUrl.trim(),
    linkedinUrl: input.linkedinUrl.trim(),
    whatsappNumber: input.whatsappNumber.replace(/\D/g, ''),
    whatsappMessage: input.whatsappMessage.trim(),
  }
  const links: [string, string][] = [
    ['Instagram', settings.instagramUrl],
    ['YouTube', settings.youtubeUrl],
    ['LinkedIn', settings.linkedinUrl],
  ]
  const badLink = links.find(([, url]) => url && !/^https:\/\/\S+$/.test(url))
  let error = ''
  if (badLink) error = `The ${badLink[0]} link must be a full https:// address.`
  else if (settings.whatsappNumber && !/^\d{8,15}$/.test(settings.whatsappNumber))
    error = 'Enter the WhatsApp number in international format: 8 to 15 digits, country code first.'
  else if (settings.rules.length > 20) error = 'Keep the rules to 20 lines or fewer.'
  else if ([settings.aboutIntro, settings.aboutHistory, settings.aboutVision].some((text) => text.length > 2000))
    error = 'Each About paragraph is limited to 2000 characters.'
  else if (settings.venueNote.length > 500) error = 'The venue note is limited to 500 characters.'
  else if (settings.whatsappMessage.length > 300) error = 'The WhatsApp greeting is limited to 300 characters.'
  return { settings, error }
}

/** The WhatsApp chat link, or '' when no number is set. */
export const whatsappLink = (settings: Pick<SiteSettings, 'whatsappNumber' | 'whatsappMessage'>) =>
  settings.whatsappNumber
    ? `https://wa.me/${settings.whatsappNumber}?text=${encodeURIComponent(settings.whatsappMessage)}`
    : ''

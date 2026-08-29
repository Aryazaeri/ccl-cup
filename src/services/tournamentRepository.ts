import { initialMatches, initialPlayers, initialSeasons, initialStories, initialTeams } from '../data'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type {
  AdminUser,
  Comment,
  Match,
  MatchEvent,
  MediaAsset,
  Player,
  Season,
  Sponsor,
  Story,
  Team,
} from '../types'

export type TournamentData = {
  seasons: Season[]
  teams: Team[]
  players: Player[]
  matches: Match[]
  stories: Story[]
  media: MediaAsset[]
  sponsors: Sponsor[]
}

const storageKey = 'ccl-cup:data:v7'

const initialData = (): TournamentData => ({
  seasons: initialSeasons.map((season) => ({ ...season })),
  teams: initialTeams.map((team) => ({ ...team })),
  players: initialPlayers.map((player) => ({ ...player })),
  matches: initialMatches.map((match) => ({ ...match, events: match.events ? [...match.events] : [] })),
  stories: initialStories.map((story) => ({ ...story })),
  media: [],
  sponsors: [],
})

function loadLocal(): TournamentData {
  try {
    const stored = localStorage.getItem(storageKey)
    if (!stored) return initialData()
    const parsed = JSON.parse(stored) as TournamentData
    if (
      !Array.isArray(parsed.seasons) ||
      !Array.isArray(parsed.teams) ||
      !Array.isArray(parsed.matches) ||
      !Array.isArray(parsed.stories) ||
      !Array.isArray(parsed.players)
    ) {
      return initialData()
    }
    // Older payloads predate media/sponsors; fill them in rather than
    // discarding the whole cache.
    return { ...parsed, media: parsed.media ?? [], sponsors: parsed.sponsors ?? [] }
  } catch {
    return initialData()
  }
}

function saveLocal(data: TournamentData) {
  localStorage.setItem(storageKey, JSON.stringify(data))
  return data
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

/* ------------------------------------------------------------------ *
 * Schema bridge
 *
 * The UI models a match with free-text `venue`, `date` and `time`, while the
 * database models it with a `venue_id` foreign key and a single `kickoff_at`
 * timestamptz. These helpers translate between the two so the database keeps
 * its proper relational shape.
 * ------------------------------------------------------------------ */

/** Turkey has had no DST since 2016, so a fixed +03:00 offset is exact. */
const ISTANBUL_OFFSET = '+03:00'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Turns the admin form's "18 Aug" + "20:30" into an exact instant.
 * The typed values are read as Istanbul wall-clock time, which is what the
 * operator entering a fixture means.
 */
function toKickoffIso(date: string, time: string, seasonYear?: number): string {
  const [dayPart, monthPart] = String(date ?? '').trim().split(/\s+/)
  const monthIndex = MONTHS.findIndex((m) => m.toLowerCase() === String(monthPart ?? '').toLowerCase().slice(0, 3))
  const [hours, minutes] = String(time ?? '').split(':').map((value) => Number(value))

  const year = seasonYear && Number.isFinite(seasonYear) ? seasonYear : new Date().getFullYear()
  const month = monthIndex >= 0 ? monthIndex + 1 : new Date().getMonth() + 1
  const day = Number(dayPart) > 0 ? Number(dayPart) : 1

  const pad = (value: number) => String(value).padStart(2, '0')
  return `${year}-${pad(month)}-${pad(day)}T${pad(hours || 0)}:${pad(minutes || 0)}:00${ISTANBUL_OFFSET}`
}

function formatKickoffDate(value: unknown): string {
  const date = new Date(String(value ?? ''))
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    timeZone: 'Europe/Istanbul',
  }).format(date)
}

function formatKickoffTime(value: unknown): string {
  const date = new Date(String(value ?? ''))
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Istanbul',
  }).format(date)
}

/**
 * Finds a city by name, creating it if it does not exist.
 * Venues require a city, so a fixture at a brand-new ground would otherwise
 * be unsavable.
 */
async function resolveCityId(cityName: string): Promise<number | null> {
  if (!supabase) return null
  const name = cityName?.trim()
  if (!name) return null

  const existing = await supabase.from('cities').select('id').ilike('name', name).limit(1).maybeSingle()
  if (existing.data?.id) return Number(existing.data.id)

  const created = await supabase.from('cities').insert({ name, country_code: 'TR' }).select('id').single()
  if (created.error) throw created.error
  return Number(created.data.id)
}

/** Finds a venue by name within a city, creating it on first use. */
async function resolveVenueId(venueName: string, cityName: string): Promise<number | null> {
  if (!supabase) return null
  const name = venueName?.trim()
  if (!name) return null

  const existing = await supabase.from('venues').select('id').ilike('name', name).limit(1).maybeSingle()
  if (existing.data?.id) return Number(existing.data.id)

  const cityId = await resolveCityId(cityName || 'Antalya')
  if (!cityId) return null

  const created = await supabase.from('venues').insert({ name, city_id: cityId }).select('id').single()
  if (created.error) throw created.error
  return Number(created.data.id)
}

/**
 * The database constrains `matches.stage` to tournament phases, and models
 * "which group" separately via `group_id`. The admin form uses one free-text
 * field for both ("Group A", "Semi-finals"), so it is split on the way in and
 * rejoined on the way out.
 */
const STAGE_VALUES = ['group', 'round_of_16', 'quarter_final', 'semi_final', 'third_place', 'final'] as const
type DbStage = (typeof STAGE_VALUES)[number]

const STAGE_LABELS: Record<DbStage, string> = {
  group: 'Group Stage',
  round_of_16: 'Round of 16',
  quarter_final: 'Quarter-final',
  semi_final: 'Semi-final',
  third_place: 'Third-place Play-off',
  final: 'Final',
}

function toDbStage(stage: string): DbStage {
  const value = String(stage ?? '').trim().toLowerCase()
  if (STAGE_VALUES.includes(value as DbStage)) return value as DbStage
  if (value.includes('16') || value.includes('son 16')) return 'round_of_16'
  if (value.startsWith('quarter') || value.includes('çeyrek') || value.includes('ceyrek')) return 'quarter_final'
  if (value.startsWith('semi') || value.includes('yarı') || value.includes('yari')) return 'semi_final'
  if (value.includes('third') || value.includes('üçüncü')) return 'third_place'
  if (value.includes('final')) return 'final'
  return 'group'
}

/** A fixture's stage text is only a group label when it names a group. */
function groupLabelFrom(stage: string): string | null {
  const value = String(stage ?? '').trim()
  if (!value) return null
  return /^(group|grup)\b/i.test(value) ? value : null
}

/** Finds a group by name within a season, creating it on first use. */
async function resolveGroupId(stage: string, seasonId: number | null): Promise<number | null> {
  if (!supabase || !seasonId) return null
  const label = groupLabelFrom(stage)
  if (!label) return null

  const existing = await supabase
    .from('tournament_groups')
    .select('id')
    .eq('season_id', seasonId)
    .ilike('name', label)
    .limit(1)
    .maybeSingle()
  if (existing.data?.id) return Number(existing.data.id)

  const created = await supabase
    .from('tournament_groups')
    .insert({ season_id: seasonId, name: label })
    .select('id')
    .single()
  if (created.error) throw created.error
  return Number(created.data.id)
}

/** Resolves an event's player to a roster id where one exists. */
async function resolvePlayerId(playerName: string, teamId?: number | null): Promise<number | null> {
  if (!supabase) return null
  const name = playerName?.trim()
  if (!name) return null

  let query = supabase.from('players').select('id').ilike('full_name', name).limit(1)
  if (teamId && teamId > 0) query = query.eq('team_id', teamId)

  const { data } = await query.maybeSingle()
  if (data?.id) return Number(data.id)

  // Fall back to a name match on any club before giving up.
  const anyTeam = await supabase.from('players').select('id').ilike('full_name', name).limit(1).maybeSingle()
  return anyTeam.data?.id ? Number(anyTeam.data.id) : null
}

async function currentSeasonId(): Promise<number | null> {
  if (!supabase) return null
  try {
    const { data } = await supabase.from('seasons').select('id').eq('is_current', true).limit(1).maybeSingle()
    if (data?.id) return Number(data.id)
    const first = await supabase.from('seasons').select('id').limit(1).maybeSingle()
    return first.data?.id ? Number(first.data.id) : null
  } catch {
    return null
  }
}

async function loadRemote(): Promise<TournamentData> {
  if (!supabase) throw new Error('Supabase is not configured.')

  const [seasonsRes, teamsRes, matchesRes, storiesRes, playersRes, mediaRes, sponsorsRes] = await Promise.all([
    supabase.from('seasons').select('*').order('created_at', { ascending: false }),
    supabase.from('teams').select('*').order('name'),
    supabase
      .from('matches')
      .select(
        '*, home:teams!matches_home_team_id_fkey(name), away:teams!matches_away_team_id_fkey(name), venue:venues(name), group:tournament_groups(name), match_events(*, team:teams(name), player:players(full_name))',
      )
      .order('kickoff_at', { ascending: true }),
    supabase.from('articles').select('*').order('published_at', { ascending: false }),
    supabase.from('players').select('*, team:teams(name)').order('full_name'),
    supabase.from('media_assets').select('*').order('created_at', { ascending: false }),
    supabase.from('sponsors').select('*').order('display_order', { ascending: true }),
  ])

  if (teamsRes.error) throw teamsRes.error
  if (matchesRes.error) throw matchesRes.error
  if (storiesRes.error) throw storiesRes.error
  if (playersRes.error) throw playersRes.error

  const seasonsList: Season[] = (seasonsRes.data ?? []).map((s: Record<string, unknown>) => ({
    id: Number(s.id),
    city: String(s.city || 'Antalya'),
    year: Number(s.year || 2026),
    name: String(s.name || ''),
    fullName: String(s.full_name || `${s.city || 'Antalya'} ${s.year || 2026} ${s.name || ''}`),
    seasonType: (s.season_type as Season['seasonType']) || 'tournament',
    teamCount: s.team_count ? Number(s.team_count) : undefined,
    groupCount: s.group_count ? Number(s.group_count) : undefined,
    bracket: s.bracket as Season['bracket'],
    league: s.league as Season['league'],
    groupLeague: s.group_league as Season['groupLeague'],
    parentSeasonId: s.parent_season_id ? Number(s.parent_season_id) : null,
    isActive: Boolean(s.is_current),
  }))

  const teams: Team[] = (teamsRes.data ?? []).map((t: Record<string, unknown>) => ({
    id: Number(t.id),
    // teams.season_id is NOT NULL in the schema but was never mapped, which
    // left every team season-less on the client and made a season filter
    // impossible to build.
    seasonId: t.season_id != null ? Number(t.season_id) : undefined,
    name: String(t.name),
    shortName: String(t.short_name || String(t.name).slice(0, 3).toUpperCase()),
    countryCode: String(t.country_code || 'TR'),
    countryName: String(t.country_name || 'Turkey'),
    logoUrl: t.logo_url ? String(t.logo_url) : undefined,
    color: String(t.primary_color || '#63e35b'),
    secondaryColor: t.secondary_color ? String(t.secondary_color) : '#071525',
    managerName: t.manager_name ? String(t.manager_name) : undefined,
    coachName: t.coach_name ? String(t.coach_name) : undefined,
    bio: t.biography ? String(t.biography) : undefined,
    tournamentFormat: (t.tournament_format as Team['tournamentFormat']) || 'Champions Cup',
    groupName: t.group_name ? String(t.group_name) : 'Group A',
    played: 0,
    goalDifference: 0,
    points: 0,
    isActive: true,
  }))

  const players: Player[] = (playersRes.data ?? []).map((p: Record<string, unknown>) => ({
    id: Number(p.id),
    teamId: p.team_id ? Number(p.team_id) : 0,
    teamName: (p.team as { name: string } | null)?.name ?? 'Free Agent',
    fullName: String(p.full_name),
    shirtNumber: p.shirt_number ? Number(p.shirt_number) : undefined,
    position: (p.position as Player['position']) || 'forward',
    strongFoot: (p.strong_foot as Player['strongFoot']) || 'right',
    birthYear: p.birth_date ? new Date(String(p.birth_date)).getFullYear() : undefined,
    nationality: p.nationality ? String(p.nationality) : 'TR',
    isCaptain: Boolean(p.is_captain),
    activeSeasonIds: Array.isArray(p.active_season_ids) ? (p.active_season_ids as unknown[]).map(Number) : [],
    goals: Number(p.goals || 0),
    assists: Number(p.assists || 0),
    photoUrl: p.photo_url ? String(p.photo_url) : undefined,
  }))

  const matches: Match[] = (matchesRes.data ?? []).map((m: Record<string, unknown>) => {
    const rawEvents = (m.match_events as Record<string, unknown>[]) ?? []
    const events: MatchEvent[] = rawEvents.map((ev) => ({
      id: Number(ev.id),
      matchId: Number(ev.match_id),
      teamId: ev.team_id ? Number(ev.team_id) : undefined,
      teamName: (ev.team as { name: string } | null)?.name ?? '',
      // Registered players resolve through the join; `player_name` carries
      // scorers who are not on any roster.
      playerName: (ev.player as { full_name: string } | null)?.full_name ?? String(ev.player_name || ''),
      eventType: ev.event_type as MatchEvent['eventType'],
      minute: Number(ev.minute || 0),
      extraMinute: ev.extra_minute != null ? Number(ev.extra_minute) : undefined,
      notes: ev.notes ? String(ev.notes) : undefined,
    }))

    return {
      id: Number(m.id),
      home: (m.home as { name: string } | null)?.name ?? 'Unknown',
      away: (m.away as { name: string } | null)?.name ?? 'Unknown',
      // Prefer the group's own name ("Group A") over the generic phase label.
      stage:
        (m.group as { name: string } | null)?.name ??
        STAGE_LABELS[(m.stage as DbStage) in STAGE_LABELS ? (m.stage as DbStage) : 'group'],
      date: formatKickoffDate(m.kickoff_at),
      time: formatKickoffTime(m.kickoff_at),
      venue: (m.venue as { name: string } | null)?.name ?? '—',
      matchStatus: (m.match_status as Match['matchStatus']) || 'scheduled',
      homeScore: m.home_score != null ? Number(m.home_score) : undefined,
      awayScore: m.away_score != null ? Number(m.away_score) : undefined,
      // Draft fixtures must stay off the public site, so the database's
      // publication_status drives this rather than a hardcoded value.
      seasonId: m.season_id != null ? Number(m.season_id) : undefined,
      status: m.publication_status === 'published' ? 'Scheduled' : 'Draft',
      referee: m.referee_name ? String(m.referee_name) : undefined,
      streamUrl: m.stream_url ? String(m.stream_url) : undefined,
      events,
    }
  })

  const stories: Story[] = (storiesRes.data ?? []).map((s: Record<string, unknown>) => ({
    id: Number(s.id),
    title: String(s.title),
    summary: s.summary ? String(s.summary) : undefined,
    body: s.body ? String(s.body) : undefined,
    category: (s.category as Story['category']) || 'news',
    status: s.status === 'published' ? 'Published' : 'Draft',
    publishedAt: s.published_at
      ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(
          new Date(String(s.published_at)),
        )
      : undefined,
    coverImageUrl: s.cover_image_url ? String(s.cover_image_url) : undefined,
  }))

  const media: MediaAsset[] = (mediaRes.data ?? []).map((m: Record<string, unknown>) => ({
    id: Number(m.id),
    title: String(m.title),
    kind: (m.kind as MediaAsset['kind']) || 'video',
    externalUrl: m.external_url ? String(m.external_url) : undefined,
    thumbnailUrl: m.thumbnail_url ? String(m.thumbnail_url) : undefined,
    durationSeconds: m.duration_seconds != null ? Number(m.duration_seconds) : undefined,
    isPublished: Boolean(m.is_published),
    createdAt: m.created_at ? String(m.created_at) : undefined,
  }))

  const sponsors: Sponsor[] = (sponsorsRes.data ?? []).map((s2: Record<string, unknown>) => ({
    id: Number(s2.id),
    name: String(s2.name),
    logoUrl: s2.logo_url ? String(s2.logo_url) : undefined,
    websiteUrl: s2.website_url ? String(s2.website_url) : undefined,
    displayOrder: Number(s2.display_order || 0),
    isActive: Boolean(s2.is_active),
  }))

  return {
    seasons: seasonsList.length > 0 ? seasonsList : initialSeasons,
    teams,
    players,
    matches,
    stories,
    media,
    sponsors,
  }
}

export const tournamentRepository = {
  mode: isSupabaseConfigured ? ('supabase' as const) : ('local' as const),

  async load(): Promise<TournamentData> {
    if (!isSupabaseConfigured || !supabase) return loadLocal()
    try {
      return await loadRemote()
    } catch {
      return loadLocal()
    }
  },

  // SEASONS CRUD
  async addSeason(season: Season): Promise<TournamentData> {
    if (!supabase) {
      const data = loadLocal()
      return saveLocal({ ...data, seasons: [season, ...data.seasons] })
    }
    const { error } = await supabase.from('seasons').insert({
      id: season.id,
      name: season.name,
      slug: `${slugify(season.fullName || season.name)}-${Date.now().toString(36)}`,
      is_current: season.isActive ?? true,
      // `seasons_public_read` gates on status, so a season left at the 'draft'
      // default would be invisible to the public site.
      status: 'published',
      city: season.city,
      year: season.year,
      full_name: season.fullName,
      season_type: season.seasonType ?? 'tournament',
      team_count: season.teamCount ?? 8,
      group_count: season.groupCount ?? null,
      bracket: season.bracket ?? null,
      league: season.league ?? null,
      group_league: season.groupLeague ?? null,
      parent_season_id: season.parentSeasonId ?? null,
    })
    if (error) throw error
    return loadRemote()
  },

  async updateSeason(season: Season): Promise<TournamentData> {
    if (!supabase) {
      const data = loadLocal()
      return saveLocal({ ...data, seasons: data.seasons.map((s) => (s.id === season.id ? season : s)) })
    }
    const { error } = await supabase
      .from('seasons')
      .update({
        name: season.name,
        slug: slugify(season.fullName || season.name),
        is_current: season.isActive ?? false,
        status: 'published',
        city: season.city,
        year: season.year,
        full_name: season.fullName,
        season_type: season.seasonType ?? 'tournament',
        team_count: season.teamCount ?? 8,
        group_count: season.groupCount ?? null,
        bracket: season.bracket ?? null,
        league: season.league ?? null,
        group_league: season.groupLeague ?? null,
        parent_season_id: season.parentSeasonId ?? null,
      })
      .eq('id', season.id)
    if (error) throw error
    return loadRemote()
  },

  async deleteSeason(id: number): Promise<TournamentData> {
    if (!supabase) {
      const data = loadLocal()
      return saveLocal({ ...data, seasons: data.seasons.filter((s) => s.id !== id) })
    }
    const { error } = await supabase.from('seasons').delete().eq('id', id)
    if (error) throw error
    return loadRemote()
  },

  // TEAMS CRUD
  async addTeam(team: Team): Promise<TournamentData> {
    if (!supabase) {
      const data = loadLocal()
      return saveLocal({ ...data, teams: [...data.teams, team] })
    }
    const fallbackSeasonId = await currentSeasonId()
    const finalSeasonId = team.seasonId ?? fallbackSeasonId
    const uniqueSlug = `${slugify(team.name)}-${Date.now().toString(36)}`

    const { error } = await supabase.from('teams').insert({
      season_id: finalSeasonId,
      name: team.name,
      slug: uniqueSlug,
      short_name: team.shortName ?? team.name.slice(0, 3).toUpperCase(),
      country_code: team.countryCode || 'TR',
      country_name: team.countryName || 'Turkey',
      primary_color: team.color,
      secondary_color: team.secondaryColor || '#071525',
      logo_url: team.logoUrl || null,
      manager_name: team.managerName || null,
      coach_name: team.coachName || null,
      biography: team.bio || null,
      tournament_format: team.tournamentFormat || 'Champions Cup',
      group_name: team.groupName || null,
    })
    if (error) throw error
    return loadRemote()
  },

  async updateTeam(team: Team): Promise<TournamentData> {
    if (!supabase) {
      const data = loadLocal()
      const updatedTeams = data.teams.map((t) => (t.id === team.id ? team : t))
      const updatedPlayers = data.players.map((p) => (p.teamId === team.id ? { ...p, teamName: team.name } : p))
      return saveLocal({ ...data, teams: updatedTeams, players: updatedPlayers })
    }
    const { error } = await supabase
      .from('teams')
      .update({
        season_id: team.seasonId ?? null,
        name: team.name,
        short_name: team.shortName ?? team.name.slice(0, 3).toUpperCase(),
        country_code: team.countryCode || 'TR',
        country_name: team.countryName || 'Turkey',
        primary_color: team.color,
        secondary_color: team.secondaryColor || '#071525',
        logo_url: team.logoUrl || null,
        manager_name: team.managerName || null,
        coach_name: team.coachName || null,
        biography: team.bio || null,
        tournament_format: team.tournamentFormat || 'Champions Cup',
        group_name: team.groupName || null,
      })
      .eq('id', team.id)
    if (error) throw error
    return loadRemote()
  },

  async deleteTeam(id: number): Promise<TournamentData> {
    if (!supabase) {
      const data = loadLocal()
      return saveLocal({
        ...data,
        teams: data.teams.filter((t) => t.id !== id),
        players: data.players.filter((p) => p.teamId !== id),
      })
    }
    const { error } = await supabase.from('teams').delete().eq('id', id)
    if (error) throw error
    return loadRemote()
  },

  // PLAYERS CRUD
  async addPlayer(player: Player): Promise<TournamentData> {
    if (!supabase) {
      const data = loadLocal()
      return saveLocal({ ...data, players: [...data.players, player] })
    }
    const { error } = await supabase.from('players').insert({
      team_id: player.teamId && Number(player.teamId) > 0 ? Number(player.teamId) : null,
      full_name: player.fullName,
      shirt_number: player.shirtNumber ?? null,
      position: player.position,
      strong_foot: player.strongFoot ?? 'right',
      nationality: player.nationality ?? 'TR',
      is_captain: player.isCaptain ?? false,
      active_season_ids: player.activeSeasonIds ?? [],
      goals: player.goals ?? 0,
      assists: player.assists ?? 0,
      photo_url: player.photoUrl ?? null,
    })
    if (error) throw error
    return loadRemote()
  },

  async updatePlayer(player: Player): Promise<TournamentData> {
    if (!supabase) {
      const data = loadLocal()
      return saveLocal({ ...data, players: data.players.map((p) => (p.id === player.id ? player : p)) })
    }
    const { error } = await supabase
      .from('players')
      .update({
        team_id: player.teamId && Number(player.teamId) > 0 ? Number(player.teamId) : null,
        full_name: player.fullName,
        shirt_number: player.shirtNumber ?? null,
        position: player.position,
        strong_foot: player.strongFoot ?? 'right',
        nationality: player.nationality ?? 'TR',
        is_captain: player.isCaptain ?? false,
        active_season_ids: player.activeSeasonIds ?? [],
        goals: player.goals ?? 0,
        assists: player.assists ?? 0,
        photo_url: player.photoUrl ?? null,
      })
      .eq('id', player.id)
    if (error) throw error
    return loadRemote()
  },

  async deletePlayer(id: number): Promise<TournamentData> {
    if (!supabase) {
      const data = loadLocal()
      return saveLocal({ ...data, players: data.players.filter((p) => p.id !== id) })
    }
    const { error } = await supabase.from('players').delete().eq('id', id)
    if (error) throw error
    return loadRemote()
  },

  // MATCHES CRUD
  async addMatch(match: Match): Promise<TournamentData> {
    if (!supabase) {
      const data = loadLocal()
      return saveLocal({ ...data, matches: [match, ...data.matches] })
    }
    // The form now carries a season; currentSeasonId is only the fallback for
    // callers that predate the field.
    const seasonId = match.seasonId ?? (await currentSeasonId())
    if (!seasonId) throw new Error('No season exists yet. Create a season before adding fixtures.')

    const { data: teams } = await supabase.from('teams').select('id, name')
    const homeTeam = (teams ?? []).find((t: { name: string }) => t.name === match.home)
    const awayTeam = (teams ?? []).find((t: { name: string }) => t.name === match.away)
    if (!homeTeam || !awayTeam) throw new Error('Selected teams do not exist.')

    const { data: season } = await supabase.from('seasons').select('year, city').eq('id', seasonId).maybeSingle()
    const venueId = await resolveVenueId(match.venue, String(season?.city ?? 'Antalya'))

    // `matches.id` is GENERATED ALWAYS, so the database assigns it. The
    // client-side Date.now() id is only meaningful in local mode; loadRemote()
    // re-reads the authoritative row straight after.
    const { error } = await supabase.from('matches').insert({
      season_id: seasonId,
      home_team_id: homeTeam.id,
      away_team_id: awayTeam.id,
      stage: toDbStage(match.stage),
      group_id: await resolveGroupId(match.stage, seasonId),
      venue_id: venueId,
      kickoff_at: toKickoffIso(match.date, match.time, season?.year ? Number(season.year) : undefined),
      match_status: match.matchStatus,
      publication_status: match.status === 'Scheduled' ? 'published' : 'draft',
      home_score: match.homeScore ?? null,
      away_score: match.awayScore ?? null,
      referee_name: match.referee ?? null,
      stream_url: match.streamUrl ?? null,
    })
    if (error) throw error
    return loadRemote()
  },

  async updateMatch(match: Match): Promise<TournamentData> {
    if (!supabase) {
      const data = loadLocal()
      return saveLocal({ ...data, matches: data.matches.map((m) => (m.id === match.id ? match : m)) })
    }
    const { data: existing } = await supabase
      .from('matches')
      .select('season_id')
      .eq('id', match.id)
      .maybeSingle()

    const seasonId = match.seasonId ?? (existing?.season_id ? Number(existing.season_id) : await currentSeasonId())
    const { data: season } = seasonId
      ? await supabase.from('seasons').select('year, city').eq('id', seasonId).maybeSingle()
      : { data: null }

    const venueId = await resolveVenueId(match.venue, String(season?.city ?? 'Antalya'))

    const { error } = await supabase
      .from('matches')
      .update({
        season_id: seasonId,
        stage: toDbStage(match.stage),
        group_id: await resolveGroupId(match.stage, seasonId),
        venue_id: venueId,
        kickoff_at: toKickoffIso(match.date, match.time, season?.year ? Number(season.year) : undefined),
        match_status: match.matchStatus,
        publication_status: match.status === 'Scheduled' ? 'published' : 'draft',
        home_score: match.homeScore ?? null,
        away_score: match.awayScore ?? null,
        referee_name: match.referee ?? null,
        stream_url: match.streamUrl ?? null,
      })
      .eq('id', match.id)
    if (error) throw error
    return loadRemote()
  },

  async deleteMatch(id: number): Promise<TournamentData> {
    if (!supabase) {
      const data = loadLocal()
      return saveLocal({ ...data, matches: data.matches.filter((m) => m.id !== id) })
    }
    const { error } = await supabase.from('matches').delete().eq('id', id)
    if (error) throw error
    return loadRemote()
  },

  // MATCH EVENTS CRUD
  async addMatchEvent(matchId: number, event: MatchEvent): Promise<TournamentData> {
    if (!supabase) {
      const data = loadLocal()
      return saveLocal({
        ...data,
        matches: data.matches.map((m) => {
          if (m.id !== matchId) return m
          const currentEvents = m.events ?? []
          return { ...m, events: [...currentEvents, event] }
        }),
      })
    }
    // Events are stored relationally. The team always resolves (it is one of
    // the two clubs in the fixture); the player may not, if the scorer is not
    // on a roster — that case keeps the typed name in `player_name`.
    const { data: teamRow } = await supabase
      .from('teams')
      .select('id')
      .ilike('name', event.teamName?.trim() || '')
      .limit(1)
      .maybeSingle()

    const teamId = teamRow?.id ? Number(teamRow.id) : null
    const playerId = await resolvePlayerId(event.playerName, teamId)

    // `match_events.id` is GENERATED ALWAYS — see addMatch.
    const { error } = await supabase.from('match_events').insert({
      match_id: matchId,
      team_id: teamId,
      player_id: playerId,
      player_name: playerId ? null : event.playerName?.trim() || null,
      event_type: event.eventType,
      minute: event.minute,
      extra_minute: event.extraMinute ?? null,
      notes: event.notes ?? null,
    })
    if (error) throw error
    return loadRemote()
  },

  async deleteMatchEvent(matchId: number, eventId: number): Promise<TournamentData> {
    if (!supabase) {
      const data = loadLocal()
      return saveLocal({
        ...data,
        matches: data.matches.map((m) => {
          if (m.id !== matchId) return m
          const currentEvents = m.events ?? []
          return { ...m, events: currentEvents.filter((ev) => ev.id !== eventId) }
        }),
      })
    }
    const { error } = await supabase.from('match_events').delete().eq('id', eventId)
    if (error) throw error
    return loadRemote()
  },

  // STORIES CRUD
  async addStory(story: Story): Promise<TournamentData> {
    if (!supabase) {
      const data = loadLocal()
      return saveLocal({ ...data, stories: [story, ...data.stories] })
    }
    const status = story.status.toLowerCase()
    // `articles.id` is GENERATED ALWAYS — see addMatch.
    const { error } = await supabase.from('articles').insert({
      title: story.title,
      slug: slugify(story.title),
      summary: story.summary ?? null,
      body: story.body ?? null,
      category: story.category ?? 'news',
      status,
      cover_image_url: story.coverImageUrl ?? null,
      published_at: status === 'published' ? new Date().toISOString() : null,
    })
    if (error) throw error
    return loadRemote()
  },

  async updateStory(story: Story): Promise<TournamentData> {
    if (!supabase) {
      const data = loadLocal()
      return saveLocal({ ...data, stories: data.stories.map((s) => (s.id === story.id ? story : s)) })
    }
    const status = story.status.toLowerCase()
    const { error } = await supabase
      .from('articles')
      .update({
        title: story.title,
        slug: slugify(story.title),
        summary: story.summary ?? null,
        body: story.body ?? null,
        category: story.category ?? 'news',
        status,
        cover_image_url: story.coverImageUrl ?? null,
        published_at: status === 'published' ? new Date().toISOString() : null,
      })
      .eq('id', story.id)
    if (error) throw error
    return loadRemote()
  },

  async deleteStory(id: number): Promise<TournamentData> {
    if (!supabase) {
      const data = loadLocal()
      return saveLocal({ ...data, stories: data.stories.filter((s) => s.id !== id) })
    }
    const { error } = await supabase.from('articles').delete().eq('id', id)
    if (error) throw error
    return loadRemote()
  },

  async toggleStory(id: number): Promise<TournamentData> {
    if (!supabase) {
      const data = loadLocal()
      return saveLocal({
        ...data,
        stories: data.stories.map((story) =>
          story.id === id ? { ...story, status: story.status === 'Published' ? 'Draft' : 'Published' } : story,
        ),
      })
    }
    const { data: story, error: readError } = await supabase.from('articles').select('status').eq('id', id).single()
    if (readError) throw readError
    const status = story.status === 'published' ? 'draft' : 'published'
    const { error } = await supabase
      .from('articles')
      .update({ status, published_at: status === 'published' ? new Date().toISOString() : null })
      .eq('id', id)
    if (error) throw error
    return loadRemote()
  },
}

/* ------------------------------------------------------------------ *
 * Comments
 *
 * Kept out of `TournamentData` deliberately: comments are only needed by the
 * public site, they are read far more often than the rest of the dataset, and
 * a missing `comments` table must not take the whole app down with it.
 *
 * Approval is enforced in the database, not here — the public read policy
 * exposes `status = 'approved'` only, and the insert policy refuses any row
 * that does not arrive as `pending`. Nothing in this file can grant itself
 * more than that.
 * ------------------------------------------------------------------ */

const commentsStorageKey = 'ccl-cup:comments:v1'

export type CommentDraft = {
  authorName: string
  body: string
  matchId?: number | null
  storyId?: number | null
}

function loadLocalComments(): Comment[] {
  try {
    const stored = localStorage.getItem(commentsStorageKey)
    if (!stored) return []
    const parsed = JSON.parse(stored) as Comment[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const commentsRepository = {
  /** Approved comments, newest first. Never throws — an unavailable table
   *  yields an empty list rather than breaking the page around it. */
  async listApproved(): Promise<Comment[]> {
    if (!supabase) {
      return loadLocalComments().filter((comment) => comment.status === 'approved')
    }
    try {
      const { data, error } = await supabase
        .from('comments')
        .select('*')
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []).map((row: Record<string, unknown>) => ({
        id: Number(row.id),
        authorName: String(row.author_name),
        body: String(row.body),
        matchId: row.match_id != null ? Number(row.match_id) : null,
        storyId: row.story_id != null ? Number(row.story_id) : null,
        status: row.status as Comment['status'],
        createdAt: row.created_at
          ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(
              new Date(String(row.created_at)),
            )
          : undefined,
      }))
    } catch (reason) {
      console.warn('Comments unavailable:', reason)
      return []
    }
  },

  /** Submits a comment for review. Always lands as `pending`. */
  async submit(draft: CommentDraft): Promise<void> {
    const authorName = draft.authorName.trim()
    const body = draft.body.trim()
    if (authorName.length < 2) throw new Error('Please enter your name.')
    if (body.length < 2) throw new Error('Please write a comment before sending.')
    if (body.length > 2000) throw new Error('Comments are limited to 2000 characters.')

    if (!supabase) {
      const existing = loadLocalComments()
      const comment: Comment = {
        id: Date.now(),
        authorName,
        body,
        matchId: draft.matchId ?? null,
        storyId: draft.storyId ?? null,
        status: 'pending',
      }
      localStorage.setItem(commentsStorageKey, JSON.stringify([comment, ...existing]))
      return
    }

    const { error } = await supabase.from('comments').insert({
      author_name: authorName,
      body,
      match_id: draft.matchId ?? null,
      story_id: draft.storyId ?? null,
      status: 'pending',
    })
    if (error) {
      if (error.code === '42P01') {
        throw new Error('Comments are not enabled yet. Run the 202608260001 migration to switch them on.')
      }
      throw error
    }
  },
}

/* ------------------------------------------------------------------ *
 * Moderation, media, sponsors and users
 *
 * These four are staff-only surfaces. They deliberately sit outside
 * `TournamentData`'s mutation flow: each returns its own rows, so a failure in
 * one module cannot take down the shared dataset the rest of the panel renders
 * from. Row-level security remains the real boundary in every case.
 * ------------------------------------------------------------------ */

function requireSupabase(feature: string): NonNullable<typeof supabase> {
  if (!supabase) throw new Error(`${feature} needs a connected Supabase project.`)
  return supabase
}

function mapComment(row: Record<string, unknown>): Comment {
  return {
    id: Number(row.id),
    authorName: String(row.author_name),
    body: String(row.body),
    matchId: row.match_id != null ? Number(row.match_id) : null,
    storyId: row.story_id != null ? Number(row.story_id) : null,
    status: row.status as Comment['status'],
    createdAt: row.created_at
      ? new Intl.DateTimeFormat('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(new Date(String(row.created_at)))
      : undefined,
  }
}

export const moderationRepository = {
  /** Every comment regardless of status — staff only, enforced by RLS. */
  async listAll(): Promise<Comment[]> {
    const client = requireSupabase('Comment moderation')
    const { data, error } = await client
      .from('comments')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(mapComment)
  },

  async setStatus(id: number, status: Comment['status']): Promise<void> {
    const client = requireSupabase('Comment moderation')
    const { error } = await client.from('comments').update({ status }).eq('id', id)
    if (error) throw error
  },

  async remove(id: number): Promise<void> {
    const client = requireSupabase('Comment moderation')
    const { error } = await client.from('comments').delete().eq('id', id)
    if (error) throw error
  },
}

export const mediaRepository = {
  async save(asset: MediaAsset): Promise<void> {
    const client = requireSupabase('Media')
    const payload = {
      title: asset.title,
      kind: asset.kind,
      external_url: asset.externalUrl || null,
      thumbnail_url: asset.thumbnailUrl || null,
      duration_seconds: asset.durationSeconds ?? null,
      is_published: asset.isPublished,
    }
    // media_assets.id is GENERATED ALWAYS, so a new row must not carry one.
    const { error } = asset.id
      ? await client.from('media_assets').update(payload).eq('id', asset.id)
      : await client.from('media_assets').insert(payload)
    if (error) throw error
  },

  async remove(id: number): Promise<void> {
    const client = requireSupabase('Media')
    const { error } = await client.from('media_assets').delete().eq('id', id)
    if (error) throw error
  },

  async togglePublished(id: number, isPublished: boolean): Promise<void> {
    const client = requireSupabase('Media')
    const { error } = await client.from('media_assets').update({ is_published: isPublished }).eq('id', id)
    if (error) throw error
  },
}

export const sponsorsRepository = {
  async save(sponsor: Sponsor): Promise<void> {
    const client = requireSupabase('Sponsors')
    const payload = {
      name: sponsor.name,
      logo_url: sponsor.logoUrl || null,
      website_url: sponsor.websiteUrl || null,
      display_order: sponsor.displayOrder,
      is_active: sponsor.isActive,
    }
    const { error } = sponsor.id
      ? await client.from('sponsors').update(payload).eq('id', sponsor.id)
      : await client.from('sponsors').insert(payload)
    if (error) throw error
  },

  async remove(id: number): Promise<void> {
    const client = requireSupabase('Sponsors')
    const { error } = await client.from('sponsors').delete().eq('id', id)
    if (error) throw error
  },

  async toggleActive(id: number, isActive: boolean): Promise<void> {
    const client = requireSupabase('Sponsors')
    const { error } = await client.from('sponsors').update({ is_active: isActive }).eq('id', id)
    if (error) throw error
  },
}

export const usersRepository = {
  /**
   * Staff accounts. Email lives in `auth.users`, which PostgREST does not
   * expose, so only the profile fields are available to the client.
   */
  async list(): Promise<AdminUser[]> {
    const client = requireSupabase('User management')
    const { data, error } = await client
      .from('profiles')
      .select('id, full_name, role, created_at')
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.id),
      fullName: String(row.full_name || '—'),
      role: row.role as AdminUser['role'],
      createdAt: row.created_at
        ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(
            new Date(String(row.created_at)),
          )
        : undefined,
    }))
  },

  /**
   * Delegates to the `set_user_role` function rather than updating the column.
   * The function refuses non-admin callers and stops anyone but a super_admin
   * granting super_admin, so that guard cannot be bypassed from here.
   */
  async setRole(userId: string, role: AdminUser['role']): Promise<void> {
    const client = requireSupabase('User management')
    const { error } = await client.rpc('set_user_role', { target_user_id: userId, new_role: role })
    if (error) throw error
  },
}

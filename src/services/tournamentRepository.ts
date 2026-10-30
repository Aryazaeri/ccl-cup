import { FunctionsHttpError } from '@supabase/supabase-js'
import { initialMatches, initialPlayers, initialSeasons, initialStories, initialTeams } from '../data'
import { allRows } from '../lib/allRows'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { planFixtures, type FixtureOptions } from '../lib/fixtureUtils'
import { scoreAfterEvent } from '../lib/standingsUtils'
import type { Lineup } from '../lib/formations'
import { DEFAULT_SITE_SETTINGS, cleanSiteSettings, type SiteSettings } from '../lib/siteSettings'
import { saveWithAsset, type UploadedAsset } from '../lib/assetSaveUtils'
import { assetDisplayUrls, canonicalAssetUrl, discardUploadedAsset, prepareUploadedAsset } from '../lib/assetStorage'
import { mapAssetReferences } from '../lib/assetReferences'
import { goalScore } from '../lib/matchRules'
import { defaultSeasonId } from '../lib/seasonLabels'
import { knockoutRoundSize } from '../lib/matchStages'
import { displayDbStage, toDbStage } from '../lib/databaseMatchStage'
import type {
  AdminUser,
  Club,
  Comment,
  Match,
  MatchEvent,
  MediaAsset,
  Player,
  PlayerSuspension,
  Season,
  SquadEntry,
  Sponsor,
  Story,
  Team,
} from '../types'
import { MIN_SQUAD, isInTeam, seasonIdsOf, withSquad } from '../lib/squadUtils'

/** A player created together with a new club entry. */
export type NewSquadPlayer = Pick<Player, 'fullName' | 'shirtNumber' | 'position' | 'nationality' | 'birthYear'>
/** The squad a club entry is created with: existing players plus new ones. */
export type EntryRoster = { playerIds: number[]; newPlayers: NewSquadPlayer[] }

export type TournamentData = {
  clubs?: Club[]
  seasons: Season[]
  teams: Team[]
  players: Player[]
  matches: Match[]
  stories: Story[]
  media: MediaAsset[]
  sponsors: Sponsor[]
  /** Set when an optional section failed to load, so the UI can say so instead of showing it empty. */
  loadedSeasonId?: number | null
  loadWarning?: string
  /** Offline twin of the database's tournament_player_clubs lock. */
  registrationHistory?: { playerId: number; seasonId: number; clubId: number }[]
}

export type LoadOptions = { mode?: 'admin' | 'public'; seasonId?: number | null; detail?: { kind: 'match' | 'team' | 'story' | 'player'; id: number } }

export async function resolveTournamentAssets(data: TournamentData): Promise<TournamentData> {
  const urls = new Set<string>()
  mapAssetReferences(data, (url) => { urls.add(url); return url })
  const resolved = await assetDisplayUrls([...urls])
  return mapAssetReferences(data, (url) => resolved.get(url))
}

// v8: players carry per-season squads instead of a single teamId.
const storageKey = 'ccl-cup:data:v8'

const initialData = (): TournamentData => ({
  clubs: [],
  seasons: initialSeasons.map((season) => ({ ...season })),
  teams: initialTeams.map((team) => ({ ...team })),
  players: initialPlayers.map((player) => ({ ...player })),
  matches: initialMatches.map((match) => ({ ...match, events: match.events ? [...match.events] : [] })),
  stories: initialStories.map((story) => ({ ...story })),
  media: [],
  sponsors: [],
})

function normalizeLocal(data: TournamentData): TournamentData {
  const kickoff = (m: Match) => m.kickoffAt ?? toKickoffIso(m.date, m.time, data.seasons.find((s) => s.id === m.seasonId)?.year)
  const seasons = data.seasons.map((s) => {
    const fixtures = data.matches.filter((m) => m.seasonId === s.id)
    const dates = fixtures.map(kickoff).filter((d) => Number.isFinite(Date.parse(d))).sort()
    const started = fixtures.filter((m) => m.matchStatus !== 'postponed' &&
      ((m.resultKind !== 'forfeit' && ['live','completed','stopped'].includes(m.matchStatus)) || Date.parse(kickoff(m)) <= Date.now())).map(kickoff).sort()[0]
    return { ...s, startDate: s.startDate ?? dates[0]?.slice(0, 10), startedAt: s.startedAt ?? started }
  })
  const history = [...(data.registrationHistory ?? [])]
  for (const p of data.players) for (const membership of p.squads) {
    if (!seasons.find((s) => s.id === membership.seasonId)?.startedAt || history.some((h) => h.playerId === p.id && h.seasonId === membership.seasonId)) continue
    const team = data.teams.find((t) => t.id === membership.teamId)
    if (team) history.push({ playerId: p.id, seasonId: membership.seasonId, clubId: team.clubId ?? team.id })
  }
  return { ...data, seasons, registrationHistory: history }
}

function loadLocal(): TournamentData {
  try {
    const stored = localStorage.getItem(storageKey)
    if (!stored) return normalizeLocal(initialData())
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
    return normalizeLocal({ ...parsed, media: parsed.media ?? [], sponsors: parsed.sponsors ?? [] })
  } catch {
    return normalizeLocal(initialData())
  }
}

function saveLocal(data: TournamentData) {
  data = normalizeLocal(data)
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return `${date}T${time}:00${ISTANBUL_OFFSET}`
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

  const cityId = await resolveCityId(cityName || 'Antalya')
  if (!cityId) return null
  const existing = await supabase.from('venues').select('id').eq('city_id', cityId).ilike('name', name).limit(1).maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data?.id) return Number(existing.data.id)

  const created = await supabase.from('venues').insert({ name, city_id: cityId }).select('id').single()
  if (created.error) throw created.error
  return Number(created.data.id)
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

async function currentSeasonId(): Promise<number | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('seasons').select('id').eq('status', 'published')
    .order('starts_on', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return data ? Number(data.id) : null
}

async function loadRemote(options: LoadOptions = {}): Promise<TournamentData> {
  if (!supabase) throw new Error('Supabase is not configured.')

  // Every list is read page by page: a single request stops at the API's row cap
  // (1000), which hid players and squads once the archive seasons were imported.
  // Each order ends with `id` so pages neither overlap nor skip rows.
  const db = supabase
  const publicOnly = options.mode === 'public'
  const countFirst = (from: number) => from === 0 ? { count: 'exact' as const } : undefined
  const readSeasons = () => allRows((from, to) => {
    let query = db.from('seasons').select('*', countFirst(from))
    if (publicOnly) query = query.eq('status', 'published')
    return query.order('created_at', { ascending: false }).order('id').range(from, to)
  })
  // Public visitors need the tournament list and one tournament's records.
  // Staff retain the complete workspace for cross-tournament administration.
  const publicSeasons = publicOnly ? await readSeasons() : undefined
  if (publicSeasons?.error) throw publicSeasons.error
  const available = (publicSeasons?.data ?? []).map((s) => ({ id: Number(s.id), status: s.status as Season['status'],
    startDate: s.starts_on ? String(s.starts_on) : undefined, createdAt: String(s.created_at),
    year: Number(s.year), city: String(s.city), name: String(s.name), fullName: String(s.full_name ?? s.name) }))
  let seasonId = available.some((s) => s.id === options.seasonId) ? options.seasonId : defaultSeasonId(available)
  // Shared links must still open their own published tournament when it is
  // different from the current default or a visitor's remembered selection.
  if (publicOnly && options.detail && available.length) {
    const { kind, id } = options.detail
    const result = kind === 'player'
      ? await db.from('squad_memberships').select('season_id').eq('player_id', id).in('season_id', available.map((s) => s.id))
      : await db.from(kind === 'match' ? 'matches' : kind === 'team' ? 'teams' : 'articles').select('season_id').eq('id', id)
    if (result.error) throw result.error
    const ids = new Set((result.data ?? []).map((r) => Number(r.season_id)))
    const candidates = available.filter((s) => ids.has(s.id))
    if (candidates.length && !candidates.some((s) => s.id === seasonId)) seasonId = defaultSeasonId(candidates)
  }
  // Visitors load one season, so its events and lineups ride along with the
  // matches. Staff load every season: nesting ~8k events and ~14k lineup rows
  // in one statement could pass the 8s staff timeout while the other lists load,
  // so for staff they are read as their own paged lists and attached below.
  // Typed as plain strings: supabase-js cannot parse the composed select at compile time.
  const matchBase: string = '*, home:teams!matches_home_team_id_fkey(name), away:teams!matches_away_team_id_fkey(name), venue:venues(name), group:tournament_groups(name)'
  const eventSelect: string = '*, team:teams(name), player:players!match_events_player_id_fkey(full_name), incoming:players!match_events_incoming_player_id_fkey(full_name)'
  const lineupSelect: string = 'match_id, team_id, player_id, player_name, shirt_number, lineup_role, is_goalkeeper'
  const [seasonsRes, teamsRes, matchesRes, storiesRes, playersRes, mediaRes, sponsorsRes, squadsRes, clubsRes, clubRosterRes, eventsRes, lineupsRes] = await Promise.all([
    publicSeasons ?? readSeasons(),
    allRows((from, to) => {
      let query = db.from('teams').select('*', countFirst(from))
      if (publicOnly) query = query.eq('season_id', seasonId ?? -1)
      return query.order('name').order('id').range(from, to)
    }),
    allRows((from, to) => {
      let query = db.from('matches').select(
      publicOnly ? `${matchBase}, match_events(${eventSelect}), match_squads(${lineupSelect})` : matchBase,
      countFirst(from))
      if (publicOnly) query = query.eq('season_id', seasonId ?? -1)
      return query.order('kickoff_at', { ascending: true }).order('id').range(from, to)
    }),
    allRows((from, to) => {
      let query = db.from('articles').select('*', countFirst(from))
      if (publicOnly) query = query.or(seasonId ? `season_id.eq.${seasonId},season_id.is.null` : 'season_id.is.null')
      if (publicOnly) query = query.in('status', ['published', 'scheduled']).lte('published_at', new Date().toISOString())
      return query.order('published_at', { ascending: false }).order('id').range(from, to)
    }),
    allRows((from, to) => {
      const query = publicOnly
        ? db.from('players').select('*, squad_memberships!inner(season_id)', countFirst(from)).eq('squad_memberships.season_id', seasonId ?? -1)
        : db.from('players').select('*', countFirst(from))
      return query.order('full_name').order('id').range(from, to)
    }),
    allRows((from, to) => {
      let query = db.from('media_assets').select('*', countFirst(from))
      if (publicOnly) query = query.or(seasonId ? `season_id.eq.${seasonId},season_id.is.null` : 'season_id.is.null')
      if (publicOnly) query = query.eq('is_published', true)
      return query.order('created_at', { ascending: false }).order('id').range(from, to)
    }),
    allRows((from, to) => {
      let query = db.from('sponsors').select('*', countFirst(from))
      if (publicOnly) query = query.or(seasonId ? `season_id.eq.${seasonId},season_id.is.null` : 'season_id.is.null')
      if (publicOnly) query = query.eq('is_active', true)
      return query.order('display_order', { ascending: true }).order('id').range(from, to)
    }),
    allRows((from, to) => {
      let query = db.from('squad_memberships').select('player_id, team_id, season_id', countFirst(from))
      if (publicOnly) query = query.eq('season_id', seasonId ?? -1)
      return query.order('id').range(from, to)
    }),
    publicOnly ? { data: [], error: null } : allRows((from, to) => db.from('clubs').select('*', countFirst(from)).order('id').range(from, to)),
    publicOnly ? { data: [], error: null } : allRows((from, to) => db.from('club_roster').select('*', countFirst(from)).order('club_id').order('player_id').range(from, to)),
    publicOnly ? { data: [], error: null } : allRows((from, to) => db.from('match_events').select(eventSelect, countFirst(from)).order('id').range(from, to)),
    publicOnly ? { data: [], error: null } : allRows((from, to) => db.from('match_squads').select(lineupSelect, countFirst(from)).order('match_id').order('player_id').range(from, to)),
  ])

  if (teamsRes.error) throw teamsRes.error
  if (seasonsRes.error) throw seasonsRes.error
  if (matchesRes.error) throw matchesRes.error
  if (storiesRes.error) throw storiesRes.error
  if (playersRes.error) throw playersRes.error
  if (squadsRes.error) throw squadsRes.error
  if (clubsRes.error) throw clubsRes.error
  if (clubRosterRes.error) throw clubRosterRes.error
  if (eventsRes.error) throw eventsRes.error
  if (lineupsRes.error) throw lineupsRes.error
  const matchRows = (matchesRes.data ?? []) as unknown as Record<string, unknown>[]
  if (!publicOnly) {
    const byMatch = (rows: Record<string, unknown>[]) => {
      const map = new Map<number, Record<string, unknown>[]>()
      for (const row of rows) {
        const id = Number(row.match_id)
        const list = map.get(id)
        if (list) list.push(row)
        else map.set(id, [row])
      }
      return map
    }
    const events = byMatch((eventsRes.data ?? []) as Record<string, unknown>[])
    const lineups = byMatch((lineupsRes.data ?? []) as Record<string, unknown>[])
    for (const m of matchRows) {
      m.match_events = events.get(Number(m.id)) ?? []
      m.match_squads = lineups.get(Number(m.id)) ?? []
    }
  }
  // Media and sponsors are optional sections: keep the rest of the site up, but say what is missing.
  const missing = [mediaRes.error && 'media', sponsorsRes.error && 'sponsors'].filter(Boolean)

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
    startedAt: s.started_at ? String(s.started_at) : undefined,
    startDate: s.starts_on ? String(s.starts_on) : undefined,
    endDate: s.ends_on ? String(s.ends_on) : undefined,
    createdAt: s.created_at ? String(s.created_at) : undefined,
    lotsOrder: (s.lots_order as number[] | null) ?? undefined,
    status: (s.status as Season['status']) ?? 'published',
  }))

  const teams: Team[] = (teamsRes.data ?? []).map((t: Record<string, unknown>) => ({
    id: Number(t.id),
    // teams.season_id is NOT NULL in the schema but was never mapped, which
    // left every team season-less on the client and made a season filter
    // impossible to build.
    seasonId: t.season_id != null ? Number(t.season_id) : undefined,
    clubId: t.club_id != null ? Number(t.club_id) : undefined,
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
    lineup: (t.lineup as Team['lineup']) ?? undefined,
    played: 0,
    goalDifference: 0,
    points: 0,
    isActive: true,
  }))

  const squadsByPlayer = new Map<number, SquadEntry[]>()
  for (const row of squadsRes.data ?? []) {
    const entry = { seasonId: Number(row.season_id), teamId: Number(row.team_id) }
    squadsByPlayer.set(Number(row.player_id), [...(squadsByPlayer.get(Number(row.player_id)) ?? []), entry])
  }

  const players: Player[] = (playersRes.data ?? []).map((p: Record<string, unknown>) => ({
    id: Number(p.id),
    squads: squadsByPlayer.get(Number(p.id)) ?? [],
    fullName: String(p.full_name),
    shirtNumber: p.shirt_number ? Number(p.shirt_number) : undefined,
    position: (p.position as Player['position']) || 'forward',
    strongFoot: (p.strong_foot as Player['strongFoot']) || 'right',
    birthYear: p.birth_year != null ? Number(p.birth_year) : p.birth_date ? new Date(String(p.birth_date)).getFullYear() : undefined,
    nationality: p.nationality ? String(p.nationality) : 'TR',
    isCaptain: Boolean(p.is_captain),
    activeSeasonIds: seasonIdsOf(squadsByPlayer.get(Number(p.id)) ?? []),
    goals: Number(p.goals || 0),
    assists: Number(p.assists || 0),
    photoUrl: p.photo_url ? String(p.photo_url) : undefined,
  }))

  const matches: Match[] = matchRows.map((m) => {
    const rawEvents = (m.match_events as Record<string, unknown>[]) ?? []
    const events: MatchEvent[] = rawEvents.map((ev) => ({
      id: Number(ev.id),
      matchId: Number(ev.match_id),
      playerId: ev.player_id != null ? Number(ev.player_id) : undefined,
      teamId: ev.team_id ? Number(ev.team_id) : undefined,
      teamName: (ev.team as { name: string } | null)?.name ?? '',
      // Registered players resolve through the join; `player_name` carries
      // scorers who are not on any roster.
      playerName: (ev.player as { full_name: string } | null)?.full_name ?? String(ev.player_name || ''),
      eventType: ev.event_type as MatchEvent['eventType'],
      minute: Number(ev.minute || 0),
      extraMinute: ev.extra_minute != null ? Number(ev.extra_minute) : undefined,
      notes: ev.notes ? String(ev.notes) : undefined,
      incomingPlayerName: (ev.incoming as { full_name: string } | null)?.full_name ?? (ev.incoming_player_name ? String(ev.incoming_player_name) : undefined),
      incomingPlayerId: ev.incoming_player_id != null ? Number(ev.incoming_player_id) : undefined,
      isGoalkeeperChange: Boolean(ev.is_goalkeeper_change),
    }))

    return {
      id: Number(m.id),
      home: (m.home as { name: string } | null)?.name ?? 'Unknown',
      away: (m.away as { name: string } | null)?.name ?? 'Unknown',
      homeTeamId: Number(m.home_team_id),
      awayTeamId: Number(m.away_team_id),
      kickoffAt: m.kickoff_at ? String(m.kickoff_at) : undefined,
      fixtureKey: m.fixture_key ? String(m.fixture_key) : undefined,
      // Prefer the group's own name ("Group A") over the generic phase label.
      stage:
        (m.group as { name: string } | null)?.name ??
        displayDbStage(String(m.stage), seasonsList.find((season) => season.id === Number(m.season_id))),
      date: formatKickoffDate(m.kickoff_at),
      time: formatKickoffTime(m.kickoff_at),
      venue: (m.venue as { name: string } | null)?.name ?? '—',
      matchStatus: (m.match_status as Match['matchStatus']) || 'scheduled',
      lineupSource: m.lineup_source as Match['lineupSource'],
      startedAt: m.started_at ? String(m.started_at) : undefined,
      resultKind: m.result_kind as Match['resultKind'],
      forfeitTeamId: m.forfeit_team_id != null ? Number(m.forfeit_team_id) : undefined,
      decisionNote: m.decision_note ? String(m.decision_note) : undefined,
      scoreSource: m.score_source as Match['scoreSource'],
      squads: ((m.match_squads as Record<string, unknown>[] | null) ?? []).map((row) => ({
        teamId: Number(row.team_id),
        playerId: row.player_id != null ? Number(row.player_id) : undefined,
        playerName: String(row.player_name),
        shirtNumber: row.shirt_number != null ? Number(row.shirt_number) : undefined,
        lineupRole: row.lineup_role as 'starter' | 'bench',
        isGoalkeeper: Boolean(row.is_goalkeeper),
      })),
      homeScore: m.home_score != null ? Number(m.home_score) : undefined,
      awayScore: m.away_score != null ? Number(m.away_score) : undefined,
      homePenalties: m.home_penalties != null ? Number(m.home_penalties) : undefined,
      awayPenalties: m.away_penalties != null ? Number(m.away_penalties) : undefined,
      // Draft fixtures must stay off the public site, so the database's
      // publication_status drives this rather than a hardcoded value.
      seasonId: m.season_id != null ? Number(m.season_id) : undefined,
      status: 'Scheduled',
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
    // articles_status_check allows draft | scheduled | published | archived.
    // Collapsing everything that is not 'published' to 'Draft' made the
    // Scheduled state unreachable even though the form offered it; archived
    // was the same trap one step behind, showing as Draft and inviting an
    // editor to republish something deliberately retired.
    status:
      s.status === 'published'
        ? 'Published'
        : s.status === 'scheduled'
        ? 'Scheduled'
        : s.status === 'archived'
        ? 'Archived'
        : 'Draft',
    publishedAt: s.published_at ? String(s.published_at) : undefined,
    coverImageUrl: s.cover_image_url ? String(s.cover_image_url) : undefined,
    seasonId: s.season_id != null ? Number(s.season_id) : undefined,
  }))

  const media: MediaAsset[] = (mediaRes.data ?? []).map((m: Record<string, unknown>) => ({
    id: Number(m.id),
    title: String(m.title),
    kind: (m.kind as MediaAsset['kind']) || 'video',
    matchId: m.match_id != null ? Number(m.match_id) : undefined,
    externalUrl: m.external_url ? String(m.external_url) : undefined,
    thumbnailUrl: m.thumbnail_url ? String(m.thumbnail_url) : undefined,
    durationSeconds: m.duration_seconds != null ? Number(m.duration_seconds) : undefined,
    isPublished: Boolean(m.is_published),
    createdAt: m.created_at ? String(m.created_at) : undefined,
    seasonId: m.season_id != null ? Number(m.season_id) : undefined,
    sponsorId: m.sponsor_id != null ? Number(m.sponsor_id) : undefined,
  }))

  const sponsors: Sponsor[] = (sponsorsRes.data ?? []).map((s2: Record<string, unknown>) => ({
    id: Number(s2.id),
    name: String(s2.name),
    logoUrl: s2.logo_url ? String(s2.logo_url) : undefined,
    websiteUrl: s2.website_url ? String(s2.website_url) : undefined,
    displayOrder: Number(s2.display_order || 0),
    isActive: Boolean(s2.is_active),
    seasonId: s2.season_id != null ? Number(s2.season_id) : undefined,
  }))

  return resolveTournamentAssets({
    loadedSeasonId: publicOnly ? seasonId ?? null : undefined,
    clubs: (clubsRes.data ?? []).map((c: Record<string, unknown>) => {
      const profile = (c.profile ?? {}) as Partial<Club>
      const entry = teams.find((t) => t.clubId === Number(c.id))
      return { id: Number(c.id), name: String(c.name), countryCode: profile.countryCode ?? entry?.countryCode,
        color: profile.color ?? entry?.color, logoUrl: profile.logoUrl ?? entry?.logoUrl,
        registeredPlayerIds: (clubRosterRes.data ?? []).filter((r: Record<string, unknown>) => Number(r.club_id) === Number(c.id)).map((r: Record<string, unknown>) => Number(r.player_id)) }
    }),
    seasons: seasonsList,
    teams,
    players,
    matches,
    stories,
    media,
    sponsors,
    loadWarning: missing.length ? `Could not load ${missing.join(' and ')}; those sections may look empty. Reload to retry.` : undefined,
  })
}

/** Postgres' unique-violation text means nothing to an admin; name the clash instead. */
function clubSaveError(error: { code?: string; message: string }, name: string): Error {
  if (error.message.includes('squad_memberships_one_club_per_season'))
    return new Error(`A player in ${name}'s squad already plays for another club in that season.`, { cause: error })
  if (error.message.includes('teams_season_club_unique')) return new Error(`${name} is already entered in that season.`, { cause: error })
  if (error.code === '23505') return new Error(`A club called "${name}" is already registered for this season.`, { cause: error })
  return new Error(error.message, { cause: error })
}

// A lost HTTP response may still mean a committed row. Verify it is unused
// before removing a fresh upload; keep the image if that verification fails.
async function discardUnusedClubCrest(asset: UploadedAsset): Promise<void> {
  if (!supabase || !asset.path) return
  const { data, error } = await supabase.from('teams').select('id').eq('logo_url', asset.url!).limit(1)
  if (error) throw error
  if (!data?.length) await discardUploadedAsset(asset)
}

async function reloadAfterClubSave(): Promise<TournamentData> {
  try { return await loadRemote() }
  catch { throw new Error('Club saved, but the data could not be refreshed. Reload before trying to save again.') }
}

const pendingLoads = new Map<string, Promise<TournamentData>>()

export const tournamentRepository = {
  mode: isSupabaseConfigured ? ('supabase' as const) : ('local' as const),

  async load(options: LoadOptions = {}): Promise<TournamentData> {
    // Dev-only stress fixtures (?data=worst|empty|one); see src/dev/worstCase.ts.
    if (import.meta.env.DEV) {
      const kind = new URLSearchParams(window.location.search).get('data')
      if (kind) return (await import('../dev/worstCase')).fixture(kind, initialData())
    }
    if (!isSupabaseConfigured || !supabase) return loadLocal()
    const { data: { session } } = await supabase.auth.getSession()
    const key = `${options.mode ?? 'admin'}:${options.seasonId ?? ''}:${options.detail?.kind ?? ''}:${options.detail?.id ?? ''}:${session?.access_token ?? 'anonymous'}`
    const existing = pendingLoads.get(key)
    if (existing) return existing
    const pending = loadRemote(options)
    pendingLoads.set(key, pending)
    try { return await pending } finally { if (pendingLoads.get(key) === pending) pendingLoads.delete(key) }
  },

  // SEASONS CRUD
  async addSeason(season: Season): Promise<TournamentData> {
    season = mapAssetReferences(season, canonicalAssetUrl)
    if (!supabase) {
      const data = loadLocal()
      return saveLocal({ ...data, seasons: [{ ...season, createdAt: new Date().toISOString() }, ...data.seasons] })
    }
    // A new season does NOT take over as current unless it says so. Defaulting
    // this to true meant every season ever created claimed to be the current
    // one, so the public switcher opened on whichever happened to sort first —
    // including an empty draft, which made the whole portal look broken.

    const { error } = await supabase.from('seasons').insert({
      id: season.id,
      name: season.name,
      slug: `${slugify(season.fullName || season.name)}-${Date.now().toString(36)}`,
      starts_on: season.startDate || null,
      ends_on: season.endDate || null,
      lots_order: season.lotsOrder ?? [],
      // Separate from is_current: only published seasons appear publicly.
      status: season.status ?? 'published',
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
    season = mapAssetReferences(season, canonicalAssetUrl)
    if (!supabase) {
      const data = loadLocal()
      return saveLocal({ ...data, seasons: data.seasons.map((s) => (s.id === season.id ? season : s)) })
    }

    const { error } = await supabase
      .from('seasons')
      .update({
        name: season.name,
        slug: slugify(season.fullName || season.name),
        starts_on: season.startDate || null,
      ends_on: season.endDate || null,
      lots_order: season.lotsOrder ?? [],
        status: season.status ?? 'published',
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
      // Mirrors the database: its entries, squads, fixtures and sponsors go
      // (cascades); articles and media are kept, unpublished, with no season
      // (seasons_hide_content_before_delete).
      const data = loadLocal()
      return saveLocal({
        ...data,
        seasons: data.seasons.filter((s) => s.id !== id),
        teams: data.teams.filter((t) => t.seasonId !== id),
        players: data.players.map((p) => ({ ...p, squads: p.squads.filter((entry) => entry.seasonId !== id) })),
        matches: data.matches.filter((m) => m.seasonId !== id),
        sponsors: data.sponsors.filter((s) => s.seasonId !== id),
        stories: data.stories.map((s) => (s.seasonId === id ? { ...s, status: 'Draft' as const, seasonId: undefined } : s)),
        media: data.media.map((m) => (m.seasonId === id ? { ...m, isPublished: false, seasonId: undefined } : m)),
      })
    }
    const { error } = await supabase.from('seasons').delete().eq('id', id)
    if (error) throw error
    return loadRemote()
  },

  // TEAMS CRUD
  /**
   * Enters a club in a season with its squad: a new club, or an existing one
   * (`team.clubId`) entering another season. The entry and squad are written
   * in one transaction, so the five-player minimum holds from the start.
   */
  async addTeam(team: Team, roster: EntryRoster): Promise<TournamentData> {
    const size = new Set(roster.playerIds).size + roster.newPlayers.length
    if (size < MIN_SQUAD) throw new Error(`Register at least ${MIN_SQUAD} players with ${team.name || 'the club'} (${size} so far).`)
    if (!supabase) {
      const data = loadLocal()
      const seasonId = team.seasonId ?? data.seasons[0]?.id ?? 1
      // Same rules as the database: a club (matched by name) enters a season once.
      const sameClub = (t: Team) => (team.clubId != null && t.clubId === team.clubId) || t.name.trim().toLowerCase() === team.name.trim().toLowerCase()
      if (data.teams.some((t) => t.seasonId === seasonId && sameClub(t))) throw new Error(`${team.name} is already entered in this season.`)
      const entry = { ...team, id: Date.now(), seasonId, clubId: team.clubId ?? data.teams.find(sameClub)?.clubId ?? Date.now() }
      const created = roster.newPlayers.map((player, index) => ({ ...player, id: Date.now() + index + 1, squads: [] as SquadEntry[] }))
      const ids = new Set([...roster.playerIds, ...created.map((player) => player.id)])
      for (const h of data.registrationHistory ?? []) {
        if (h.seasonId === seasonId && ids.has(h.playerId) && h.clubId !== entry.clubId) throw new Error('Players cannot transfer clubs after tournament kickoff.')
      }
      const players = [...data.players, ...created].map((player) => {
        if (!ids.has(player.id)) return player
        const squads = withSquad(player.squads, seasonId, entry.id)
        return { ...player, squads, activeSeasonIds: seasonIdsOf(squads) }
      })
      return saveLocal({ ...data, teams: [...data.teams, entry], players })
    }
    const seasonId = team.seasonId ?? (await currentSeasonId())
    const uniqueSlug = `${slugify(team.name)}-${Date.now().toString(36)}`

    await saveWithAsset(() => prepareUploadedAsset(team.logoUrl, 'logos'), async (logoUrl) => {
      const { error } = await supabase!.rpc('create_season_entry', {
        entry: {
          season_id: seasonId,
          club_id: team.clubId ?? null,
          name: team.name,
          slug: uniqueSlug,
          short_name: team.shortName ?? team.name.slice(0, 3).toUpperCase(),
          country_code: team.countryCode || 'TR',
          country_name: team.countryName || 'Turkey',
          primary_color: team.color,
          secondary_color: team.secondaryColor || '#071525',
          logo_url: logoUrl || null,
          manager_name: team.managerName || null,
          coach_name: team.coachName || null,
          biography: team.bio || null,
          tournament_format: team.tournamentFormat || 'Champions Cup',
          group_name: team.groupName || null,
        },
        player_ids: [...new Set(roster.playerIds)],
        new_players: roster.newPlayers.map((player) => ({
          full_name: player.fullName.trim(),
          shirt_number: player.shirtNumber ?? null,
          position: player.position,
          nationality: player.nationality ?? 'TR',
          birth_year: player.birthYear ?? null,
        })),
      })
      if (error) throw clubSaveError(error, team.name)
    }, discardUnusedClubCrest)
    return reloadAfterClubSave()
  },

  async updateTeam(team: Team): Promise<TournamentData> {
    if (!supabase) {
      const data = loadLocal()
      // A moved entry takes its squad with it, as the cascading key does in the database.
      const before = data.teams.find((t) => t.id === team.id)
      const players = before?.seasonId === team.seasonId ? data.players : data.players.map((p) => ({
        ...p,
        squads: p.squads.map((entry) => (entry.teamId === team.id ? { ...entry, seasonId: team.seasonId! } : entry)),
      }))
      return saveLocal({ ...data, players, teams: data.teams.map((t) => (t.id === team.id ? team : t)) })
    }
    await saveWithAsset(() => prepareUploadedAsset(team.logoUrl, 'logos'), async (logoUrl) => {
      const { error } = await supabase!
        .from('teams')
        // The season can change only while the entry has no matches (a trigger
        // refuses otherwise); its squad follows through the cascading key.
        .update({
          season_id: team.seasonId,
          name: team.name,
          short_name: team.shortName ?? team.name.slice(0, 3).toUpperCase(),
          country_code: team.countryCode || 'TR',
          country_name: team.countryName || 'Turkey',
          primary_color: team.color,
          secondary_color: team.secondaryColor || '#071525',
          logo_url: logoUrl || null,
          manager_name: team.managerName || null,
          coach_name: team.coachName || null,
          biography: team.bio || null,
          tournament_format: team.tournamentFormat || 'Champions Cup',
          group_name: team.groupName || null,
        })
        .eq('id', team.id)
      if (error) throw clubSaveError(error, team.name)
      // Renaming the entry renames the lasting club too, so the next season's
      // entry starts from the current name.
      if (team.clubId != null) {
        const { error: clubError } = await supabase!.from('clubs').update({ name: team.name.trim() }).eq('id', team.clubId)
        if (clubError) throw clubSaveError(clubError, team.name)
      }
    }, discardUnusedClubCrest)
    return reloadAfterClubSave()
  },

  /** Saves a club entry's lineup; squad membership is saved separately (setSquad). */
  async saveLineup(teamId: number, lineup: Lineup): Promise<TournamentData> {
    if (!supabase) {
      const data = loadLocal()
      return saveLocal({ ...data, teams: data.teams.map((t) => (t.id === teamId ? { ...t, lineup } : t)) })
    }
    const { error } = await supabase.from('teams').update({ lineup }).eq('id', teamId)
    if (error) throw new Error(error.message)
    return loadRemote()
  },

  async deleteTeam(id: number): Promise<TournamentData> {
    if (!supabase) {
      const data = loadLocal()
      return saveLocal({
        ...data,
        teams: data.teams.filter((t) => t.id !== id),
        players: data.players.map((p) => {
          const squads = p.squads.filter((entry) => entry.teamId !== id)
          return { ...p, squads, activeSeasonIds: seasonIdsOf(squads) }
        }),
      })
    }
    const { error } = await supabase.from('teams').delete().eq('id', id)
    if (error) throw error
    return loadRemote()
  },

  // PLAYERS CRUD
  /** Creates the person; `player.squads` (at most one per season) become their squad places. */
  async addPlayer(player: Player): Promise<TournamentData> {
    if (!supabase) {
      const data = loadLocal()
      return saveLocal({ ...data, players: [...data.players, { ...player, activeSeasonIds: seasonIdsOf(player.squads) }] })
    }
    const { data: created, error } = await supabase.from('players').insert({
      full_name: player.fullName,
      shirt_number: player.shirtNumber ?? null,
      position: player.position,
      strong_foot: player.strongFoot ?? 'right',
      nationality: player.nationality ?? 'TR',
      is_captain: player.isCaptain ?? false,
      goals: player.goals ?? 0,
      assists: player.assists ?? 0,
      photo_url: canonicalAssetUrl(player.photoUrl) ?? null,
      birth_year: player.birthYear ?? null,
    }).select('id').single()
    if (error) throw error
    if (player.squads.length > 0) {
      const { error: squadError } = await supabase.from('squad_memberships').insert(
        player.squads.map((entry) => ({ player_id: created.id, team_id: entry.teamId, season_id: entry.seasonId })),
      )
      if (squadError) throw new Error(`${player.fullName} was saved as a free agent, but could not join the squad: ${squadError.message}`)
    }
    return loadRemote()
  },

  async updatePlayer(player: Player): Promise<TournamentData> {
    if (!supabase) {
      const data = loadLocal()
      return saveLocal({ ...data, players: data.players.map((p) => (p.id === player.id ? { ...player, squads: p.squads } : p)) })
    }
    const { error } = await supabase
      .from('players')
      // Person fields only; squad places change through setSquad.
      .update({
        full_name: player.fullName,
        shirt_number: player.shirtNumber ?? null,
        position: player.position,
        strong_foot: player.strongFoot ?? 'right',
        nationality: player.nationality ?? 'TR',
        is_captain: player.isCaptain ?? false,
        goals: player.goals ?? 0,
        assists: player.assists ?? 0,
        photo_url: canonicalAssetUrl(player.photoUrl) ?? null,
        birth_year: player.birthYear ?? null,
      })
      .eq('id', player.id)
    if (error) throw error
    return loadRemote()
  },

  /**
   * Puts a player in a club entry's squad for its season (a transfer if they
   * were with another club that season), or releases them from the season
   * when `teamId` is null. Transfers lock at the first non-postponed kickoff.
   */
  async setSquad(playerId: number, seasonId: number, teamId: number | null): Promise<TournamentData> {
    if (!supabase) {
      const data = loadLocal()
      const player = data.players.find((p) => p.id === playerId)
      if (!player) throw new Error('This player no longer exists.')
      const original = player.squads.find((entry) => entry.seasonId === seasonId)
      const locked = data.registrationHistory?.find((h) => h.playerId === playerId && h.seasonId === seasonId)
      const target = data.teams.find((t) => t.id === teamId)
      if (teamId != null && locked && locked.clubId !== (target?.clubId ?? target?.id)) throw new Error('Players cannot transfer after tournament kickoff.')
      if (teamId != null && (!target || target.seasonId !== seasonId)) throw new Error('Choose a club registered in this tournament.')
      if (original?.teamId === teamId) return data
      const squads = withSquad(player.squads, seasonId, teamId)
      return saveLocal({ ...data, players: data.players.map((p) => (p.id === playerId ? { ...p, squads, activeSeasonIds: seasonIdsOf(squads) } : p)) })
    }
    const { error } = teamId == null
      ? await supabase.from('squad_memberships').delete().eq('player_id', playerId).eq('season_id', seasonId)
      : await supabase.from('squad_memberships').upsert(
          { player_id: playerId, team_id: teamId, season_id: seasonId },
          { onConflict: 'player_id,season_id' },
        )
    if (error) throw new Error(error.message)
    return loadRemote()
  },

  async deletePlayer(id: number): Promise<TournamentData> {
    if (!supabase) {
      const data = loadLocal()
      return saveLocal({ ...data, players: data.players.filter((p) => p.id !== id) })
    }
    const { error } = await supabase.from('players').delete().eq('id', id)
    if (error) throw new Error(error.message)
    return loadRemote()
  },

  // MATCHES CRUD
  async generateFixtures(seasonId: number, options: FixtureOptions): Promise<TournamentData> {
    const data = supabase ? await loadRemote() : loadLocal()
    const season = data.seasons.find((item) => item.id === seasonId)
    if (!season) throw new Error('This season no longer exists. Refresh and choose a season.')
    const plan = planFixtures(season, data.teams, data.matches, options)
    if (options.expectedKeys && plan.fixtures.some((match) => !options.expectedKeys!.includes(match.fixtureKey!))) throw new Error('The table or draw changed while you reviewed the schedule. Reload and preview the fixtures again before saving.')
    if (!plan.fixtures.length) return data
    if (!supabase) {
      const nextId = Math.max(0, ...data.matches.map((match) => match.id)) + 1
      return saveLocal({ ...data, matches: [...data.matches, ...plan.fixtures.map((match, index) => ({ ...match, id: nextId + index }))] })
    }
    const venueId = await resolveVenueId(options.venue, season.city)
    const groupIds = new Map(await Promise.all([...new Set(plan.fixtures.map((match) => match.stage))].map(async (stage) =>
      [stage, await resolveGroupId(stage, seasonId)] as const)))
    const rows = plan.fixtures.map((match) => ({
        season_id: seasonId, home_team_id: match.homeTeamId, away_team_id: match.awayTeamId,
        fixture_key: match.fixtureKey, stage: toDbStage(match.stage), group_id: groupIds.get(match.stage),
        venue_id: venueId, kickoff_at: match.kickoffAt, match_status: 'scheduled',
        publication_status: 'published',
    }))
    // One statement: no half-created schedule, and retries never overwrite scores.
    const { error } = await supabase.from('matches').upsert(rows, { onConflict: 'season_id,fixture_key', ignoreDuplicates: true })
    if (error) {
      if (error.code === 'PGRST204' || error.code === '42703' || error.code === '42P10') throw new Error('Fixture generation needs the latest database migration (202610120001_generated_fixtures.sql).')
      throw error
    }
    try { return await loadRemote() } catch {
      throw new Error('Fixtures were saved, but the data could not be refreshed. Reload to see them; generating again will keep existing games.')
    }
  },

  async addMatch(match: Match): Promise<TournamentData> {
    if (!supabase) {
      const data = loadLocal()
      const clubs = data.teams.filter((team) => team.seasonId == null || team.seasonId === match.seasonId)
      return saveLocal({ ...data, matches: [{ ...match, homeTeamId: clubs.find((team) => team.name === match.home)?.id, awayTeamId: clubs.find((team) => team.name === match.away)?.id }, ...data.matches] })
    }
    // The form now carries a season; currentSeasonId is only the fallback for
    // callers that predate the field.
    const seasonId = match.seasonId ?? (await currentSeasonId())
    if (!seasonId) throw new Error('No season exists yet. Create a season before adding fixtures.')

    const { data: teams } = await supabase.from('teams').select('id, name').eq('season_id', seasonId)
    const homeTeam = (teams ?? []).find((t: { id: number; name: string }) => match.homeTeamId != null ? Number(t.id) === match.homeTeamId : t.name === match.home)
    const awayTeam = (teams ?? []).find((t: { id: number; name: string }) => match.awayTeamId != null ? Number(t.id) === match.awayTeamId : t.name === match.away)
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
      publication_status: 'published',
      home_score: match.homeScore ?? null,
      away_score: match.awayScore ?? null,
      home_penalties: match.homePenalties ?? null,
      away_penalties: match.awayPenalties ?? null,
      referee_name: match.referee ?? null,
      stream_url: match.streamUrl ?? null,
    })
    if (error) throw error
    return loadRemote()
  },

  async updateMatch(match: Match): Promise<TournamentData> {
    if (!supabase) {
      const data = loadLocal()
      const previous = data.matches.find((m) => m.id === match.id)
      match = { ...match, events: previous?.events ?? [], status: 'Scheduled' }
      if (match.resultKind === 'forfeit') {
        if (![match.homeTeamId, match.awayTeamId].includes(match.forfeitTeamId) || !match.decisionNote?.trim()) throw new Error('Select the forfeiting club and record the staff decision.')
        match = { ...match, homeScore: match.forfeitTeamId === match.homeTeamId ? 0 : 3, awayScore: match.forfeitTeamId === match.awayTeamId ? 0 : 3, homePenalties: undefined, awayPenalties: undefined }
      } else if (match.scoreSource !== 'legacy') {
        const [homeScore, awayScore] = goalScore(match)
        match = { ...match, homeScore, awayScore }
      }
      if (match.matchStatus === 'completed' && knockoutRoundSize(match.stage) != null && match.homeScore === match.awayScore &&
        (match.homePenalties == null || match.awayPenalties == null || match.homePenalties === match.awayPenalties)) throw new Error('A drawn knockout match requires direct penalties with a winner.')
      if (match.resultKind !== 'forfeit' && ['live','completed'].includes(match.matchStatus) && !previous?.startedAt) {
        for (const side of [match.homeTeamId, match.awayTeamId]) {
          const starters = match.squads?.filter((p) => p.teamId === side && p.lineupRole === 'starter') ?? []
          if (starters.length < 6 || starters.length > 8 || starters.filter((p) => p.isGoalkeeper).length !== 1) throw new Error('Select six to eight starters per side, including one goalkeeper.')
        }
        match = { ...match, startedAt: new Date().toISOString() }
      }
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

    const { error } = await supabase.rpc('save_match_details', {
      fixture: match.id,
      details: {
        stage: toDbStage(match.stage),
        group_id: await resolveGroupId(match.stage, seasonId),
        venue_id: venueId,
        kickoff_at: toKickoffIso(match.kickoffAt && formatKickoffDate(match.kickoffAt) === match.date ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(match.kickoffAt)) : match.date, match.time, season?.year ? Number(season.year) : undefined),
        match_status: match.matchStatus,
        publication_status: 'published',
        home_score: match.scoreSource === 'legacy' ? match.homeScore ?? null : null,
        away_score: match.scoreSource === 'legacy' ? match.awayScore ?? null : null,
        home_penalties: match.homePenalties ?? null,
        away_penalties: match.awayPenalties ?? null,
        referee_name: match.referee ?? null,
        stream_url: match.streamUrl ?? null,
        result_kind: match.resultKind ?? 'normal',
        forfeit_team_id: match.forfeitTeamId ?? null,
        decision_note: match.decisionNote ?? null,
      },
      lineups: match.startedAt || !match.squads ? null : match.squads.map((p) => ({
        team_id: p.teamId, player_id: p.playerId, lineup_role: p.lineupRole ?? 'bench', is_goalkeeper: p.isGoalkeeper ?? false,
      })),
    })
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
      const fixture = data.matches.find((match) => match.id === matchId)
      if (!fixture || ![fixture.home, fixture.away].includes(event.teamName)) throw new Error('Choose a club in this fixture.')
      const teamId = event.teamId ?? (event.teamName === fixture.home ? fixture.homeTeamId : fixture.awayTeamId)
      const candidates = data.players.filter((player) => teamId != null && isInTeam(player, teamId) && (event.playerId != null ? player.id === event.playerId : player.fullName === event.playerName))
      if (candidates.length !== 1) throw new Error('This player is no longer on the selected club. Select a current player.')
      const linkedEvent = { ...event, teamId, playerId: candidates.length === 1 ? candidates[0].id : undefined }
      return saveLocal({
        ...data,
        matches: data.matches.map((m) => {
          if (m.id !== matchId) return m
          const currentEvents = m.events ?? []
          return { ...m, ...scoreAfterEvent(m, linkedEvent, 1), events: [...currentEvents, linkedEvent] }
        }),
      })
    }
    // Resolve the team from the fixture, never from a global name search.
    const { data: fixture, error: fixtureError } = await supabase.from('matches')
      .select('home_team_id, away_team_id, home:teams!matches_home_team_id_fkey(name), away:teams!matches_away_team_id_fkey(name)')
      .eq('id', matchId).single()
    if (fixtureError) throw fixtureError
    const sides = [
      { id: Number(fixture.home_team_id), name: (fixture.home as unknown as { name: string }).name },
      { id: Number(fixture.away_team_id), name: (fixture.away as unknown as { name: string }).name },
    ]
    const team = sides.find((side) => event.teamId != null ? side.id === event.teamId : side.name === event.teamName)
    if (!team) throw new Error('The event team must be one of the clubs in this fixture.')
    const teamId = team.id
    let playerId: number | null = event.playerId ?? null
    if (playerId != null) {
      const { data: player, error } = await supabase.from('squad_memberships').select('player_id').eq('player_id', playerId).eq('team_id', teamId).maybeSingle()
      if (error) throw error
      if (!player) throw new Error('This player is no longer on the selected club. Select a current player.')
    } else {
      const { data: members, error } = await supabase.from('squad_memberships')
        .select('player_id, player:players!inner(full_name)').eq('team_id', teamId).eq('player.full_name', event.playerName.trim())
      if (error) throw error
      if (members?.length === 1) playerId = Number(members[0].player_id)
    }

    if (playerId == null) throw new Error('Select a registered squad player for this event.')

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
      incoming_player_id: event.incomingPlayerId ?? null,
      is_goalkeeper_change: event.isGoalkeeperChange ?? false,
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
          const removed = currentEvents.find((ev) => ev.id === eventId)
          return { ...m, ...(removed ? scoreAfterEvent(m, removed, -1) : {}), events: currentEvents.filter((ev) => ev.id !== eventId) }
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
      cover_image_url: canonicalAssetUrl(story.coverImageUrl) ?? null,
      season_id: story.seasonId ?? null,
      published_at: status === 'scheduled' ? story.publishedAt ?? null : status === 'published' ? story.publishedAt ?? new Date().toISOString() : null,
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

    // articles_published_date requires published_at when status is 'published'.
    // Keep the original timestamp: overwriting it meant editing a published
    // story silently changed the date it went out.
    const { data: existing } = await supabase
      .from('articles')
      .select('published_at')
      .eq('id', story.id)
      .maybeSingle()

    const { error } = await supabase
      .from('articles')
      .update({
        title: story.title,
        slug: slugify(story.title),
        summary: story.summary ?? null,
        body: story.body ?? null,
        category: story.category ?? 'news',
        status,
        cover_image_url: canonicalAssetUrl(story.coverImageUrl) ?? null,
        season_id: story.seasonId ?? null,
        published_at:
          status === 'scheduled' ? story.publishedAt ?? null : status === 'published' ? (existing?.published_at ?? new Date().toISOString()) : null,
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
  /** The season being viewed; feedback is listed and moderated per season. */
  seasonId?: number | null
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
  async listApproved(seasonId: number | undefined): Promise<Comment[]> {
    if (!supabase) {
      return loadLocalComments().filter((comment) => comment.status === 'approved' && (seasonId == null || comment.seasonId === seasonId))
    }
    try {
      let query = supabase.from('comments').select('*').eq('status', 'approved')
      if (seasonId != null) query = query.eq('season_id', seasonId)
      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []).map((row: Record<string, unknown>) => ({
        id: Number(row.id),
        authorName: String(row.author_name),
        body: String(row.body),
        matchId: row.match_id != null ? Number(row.match_id) : null,
        storyId: row.story_id != null ? Number(row.story_id) : null,
        seasonId: row.season_id != null ? Number(row.season_id) : null,
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

  /**
   * Submits a comment. It lands as `pending`; the `submit-comment` Edge
   * Function then screens it with TypeSafe and may approve it on the spot,
   * which is the only way this resolves to `'approved'`. If the function is
   * not deployed or unreachable, the comment is inserted directly and waits
   * for a moderator, exactly as before screening existed.
   */
  async submit(draft: CommentDraft): Promise<'approved' | 'pending'> {
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
        seasonId: draft.seasonId ?? null,
        status: 'pending',
      }
      localStorage.setItem(commentsStorageKey, JSON.stringify([comment, ...existing]))
      return 'pending'
    }

    const screened = await supabase.functions.invoke<{ status?: string }>('submit-comment', {
      body: { authorName, body, matchId: draft.matchId ?? null, storyId: draft.storyId ?? null, seasonId: draft.seasonId ?? null },
    })
    if (!screened.error) return screened.data?.status === 'approved' ? 'approved' : 'pending'
    // A 400 is the function rejecting the input: show its message. Anything
    // else (not deployed, network, 5xx before the insert) falls back below.
    if (screened.error instanceof FunctionsHttpError) {
      const response = screened.error.context as Response
      if (response.status === 400) {
        const detail = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(detail?.error ?? 'Your comment could not be sent.')
      }
    }
    console.warn('Comment screening unavailable; submitting for manual review:', screened.error)

    const { error } = await supabase.from('comments').insert({
      author_name: authorName,
      body,
      match_id: draft.matchId ?? null,
      story_id: draft.storyId ?? null,
      season_id: draft.seasonId ?? null,
      status: 'pending',
    })
    if (error) {
      if (error.code === '42P01') {
        throw new Error('Comments are not enabled yet. Run the 202608260001 migration to switch them on.')
      }
      throw error
    }
    return 'pending'
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
    seasonId: row.season_id != null ? Number(row.season_id) : null,
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
    screening: mapScreening(row.comment_screenings),
  }
}

/** PostgREST embeds a one-to-one relation as an object; tolerate an array too. */
function mapScreening(value: unknown): Comment['screening'] {
  const row = (Array.isArray(value) ? value[0] : value) as Record<string, unknown> | null | undefined
  if (!row) return undefined
  return {
    action: row.action as NonNullable<Comment['screening']>['action'],
    reasons: Array.isArray(row.reasons) ? row.reasons.map(String) : [],
    hazards: (row.hazards as Record<string, number> | null) ?? {},
    severity: Number(row.severity),
    model: String(row.model),
    policy: String(row.policy),
  }
}

export const moderationRepository = {
  /** Every comment regardless of status, with its TypeSafe screening when one
   *  exists — staff only, enforced by RLS on both tables. */
  async listAll(): Promise<Comment[]> {
    const client = requireSupabase('Comment moderation')
    const withScreening = await client
      .from('comments')
      .select('*, comment_screenings(*)')
      .order('created_at', { ascending: false })
    if (!withScreening.error) return (withScreening.data ?? []).map(mapComment)

    // PGRST200: no such relationship, i.e. 202609190001 has not been applied
    // yet. Moderation still works; it just has no screening to show.
    if (withScreening.error.code !== 'PGRST200') throw withScreening.error
    const { data, error } = await client
      .from('comments')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(mapComment)
  },

  /** Screens (or re-screens) one comment with TypeSafe via the Edge Function.
   *  The function applies the policy only while the comment is still pending. */
  async rescreen(id: number): Promise<void> {
    const client = requireSupabase('Comment screening')
    const { error } = await client.functions.invoke('submit-comment', { body: { commentId: id } })
    if (!error) return
    if (error instanceof FunctionsHttpError) {
      const detail = (await (error.context as Response).json().catch(() => null)) as { error?: string } | null
      if (detail?.error) throw new Error(detail.error)
    }
    throw new Error('Screening is unavailable. Is the submit-comment function deployed?')
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

export const suspensionsRepository = {
  async list(playerId: number): Promise<PlayerSuspension[]> {
    const db = requireSupabase('Suspensions')
    const { data, error } = await db.from('player_suspensions').select('*').eq('player_id', playerId).order('issued_at', { ascending: false })
    if (error) throw new Error(error.message)
    return Promise.all((data ?? []).map(async (r) => {
      const served = r.match_count ? await db.rpc('suspension_served', { suspension: r.id }) : { data: 0, error: null }
      if (served.error) throw new Error(served.error.message)
      return { id: Number(r.id), playerId: Number(r.player_id), seasonId: Number(r.season_id), teamId: Number(r.team_id),
        reason: String(r.reason), matchCount: r.match_count != null ? Number(r.match_count) : undefined,
        endsOn: r.ends_on ? String(r.ends_on) : undefined, issuedAt: String(r.issued_at), revokedAt: r.revoked_at ? String(r.revoked_at) : undefined,
        served: Number(served.data) }
    }))
  },
  async issue(input: Pick<PlayerSuspension, 'playerId' | 'seasonId' | 'teamId' | 'reason' | 'matchCount' | 'endsOn'>): Promise<void> {
    const { error } = await requireSupabase('Suspensions').from('player_suspensions').insert({
      player_id: input.playerId, season_id: input.seasonId, team_id: input.teamId, reason: input.reason,
      match_count: input.matchCount ?? null, ends_on: input.endsOn ?? null,
    })
    if (error) throw new Error(error.message)
  },
  async revoke(id: number): Promise<void> {
    const { error } = await requireSupabase('Suspensions').from('player_suspensions').update({ revoked_at: new Date().toISOString() }).eq('id', id)
    if (error) throw new Error(error.message)
  },
}

export const clubsRepository = {
  async save(club: Club, newPlayers: NewSquadPlayer[]): Promise<void> {
    const clean = mapAssetReferences(club, canonicalAssetUrl)
    if (!supabase) {
      const data = loadLocal()
      const created = newPlayers.map((p, index) => ({ ...p, id: Date.now() + index + 1, squads: [] }))
      const saved = { ...clean, id: clean.id || Date.now(), registeredPlayerIds: [...clean.registeredPlayerIds, ...created.map((p) => p.id)] }
      saveLocal({ ...data, clubs: [...(data.clubs ?? []).filter((c) => c.id !== saved.id), saved], players: [...data.players, ...created] })
      return
    }
    const { error } = await supabase.rpc('save_registered_club', {
      club: clean.id || null, details: clean, player_ids: clean.registeredPlayerIds,
      new_players: newPlayers.map((p) => ({ full_name: p.fullName, position: p.position, shirt_number: p.shirtNumber ?? null, nationality: p.nationality ?? 'TR', birth_year: p.birthYear ?? null })),
    })
    if (error) throw new Error(error.message, { cause: error })
  },
  /** Deletes a registered club with no season entries; the database refuses otherwise. */
  async remove(id: number): Promise<void> {
    if (!supabase) {
      const data = loadLocal()
      if (data.teams.some((t) => t.clubId === id)) throw new Error('Remove this club from every season before deleting it')
      saveLocal({ ...data, clubs: (data.clubs ?? []).filter((c) => c.id !== id) })
      return
    }
    const { error } = await supabase.rpc('delete_registered_club', { club: id })
    if (error) throw new Error(error.message, { cause: error })
  },
}

export const mediaRepository = {
  async save(asset: MediaAsset): Promise<void> {
    const client = requireSupabase('Media')
    const payload = {
      title: asset.title,
      kind: asset.kind,
      external_url: canonicalAssetUrl(asset.externalUrl) || null,
      thumbnail_url: canonicalAssetUrl(asset.thumbnailUrl) || null,
      duration_seconds: asset.durationSeconds ?? null,
      is_published: asset.isPublished,
      season_id: asset.seasonId ?? null,
      ...(asset.matchId !== undefined ? { match_id: asset.matchId } : {}),
      sponsor_id: asset.sponsorId ?? null,
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
      logo_url: canonicalAssetUrl(sponsor.logoUrl) || null,
      website_url: sponsor.websiteUrl || null,
      display_order: sponsor.displayOrder,
      is_active: sponsor.isActive,
      season_id: sponsor.seasonId ?? null,
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

const siteSettingsKey = 'ccl-cup:site-settings:v1'

export const siteSettingsRepository = {
  /** The site settings row, or the defaults when it cannot be read. Never throws. */
  async get(): Promise<SiteSettings> {
    if (!supabase) {
      try {
        const stored = localStorage.getItem(siteSettingsKey)
        return stored ? { ...DEFAULT_SITE_SETTINGS, ...(JSON.parse(stored) as Partial<SiteSettings>) } : DEFAULT_SITE_SETTINGS
      } catch {
        return DEFAULT_SITE_SETTINGS
      }
    }
    const { data, error } = await supabase.from('site_settings').select('*').eq('id', true).maybeSingle()
    if (error || !data) {
      if (error) console.warn('Site settings unavailable; showing defaults:', error)
      return DEFAULT_SITE_SETTINGS
    }
    return {
      aboutIntro: String(data.about_intro ?? ''),
      aboutHistory: String(data.about_history ?? ''),
      aboutVision: String(data.about_vision ?? ''),
      rules: Array.isArray(data.rules) ? data.rules.map(String) : [],
      venueNote: String(data.venue_note ?? ''),
      instagramUrl: String(data.instagram_url ?? ''),
      youtubeUrl: String(data.youtube_url ?? ''),
      linkedinUrl: String(data.linkedin_url ?? ''),
      whatsappNumber: String(data.whatsapp_number ?? ''),
      whatsappMessage: String(data.whatsapp_message ?? ''),
    }
  },

  /** Validates, then saves; returns what was stored. */
  async save(input: SiteSettings): Promise<SiteSettings> {
    const { settings, error } = cleanSiteSettings(input)
    if (error) throw new Error(error)
    if (!supabase) {
      localStorage.setItem(siteSettingsKey, JSON.stringify(settings))
      return settings
    }
    const { error: saveError } = await supabase.from('site_settings').upsert({
      id: true,
      about_intro: settings.aboutIntro,
      about_history: settings.aboutHistory,
      about_vision: settings.aboutVision,
      rules: settings.rules,
      venue_note: settings.venueNote,
      instagram_url: settings.instagramUrl,
      youtube_url: settings.youtubeUrl,
      linkedin_url: settings.linkedinUrl,
      whatsapp_number: settings.whatsappNumber,
      whatsapp_message: settings.whatsappMessage,
    })
    if (saveError) throw new Error(saveError.message)
    return settings
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

import { initialMatches, initialPlayers, initialSeasons, initialStories, initialTeams } from '../data'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { Match, MatchEvent, Player, Season, Story, Team } from '../types'

export type TournamentData = {
  seasons: Season[]
  teams: Team[]
  players: Player[]
  matches: Match[]
  stories: Story[]
}

const storageKey = 'ccl-cup:data:v7'

const initialData = (): TournamentData => ({
  seasons: initialSeasons.map((season) => ({ ...season })),
  teams: initialTeams.map((team) => ({ ...team })),
  players: initialPlayers.map((player) => ({ ...player })),
  matches: initialMatches.map((match) => ({ ...match, events: match.events ? [...match.events] : [] })),
  stories: initialStories.map((story) => ({ ...story })),
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
    return parsed
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

  const [seasonsRes, teamsRes, matchesRes, storiesRes, playersRes] = await Promise.all([
    supabase.from('seasons').select('*').order('created_at', { ascending: false }),
    supabase.from('teams').select('*').order('name'),
    supabase
      .from('matches')
      .select('*, home:teams!matches_home_team_id_fkey(name), away:teams!matches_away_team_id_fkey(name), match_events(*)')
      .order('kickoff_at', { ascending: true }),
    supabase.from('articles').select('*').order('published_at', { ascending: false }),
    supabase.from('players').select('*, team:teams(name)').order('full_name'),
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
    teamId: Number(p.team_id),
    teamName: (p.team as { name: string } | null)?.name ?? 'Unknown Team',
    fullName: String(p.full_name),
    shirtNumber: p.shirt_number ? Number(p.shirt_number) : undefined,
    position: (p.position as Player['position']) || 'forward',
    strongFoot: (p.strong_foot as Player['strongFoot']) || 'right',
    birthYear: p.birth_date ? new Date(String(p.birth_date)).getFullYear() : undefined,
    nationality: p.nationality ? String(p.nationality) : 'TR',
    isCaptain: Boolean(p.is_captain),
    activeSeasons: Array.isArray(p.active_seasons) ? (p.active_seasons as string[]) : ['2026 - Summer League'],
    goals: Number(p.goals || 0),
    assists: Number(p.assists || 0),
  }))

  const matches: Match[] = (matchesRes.data ?? []).map((m: Record<string, unknown>) => {
    const rawEvents = (m.match_events as Record<string, unknown>[]) ?? []
    const events: MatchEvent[] = rawEvents.map((ev) => ({
      id: Number(ev.id),
      matchId: Number(ev.match_id),
      teamName: String(ev.team_name || ''),
      playerName: String(ev.player_name || ''),
      eventType: ev.event_type as MatchEvent['eventType'],
      minute: Number(ev.minute || 0),
      notes: ev.notes ? String(ev.notes) : undefined,
    }))

    return {
      id: Number(m.id),
      home: (m.home as { name: string } | null)?.name ?? 'Unknown',
      away: (m.away as { name: string } | null)?.name ?? 'Unknown',
      stage: String(m.stage || 'Group Stage'),
      date: new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(new Date(String(m.kickoff))),
      time: new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(String(m.kickoff))),
      venue: String(m.venue || 'Central Arena'),
      matchStatus: (m.status as Match['matchStatus']) || 'scheduled',
      homeScore: m.home_score != null ? Number(m.home_score) : undefined,
      awayScore: m.away_score != null ? Number(m.away_score) : undefined,
      status: 'Scheduled',
      referee: m.referee ? String(m.referee) : undefined,
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

  return {
    seasons: seasonsList.length > 0 ? seasonsList : initialSeasons,
    teams,
    players,
    matches,
    stories,
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
      team_id: player.teamId,
      full_name: player.fullName,
      shirt_number: player.shirtNumber ?? null,
      position: player.position,
      strong_foot: player.strongFoot ?? 'right',
      nationality: player.nationality ?? 'TR',
      is_captain: player.isCaptain ?? false,
      active_seasons: player.activeSeasons ?? ['2026 - Summer League'],
      goals: player.goals ?? 0,
      assists: player.assists ?? 0,
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
        team_id: player.teamId,
        full_name: player.fullName,
        shirt_number: player.shirtNumber ?? null,
        position: player.position,
        strong_foot: player.strongFoot ?? 'right',
        nationality: player.nationality ?? 'TR',
        is_captain: player.isCaptain ?? false,
        active_seasons: player.activeSeasons ?? ['2026 - Summer League'],
        goals: player.goals ?? 0,
        assists: player.assists ?? 0,
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
    const seasonId = await currentSeasonId()
    const { data: teams } = await supabase.from('teams').select('id, name')
    const homeTeam = (teams ?? []).find((t: { name: string }) => t.name === match.home)
    const awayTeam = (teams ?? []).find((t: { name: string }) => t.name === match.away)
    if (!homeTeam || !awayTeam) throw new Error('Selected teams do not exist.')

    const [day, mon] = match.date.split(' ')
    const year = new Date().getFullYear()
    const monthIndex = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(mon)
    const [h, m] = match.time.split(':').map(Number)
    const kickoff = new Date(Date.UTC(year, monthIndex >= 0 ? monthIndex : 7, Number(day) || 15, h || 20, m || 0)).toISOString()

    const { error } = await supabase.from('matches').insert({
      id: match.id,
      season_id: seasonId,
      home_team_id: homeTeam.id,
      away_team_id: awayTeam.id,
      stage: match.stage,
      venue: match.venue,
      kickoff,
      status: match.matchStatus,
      home_score: match.homeScore ?? null,
      away_score: match.awayScore ?? null,
      referee: match.referee ?? null,
    })
    if (error) throw error
    return loadRemote()
  },

  async updateMatch(match: Match): Promise<TournamentData> {
    if (!supabase) {
      const data = loadLocal()
      return saveLocal({ ...data, matches: data.matches.map((m) => (m.id === match.id ? match : m)) })
    }
    const { error } = await supabase
      .from('matches')
      .update({
        stage: match.stage,
        venue: match.venue,
        status: match.matchStatus,
        home_score: match.homeScore ?? null,
        away_score: match.awayScore ?? null,
        referee: match.referee ?? null,
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
    const { error } = await supabase.from('match_events').insert({
      id: event.id,
      match_id: matchId,
      team_name: event.teamName,
      player_name: event.playerName,
      event_type: event.eventType,
      minute: event.minute,
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
    const { error } = await supabase.from('articles').insert({
      id: story.id,
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

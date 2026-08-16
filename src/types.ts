export type TournamentFormat = 'Champions Cup' | 'Challenge Cup' | 'Open League'

export type SeasonType = 'tournament' | 'league' | 'group_league'

export type BracketSlot = {
  slotId: string
  teamId?: number | null
  teamName?: string
  teamLogo?: string
  teamColor?: string
  teamCountryCode?: string
}

export type BracketMatch = {
  matchId: string
  label: string
  slot1: BracketSlot
  slot2: BracketSlot
}

export type BracketRound = {
  roundIndex: number
  roundName: string
  matches: BracketMatch[]
}

export type TournamentBracket = {
  teamCount: number
  rounds: BracketRound[]
  championSlot?: BracketSlot
}

export type LeagueSlot = {
  position: number
  teamId?: number | null
  teamName?: string
  teamLogo?: string
  teamColor?: string
  teamCountryCode?: string
}

export type SeasonLeague = {
  teamCount: number
  slots: LeagueSlot[]
}

export type SeasonGroup = {
  id: string
  name: string // e.g. "Grup A", "Grup B", etc.
  slots: LeagueSlot[]
}

export type SeasonGroupLeague = {
  groupCount: number
  groups: SeasonGroup[]
}

export type Season = {
  id: number
  city: string
  year: number
  name: string
  fullName: string
  seasonType?: SeasonType
  teamCount?: number
  groupCount?: number
  bracket?: TournamentBracket
  league?: SeasonLeague
  groupLeague?: SeasonGroupLeague
  parentSeasonId?: number | null
  parentSeasonName?: string
  isActive?: boolean
  startDate?: string
  endDate?: string
}

export const HOST_CITIES = [
  'Antalya',
  'İstanbul',
  'İzmir',
  'Ankara',
  'Bursa',
  'Bodrum',
  'London',
  'Frankfurt',
  'Amsterdam',
  'Rome',
  'Madrid',
  'Paris',
]

export type Team = {
  id: number
  seasonId?: number
  name: string
  shortName?: string
  countryCode: string
  countryName?: string
  logoUrl?: string
  color: string
  secondaryColor?: string
  managerName?: string
  coachName?: string
  bio?: string
  tournamentFormat?: TournamentFormat
  groupName?: string
  played: number
  goalDifference: number
  points: number
  isActive?: boolean
}

export const AVAILABLE_SEASONS = [
  '2026 - Summer League',
  '2026 - CCL Cup',
  '2025 - CCL Cup',
  '2025 - Winter League',
  '2024 - CCL Cup',
]

export type PlayerPosition = 'goalkeeper' | 'defender' | 'midfielder' | 'forward'
export type StrongFoot = 'left' | 'right' | 'both'

export type Player = {
  id: number
  teamId: number
  teamName: string
  fullName: string
  shirtNumber?: number
  position: PlayerPosition
  strongFoot?: StrongFoot
  birthYear?: number
  nationality?: string
  isCaptain?: boolean
  activeSeasons?: string[]
  goals?: number
  assists?: number
}



export type MatchEventType = 'goal' | 'yellow_card' | 'red_card' | 'substitution' | 'penalty_scored'

export type MatchEvent = {
  id: number
  matchId: number
  teamId?: number
  teamName: string
  playerName: string
  eventType: MatchEventType
  minute: number
  extraMinute?: number
  notes?: string
}

export type MatchStatus = 'scheduled' | 'live' | 'completed' | 'postponed'

export type Match = {
  id: number
  home: string
  away: string
  stage: string
  date: string
  time: string
  venue: string
  referee?: string
  homeScore?: number
  awayScore?: number
  matchStatus: MatchStatus
  status: 'Scheduled' | 'Draft'
  events?: MatchEvent[]
}

export type StoryCategory = 'news' | 'match_report' | 'announcement' | 'press' | 'panorama'

export type Story = {
  id: number
  title: string
  summary?: string
  body?: string
  category?: StoryCategory
  status: 'Published' | 'Draft' | 'Scheduled'
  coverImageUrl?: string
  publishedAt?: string
}

export type View = 'site' | 'admin'
export type AdminSection = 'Overview' | 'Seasons' | 'Teams' | 'Players' | 'Matches' | 'Standings' | 'Content' | 'Media' | 'Sponsors' | 'Users'


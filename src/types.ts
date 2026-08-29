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
  /** slotId of the slot that won. Drives progression into the next round. */
  winnerSlotId?: string | null
  /**
   * The team the result was recorded for.
   *
   * Kept alongside the slot because a slot's occupant changes when an earlier
   * result is revised. Without it, "slot 1 won" would silently transfer the
   * win to whoever arrives in slot 1 next — crowning a team that never played
   * the match.
   */
  winnerTeamId?: number | null
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
  /**
   * Seasons this player is registered for, by season id.
   *
   * Replaces the previous string[] of display labels, which broke whenever a
   * season was renamed — the live data had already drifted into two different
   * labels for the same season.
   */
  activeSeasonIds?: number[]
  goals?: number
  assists?: number
  /**
   * Cutout portrait, ideally a transparent PNG. Rendered over the player's
   * country flag on roster cards, so a background-free image looks best.
   */
  photoUrl?: string
}

/** Mirrors the media_assets_kind_check constraint exactly. */
export type MediaKind = 'photo' | 'video' | 'highlight' | 'press_conference' | 'panorama' | 'document'

export type MediaAsset = {
  id: number
  title: string
  kind: MediaKind
  externalUrl?: string
  thumbnailUrl?: string
  durationSeconds?: number
  isPublished: boolean
  createdAt?: string
  /** Which season this asset belongs to; undefined means it is not season-specific. */
  seasonId?: number
}

export type Sponsor = {
  id: number
  name: string
  logoUrl?: string
  websiteUrl?: string
  displayOrder: number
  isActive: boolean
  /** Which season this sponsor backs; undefined means it runs across seasons. */
  seasonId?: number
}

/** A staff account as the Users module sees it. */
export type AdminUser = {
  id: string
  fullName: string
  role: 'super_admin' | 'admin' | 'editor' | 'match_operator' | 'viewer'
  createdAt?: string
}



/**
 * The subset of match_events_event_type_check the client offers.
 *
 * The constraint also permits 'own_goal' and 'penalty_missed'. Neither is
 * recorded or rendered yet, so they are deliberately absent here rather than
 * declared and unhandled — but a row carrying one can still arrive from SQL,
 * which is why the timeline falls back to a neutral marker instead of drawing
 * nothing.
 */
export type MatchEventType =
  | 'goal'
  | 'assist'
  | 'yellow_card'
  | 'red_card'
  | 'substitution'
  | 'penalty_scored'

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
  /** The season this fixture belongs to. Stored, not inferred from its clubs. */
  seasonId?: number
  matchStatus: MatchStatus
  status: 'Scheduled' | 'Draft'
  /**
   * External broadcast link (YouTube or similar). When a match is live and
   * this is set, the public site turns the LIVE badge into a link out.
   */
  streamUrl?: string
  events?: MatchEvent[]
}

export type CommentStatus = 'pending' | 'approved' | 'rejected'

/**
 * A visitor-submitted comment. Submissions always land as `pending`; only
 * rows a moderator has approved are ever readable by the public, which is
 * enforced by row-level security rather than by this type.
 */
export type Comment = {
  id: number
  authorName: string
  body: string
  matchId?: number | null
  storyId?: number | null
  status: CommentStatus
  createdAt?: string
}

export type StoryCategory = 'news' | 'match_report' | 'announcement' | 'press' | 'panorama'

export type Story = {
  id: number
  title: string
  summary?: string
  body?: string
  category?: StoryCategory
  /** Mirrors articles_status_check: draft | scheduled | published | archived. */
  status: 'Published' | 'Draft' | 'Scheduled' | 'Archived'
  coverImageUrl?: string
  publishedAt?: string
  /** Which season this story belongs to; undefined means it is not season-specific. */
  seasonId?: number
}

export type View = 'site' | 'admin'
export type AdminSection = 'Overview' | 'Seasons' | 'Teams' | 'Players' | 'Matches' | 'Standings' | 'Content' | 'Comments' | 'Media' | 'Sponsors' | 'Users'


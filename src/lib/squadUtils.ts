import type { Match, MatchSquadPlayer, Player, Season, SquadEntry, Team } from '../types'
import { latestSeasons } from './seasonLabels'

/** Minimum only when entering a tournament; registration has no minimum. */
export const MIN_SQUAD = 5

export const isInTeam = (player: Player, teamId: number) => player.squads.some((entry) => entry.teamId === teamId)

export const squadOf = (players: Player[], teamId: number) => players.filter((player) => isInTeam(player, teamId))

/** The club entry a player plays for in a season, if any. */
export const playerTeamId = (player: Player, seasonId: number | undefined) =>
  seasonId == null ? undefined : player.squads.find((entry) => entry.seasonId === seasonId)?.teamId

/** Their squad place in the earliest season of `seasonOrder` (newest first) — for season-less views. */
export const latestSquad = (player: Player, seasonOrder: number[]): SquadEntry | undefined => {
  const rank = (entry: SquadEntry) => {
    const index = seasonOrder.indexOf(entry.seasonId)
    return index < 0 ? Infinity : index
  }
  return [...player.squads].sort((a, b) => rank(a) - rank(b))[0]
}

export const seasonIdsOf = (squads: SquadEntry[]) => [...new Set(squads.map((entry) => entry.seasonId))]

/**
 * Moves a player into `teamId` for a season (replacing any other club that
 * season), or out of that season when `teamId` is null.
 */
export function withSquad(squads: SquadEntry[], seasonId: number, teamId: number | null): SquadEntry[] {
  const others = squads.filter((entry) => entry.seasonId !== seasonId)
  return teamId == null ? others : [...others, { seasonId, teamId }]
}

/**
 * Why removing `count` players from a squad of `size` would break the
 * minimum, or '' if it would not. Mirrors the database check so the UI can
 * explain before saving.
 */
export function entrySquadError(size: number) {
  return size < MIN_SQUAD
    ? `Select at least ${MIN_SQUAD} players to enter this tournament (${size} selected).`
    : ''
}

export const seasonEntries = (teams: Team[], seasonId: number | undefined) =>
  seasonId == null ? teams : teams.filter((team) => team.seasonId === seasonId)

/** A new entry reuses the club identity while leaving every older entry intact. */
export function seasonsForClubEntry(club: Team, entries: Team[], seasons: Season[]): Season[] {
  const key = (team: Team) => team.clubId ?? team.name.trim().toLowerCase()
  const entered = new Set(entries.filter((team) => key(team) === key(club)).map((team) => team.seasonId))
  return latestSeasons(seasons.filter((season) => season.id !== club.seasonId && season.status !== 'archived' && !entered.has(season.id)))
}

/**
 * Clubs not entered in `seasonId` yet, each as its most recent entry (by
 * `seasonOrder`, newest first) — the template for entering it again.
 */
export function clubsToEnter(teams: Team[], seasonId: number, seasonOrder: number[]): Team[] {
  const key = (team: Team) => team.clubId ?? team.name.trim().toLowerCase()
  const rank = (team: Team) => {
    const index = team.seasonId == null ? -1 : seasonOrder.indexOf(team.seasonId)
    return index < 0 ? Infinity : index
  }
  const entered = new Set(seasonEntries(teams, seasonId).map(key))
  const latest = new Map<number | string, Team>()
  for (const team of teams) {
    if (entered.has(key(team))) continue
    const current = latest.get(key(team))
    if (!current || rank(team) < rank(current)) latest.set(key(team), team)
  }
  return [...latest.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr'))
}

/**
 * Who played for a side in a match: the squad recorded at completion when
 * there is one, otherwise the club entry's current squad.
 */
export function matchSquad(match: Pick<Match, 'squads'>, teamId: number | undefined, players: Player[]): MatchSquadPlayer[] {
  if (teamId == null) return []
  const recorded = match.squads?.filter((entry) => entry.teamId === teamId)
  if (recorded && recorded.length > 0) return recorded
  return squadOf(players, teamId).map((player) => ({
    teamId,
    playerId: player.id,
    playerName: player.fullName,
    shirtNumber: player.shirtNumber,
  }))
}

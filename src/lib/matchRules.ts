import type { Match, MatchSquadPlayer, Player, Team } from '../types'
import { squadOf } from './squadUtils'

export function goalScore(match: Match): [number, number] {
  let home = 0, away = 0
  for (const e of match.events ?? []) {
    if (!['goal', 'penalty_scored', 'own_goal'].includes(e.eventType)) continue
    const homeClub = e.teamId != null ? e.teamId === match.homeTeamId : e.teamName === match.home
    const awayClub = e.teamId != null ? e.teamId === match.awayTeamId : e.teamName === match.away
    if (homeClub) { if (e.eventType === 'own_goal') away++; else home++ }
    else if (awayClub) { if (e.eventType === 'own_goal') home++; else away++ }
  }
  return [home, away]
}

/** A starting point for staff review; it never writes a completion snapshot. */
export function defaultMatchLineups(match: Match, teams: Team[], players: Player[]): MatchSquadPlayer[] {
  if (match.squads?.length) return match.squads
  return [match.homeTeamId, match.awayTeamId].flatMap((teamId) => {
    if (teamId == null) return []
    const team = teams.find((t) => t.id === teamId)
    const members = squadOf(players, teamId)
    const ids = team?.lineup?.formation === '8v8' ? Object.values(team.lineup.starters) : []
    const keeper = members.find((p) => p.id === team?.lineup?.starters.gk) ?? members.find((p) => p.position === 'goalkeeper')
    const selected = ids.length ? ids.filter((id) => members.some((p) => p.id === id)) : [keeper?.id, ...members.filter((p) => p.id !== keeper?.id).map((p) => p.id)].filter((id): id is number => id != null).slice(0, 8)
    return members.map((p) => ({ teamId, playerId: p.id, playerName: p.fullName, shirtNumber: p.shirtNumber,
      lineupRole: selected.includes(p.id) ? 'starter' as const : 'bench' as const, isGoalkeeper: p.id === keeper?.id }))
  })
}

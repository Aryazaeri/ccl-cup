import type { BracketMatch, Match, Season } from '../types'

export function knockoutFixtureKey(tie: BracketMatch): string {
  return `knockout:${tie.matchId}:${[tie.slot1.teamId, tie.slot2.teamId].sort((a, b) => (a ?? 0) - (b ?? 0)).join(':')}`
}

export function hasFixtureTeams(match: Match, home: { id?: number | null; name: string }, away: { id?: number | null; name: string }): boolean {
  const norm = (name: string) => name.trim().toLocaleLowerCase('tr')
  const isTeam = (id: number | undefined, name: string, team: typeof home) =>
    id != null && team.id != null ? id === team.id : norm(name) === norm(team.name)
  return (isTeam(match.homeTeamId, match.home, home) && isTeam(match.awayTeamId, match.away, away)) ||
    (isTeam(match.homeTeamId, match.home, away) && isTeam(match.awayTeamId, match.away, home))
}

/** The fixture stage, rather than the clubs, distinguishes table and cup results. */
export function knockoutRoundSize(stage: string): number | null {
  const value = stage.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  if (value.includes('thirdplace')) return null
  // Playoff draws (see seedQualifiedBracket) sit at the 32 and 16 levels.
  if (value.includes('roundof32') || value.includes('preliminary')) return 32
  if (value.includes('playoff')) return 16
  if (value.includes('roundof16')) return 16
  if (value.includes('quarter')) return 8
  if (value.includes('semi')) return 4
  if (value === 'final' || value === 'grandfinal') return 2
  return null
}

export function tableStageMatches(season: Season | null | undefined, matches: Match[]): Match[] {
  if (season?.seasonType !== 'league' && season?.seasonType !== 'group_league' && !season?.bracket?.qualification) return matches
  return matches.filter((match) => {
    const stage = match.stage.toLowerCase().replace(/[^a-z0-9]/g, '')
    return knockoutRoundSize(match.stage) === null && !stage.includes('knockout') && !stage.includes('thirdplace')
  })
}

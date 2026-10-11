import type { Match, Season } from '../types'

/** The fixture stage, rather than the clubs, distinguishes table and cup results. */
export function knockoutRoundSize(stage: string): number | null {
  const value = stage.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  if (value.includes('thirdplace')) return null
  if (value.includes('roundof32')) return 32
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

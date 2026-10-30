import type { BracketMatch, Match, Season, Team, TournamentBracket } from '../types'
import { autoSeedBracket, generateEmptyBracket, recomputeProgression } from './bracketUtils'
import { computeGroupStandings, isCountableMatch } from './standingsUtils'
import { hasFixtureTeams, knockoutFixtureKey, knockoutRoundSize, tableStageMatches } from './matchStages'
export { knockoutRoundSize, tableStageMatches } from './matchStages'

const normalize = (name: string) => name.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]/g, '')

/** Display the score alongside the seeded club, even with reversed home/away. */
export function bracketMatchScores(tie: BracketMatch, fixture?: Match): [number | undefined, number | undefined] {
  if (!fixture) return [undefined, undefined]
  return (fixture.homeTeamId != null && tie.slot1.teamId != null ? fixture.homeTeamId === tie.slot1.teamId : normalize(fixture.home) === normalize(tie.slot1.teamName ?? ''))
    ? [fixture.homeScore, fixture.awayScore]
    : [fixture.awayScore, fixture.homeScore]
}

export function qualificationOptions(tableCount: number): number[] {
  const full = [1, 2, 4, 8, 16].filter((perTable) => [2, 4, 8, 16].includes(perTable * tableCount))
  // A single table can also send 9–15 clubs into a playoff draw.
  return tableCount === 1 ? [...full, 9, 10, 11, 12, 13, 14, 15].sort((a, b) => a - b) : full
}

export const isPlayoffDraw = (qualifiers: number) => qualifiers > 8 && qualifiers < 16

export const isByeTie = (tie: BracketMatch) => Boolean(tie.slot1.bye || tie.slot2.bye)

/**
 * Top four go straight to the quarter-finals; 5th onward play a playoff round, and
 * clubs below 12th first meet in a preliminary round. For 13 clubs: 12th v 13th,
 * winner v 5th, 6th v 11th, 7th v 10th, 8th v 9th; winners meet 4th, 3rd, 2nd, 1st.
 */
function playoffBracket(ranked: Team[]): TournamentBracket {
  const size = ranked.length > 12 ? 32 : 16
  // Rank r takes seed r (r + 8 below 12th), so seeds 13–20 stay empty and the top four get byes.
  const bySeed = new Map(ranked.map((team, i) => [i < 12 ? i + 1 : i + 9, team]))
  const bracket = autoSeedBracket(generateEmptyBracket(size), seedOrder(size).map((seed) => bySeed.get(seed)) as Team[], false)
  for (const tie of bracket.rounds[0].matches) for (const slot of [tie.slot1, tie.slot2]) if (slot.teamId == null) slot.bye = true
  const names = size === 32 ? ['Preliminary round', 'Playoff round'] : ['Playoff round']
  const shown = recomputeProgression(bracket)
  names.forEach((name, r) => {
    bracket.rounds[r].roundName = name
    let n = 0
    bracket.rounds[r].matches.forEach((tie, m) => { tie.label = isByeTie(shown.rounds[r].matches[m]) ? name : `${name} #${++n}` })
  })
  return bracket
}

export function qualificationPreview(season: Season, teams: Team[], matches: Match[]) {
  const perTable = season.bracket?.qualification?.qualifiersPerTable ?? 2
  const stageMatches = tableStageMatches(season, matches.filter((match) => match.seasonId == null || match.seasonId === season.id))
  const groups = computeGroupStandings(teams, stageMatches, season)
  const tableMatches = stageMatches.filter((match) => groups.some((group) => {
    const names = new Set(group.rows.map((row) => normalize(row.teamName)))
    const ids = new Set(group.rows.map((row) => row.teamId))
    return (match.homeTeamId != null ? ids.has(match.homeTeamId) : names.has(normalize(match.home))) &&
      (match.awayTeamId != null ? ids.has(match.awayTeamId) : names.has(normalize(match.away)))
  }))
  const teamCount = groups.length * perTable
  const qualifiers = groups.flatMap((group) => group.rows.slice(0, perTable).map((row) => ({
    ...row,
    qualificationLabel: `${group.groupName} #${row.position}`,
    groupId: group.groupId,
  })))
  const meetings = stageMatches.some((match) => match.fixtureKey?.startsWith('table:') && match.fixtureKey.endsWith(':2')) ? 2 : 1
  let missing = 0
  for (const group of groups) {
    for (let i = 0; i < group.rows.length; i++) {
      for (const other of group.rows.slice(i + 1)) {
        const row = group.rows[i]
        const count = tableMatches.filter((match) => hasFixtureTeams(match, { id: row.teamId, name: row.teamName }, { id: other.teamId, name: other.teamName })).length
        missing += Math.max(0, meetings - count)
      }
    }
  }
  let reason = ''
  if (!qualificationOptions(groups.length).includes(perTable)) reason = 'Choose a format with 2, 4, 8 or 16 qualifiers in Season settings.'
  else if (groups.some((group) => group.rows.length < perTable)) reason = 'Assign enough clubs to every table before qualification.'
  else if (new Set(groups.flatMap((group) => group.rows.map((row) => row.teamId))).size !== groups.reduce((sum, group) => sum + group.rows.length, 0)) reason = 'A club is assigned to more than one table. Correct the group assignments first.'
  else if (tableMatches.length === 0) reason = 'Add and complete the table-stage fixtures first.'
  else if (groups.some((g) => g.rows.slice(0, perTable).some((r) => r.lotsPending))) reason = 'Record the drawing-of-lots order for tied clubs before qualification.'
  else if (tableMatches.some((match) => !isCountableMatch(match))) reason = 'Complete all table-stage fixtures before generating the knockout draw.'
  else if (groups.some((group) => group.rows.some((row) => row.played === 0))) reason = 'Every club must have a completed table-stage result before qualification.'
  else if (missing) reason = `${missing} table-stage fixture${missing === 1 ? ' is' : 's are'} missing. Use Matches → Plan fixtures to complete the schedule before qualification.`
  return { groups, qualifiers, teamCount, perTable, ready: !reason, reason }
}

/** Standard seeded order keeps the top seeds in opposite halves of the draw. */
function seedOrder(count: number): number[] {
  let seeds = [1, 2]
  while (seeds.length < count) {
    const sum = seeds.length * 2 + 1
    seeds = seeds.flatMap((seed) => [seed, sum - seed])
  }
  return seeds
}

export function seedQualifiedBracket(season: Season, teams: Team[], matches: Match[], seededAt = new Date().toISOString()): TournamentBracket {
  const preview = qualificationPreview(season, teams, matches)
  if (!preview.ready) throw new Error(preview.reason)
  return buildQualifiedBracket(preview, teams, seededAt)
}

/** A provisional draw never sets seededAt or persists anything. */
export function previewQualifiedBracket(season: Season, teams: Team[], matches: Match[]): TournamentBracket | null {
  const preview = qualificationPreview(season, teams, matches)
  if (!qualificationOptions(preview.groups.length).includes(preview.perTable) || preview.qualifiers.length !== preview.teamCount) return null
  return buildQualifiedBracket(preview, teams)
}

function buildQualifiedBracket(preview: ReturnType<typeof qualificationPreview>, teams: Team[], seededAt?: string): TournamentBracket {
  // Rank across tables first (A1, B1, A2, B2). Seeded pairing then puts
  // winners against lower-ranked clubs from another table in the first round.
  const ranked = Array.from({ length: preview.perTable }, (_, rank) => preview.groups.map((group) => group.rows[rank])).flat()
  const rankedTeams = ranked.map((row) => teams.find((team) => team.id === row.teamId)!)
  const bracket = isPlayoffDraw(preview.teamCount)
    ? playoffBracket(rankedTeams)
    : autoSeedBracket(generateEmptyBracket(preview.teamCount), seedOrder(preview.teamCount).map((seed) => rankedTeams[seed - 1]), false)
  bracket.qualification = { qualifiersPerTable: preview.perTable, ...(seededAt ? { seededAt } : {}) }
  for (const match of bracket.rounds[0].matches) {
    for (const slot of [match.slot1, match.slot2]) slot.qualificationLabel = preview.qualifiers.find((row) => row.teamId === slot.teamId)?.qualificationLabel
  }
  return bracket
}

/** Keep the public draw and admin canvas in sync with the Matches screen. */
export function bracketWithResults(bracket: TournamentBracket, matches: Match[]): TournamentBracket {
  let next = recomputeProgression(bracket)
  for (let r = 0; r < next.rounds.length; r++) {
    const round = next.rounds[r]
    for (const tie of round.matches) {
      const home = normalize(tie.slot1.teamName ?? '')
      const away = normalize(tie.slot2.teamName ?? '')
      const candidates = home && away ? matches.filter((match) => knockoutRoundSize(match.stage) === round.matches.length * 2 &&
        (match.fixtureKey ? match.fixtureKey === knockoutFixtureKey(tie) : hasFixtureTeams(match, { id: tie.slot1.teamId, name: tie.slot1.teamName ?? '' }, { id: tie.slot2.teamId, name: tie.slot2.teamName ?? '' }))) : []
      const fixture = candidates.find((match) => match.fixtureKey === knockoutFixtureKey(tie)) ?? (candidates.length === 1 ? candidates[0] : undefined)
      if (!fixture && tie.resultMatchId === undefined) continue // A manually recorded canvas result.
      tie.resultMatchId = fixture?.id
      tie.winnerSlotId = null
      tie.winnerTeamId = null
      if (!fixture || !isCountableMatch(fixture)) continue
      let homeWon: boolean | null = null
      if (fixture.homeScore! > fixture.awayScore!) homeWon = true
      else if (fixture.awayScore! > fixture.homeScore!) homeWon = false
      else if (fixture.homePenalties != null && fixture.awayPenalties != null && fixture.homePenalties !== fixture.awayPenalties) {
        homeWon = fixture.homePenalties > fixture.awayPenalties
      }
      if (homeWon != null) {
        const homeIsFirst = fixture.homeTeamId != null && tie.slot1.teamId != null ? fixture.homeTeamId === tie.slot1.teamId : normalize(fixture.home) === home
        const slot = homeWon === homeIsFirst ? tie.slot1 : tie.slot2
        tie.winnerSlotId = slot.slotId
        tie.winnerTeamId = slot.teamId
      }
    }
    // Rebuild before reading the following round's pairings.
    next = recomputeProgression(next)
  }
  return next
}

import type { Match, Season, Team } from '../types'
import { bracketWithResults } from './qualificationUtils'
import { seasonLabel } from './seasonLabels'
import { hasFixtureTeams, knockoutFixtureKey, knockoutRoundSize, tableStageMatches } from './matchStages'

export type FixtureOptions = {
  phase: 'table' | 'knockout'
  legs: 1 | 2
  startDate: string
  time: string
  venue: string
  daysBetweenRounds: number
  minutesBetweenMatches: number
  publication: Match['status']
  /** Only the games reviewed in the preview may be created. */
  expectedKeys?: string[]
}
export type FixturePlan = { fixtures: Match[]; skipped: number; waiting: number }

/** Circle scheduling includes a bye for odd pools; each club plays once per round. */
export function roundRobin(ids: number[]): [number, number][][] {
  if (new Set(ids).size !== ids.length) throw new Error('A club is assigned more than once.')
  if (ids.length < 2) throw new Error('Each table needs at least two clubs.')
  const ring: (number | null)[] = [...ids]
  if (ring.length % 2) ring.push(null)
  const rounds: [number, number][][] = []
  for (let r = 0; r < ring.length - 1; r++) {
    const pairs: [number, number][] = []
    for (let i = 0; i < ring.length / 2; i++) {
      const a = ring[i], b = ring[ring.length - 1 - i]
      if (a != null && b != null) pairs.push((r + i) % 2 ? [b, a] : [a, b])
    }
    rounds.push(pairs)
    ring.splice(1, 0, ring.pop()!)
  }
  return rounds
}

function validateOptions(options: FixtureOptions) {
  const day = new Date(`${options.startDate}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.startDate) || !Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== options.startDate) throw new Error('Choose a valid first match date.')
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(options.time)) throw new Error('Choose a valid kickoff time.')
  if (!options.venue.trim()) throw new Error('Enter the venue for these fixtures.')
  if (![1, 2].includes(options.legs)) throw new Error('Choose one or two meetings per pair.')
  if (!Number.isInteger(options.daysBetweenRounds) || options.daysBetweenRounds < 1 || options.daysBetweenRounds > 365) throw new Error('Days between rounds must be between 1 and 365.')
  if (!Number.isInteger(options.minutesBetweenMatches) || options.minutesBetweenMatches < 1 || options.minutesBetweenMatches > 1440) throw new Error('Minutes between games must be between 1 and 1440.')
}

/** Pure preview; the repository recomputes it against fresh data before writing. */
export function planFixtures(season: Season, teams: Team[], matches: Match[], options: FixtureOptions): FixturePlan {
  validateOptions(options)
  const pool = teams.filter((team) => team.seasonId == null || team.seasonId === season.id)
  const club = (id: number | null | undefined): Team => {
    const team = pool.find((item) => item.id === id)
    // Name the season: the planner opens on the current season, which may not be the one being worked on.
    if (!team) throw new Error(`${seasonLabel(season)}: a club in its table or draw is not entered in this season. Re-save that table or draw, or choose another season.`)
    return team
  }
  const existing = matches.filter((match) => match.seasonId === season.id || (match.seasonId == null && pool.some((team) => team.name === match.home) && pool.some((team) => team.name === match.away)))
  const plan: FixturePlan = { fixtures: [], skipped: 0, waiting: 0 }
  const usedTimes = new Map<number, number>()
  const add = (home: Team, away: Team, stage: string, key: string, round: number) => {
    const index = usedTimes.get(round) ?? 0
    usedTimes.set(round, index + 1)
    const date = new Date(`${options.startDate}T${options.time}:00Z`)
    date.setUTCDate(date.getUTCDate() + round * options.daysBetweenRounds)
    date.setUTCMinutes(date.getUTCMinutes() + index * options.minutesBetweenMatches)
    const kickoffAt = `${date.toISOString().slice(0, 19)}+03:00`
    const prior = plan.fixtures.at(-1)
    if (prior?.kickoffAt && Date.parse(kickoffAt) <= Date.parse(prior.kickoffAt)) throw new Error('The rounds overlap. Increase days between rounds or reduce minutes between games.')
    plan.fixtures.push({ id: 0, seasonId: season.id, home: home.name, away: away.name, homeTeamId: home.id, awayTeamId: away.id, stage, fixtureKey: key, kickoffAt,
      date: new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'Europe/Istanbul' }).format(new Date(kickoffAt)),
      time: kickoffAt.slice(11, 16), venue: options.venue.trim(), matchStatus: 'scheduled', status: options.publication, events: [] })
  }
  if (options.phase === 'knockout') {
    if (!season.bracket?.rounds.length || (season.bracket.qualification && !season.bracket.qualification.seededAt)) throw new Error('Save a seeded knockout draw first.')
    const bracket = bracketWithResults(season.bracket, existing)
    let readyRound = 0
    for (const round of bracket.rounds) {
      for (const tie of round.matches) {
        if (!tie.slot1.teamId || !tie.slot2.teamId) { plan.waiting++; continue }
        const home = club(tie.slot1.teamId), away = club(tie.slot2.teamId)
        const key = knockoutFixtureKey(tie)
        const roundMatches = existing.filter((match) => knockoutRoundSize(match.stage) === round.matches.length * 2)
        // A corrected upstream result must not silently create a second final.
        if (existing.some((match) => match.fixtureKey?.startsWith(`knockout:${tie.matchId}:`) && match.fixtureKey !== key)) throw new Error(`${round.roundName} has a fixture for different clubs. Review that fixture in Matches before generating again.`)
        if (roundMatches.some((match) => match.fixtureKey === key || hasFixtureTeams(match, home, away))) { plan.skipped++; continue }
        add(home, away, round.matches.length === 1 ? 'Final' : round.roundName, key, readyRound)
      }
      if (plan.fixtures.length) readyRound++
    }
    return plan
  }
  const groups = season.seasonType === 'group_league'
    ? season.groupLeague?.groups.map((group) => ({ id: group.id, name: group.name, ids: group.slots.filter((slot) => slot.teamId != null).map((slot) => slot.teamId!) }))
    : season.seasonType === 'league'
      ? [{ id: 'league', name: 'League', ids: season.league?.slots.filter((slot) => slot.teamId != null).map((slot) => slot.teamId!) ?? [] }]
      : undefined
  if (!groups?.length) throw new Error('Save a league table or group tables first.')
  const ids = groups.flatMap((group) => group.ids)
  if (new Set(ids).size !== ids.length) throw new Error('A club is assigned to more than one table.')
  const schedules = groups.map((group) => ({ ...group, rounds: roundRobin(group.ids) }))
  const roundCount = Math.max(...schedules.map((group) => group.rounds.length))
  const tables = tableStageMatches(season, existing)
  for (let leg = 1; leg <= options.legs; leg++) {
    for (let r = 0; r < roundCount; r++) {
      for (const group of schedules) {
        for (const [a, b] of group.rounds[r] ?? []) {
          let home = club(leg === 1 ? a : b), away = club(leg === 1 ? b : a)
          const key = `table:${group.id}:${[a, b].sort((x, y) => x - y).join(':')}:${leg}`
          const already = tables.filter((match) => hasFixtureTeams(match, home, away))
          // Count legacy/manual meetings towards the requested one/two legs.
          if (existing.some((match) => match.fixtureKey === key) || already.length >= leg) { plan.skipped++; continue }
          if (leg === 2 && already.length === 1 && (already[0].homeTeamId != null ? already[0].homeTeamId === home.id : already[0].home === home.name)) [home, away] = [away, home]
          add(home, away, group.name, key, (leg - 1) * roundCount + r)
        }
      }
    }
  }
  return plan
}

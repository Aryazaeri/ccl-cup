import assert from 'node:assert/strict'
import { displayDbStage, toDbStage } from '../src/lib/databaseMatchStage'
import { planFixtures, roundRobin, type FixtureOptions } from '../src/lib/fixtureUtils'
import { autoSeedBracket, generateEmptyBracket } from '../src/lib/bracketUtils'
import { bracketWithResults } from '../src/lib/qualificationUtils'
import type { Match, Season, Team } from '../src/types'

const teams: Team[] = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, seasonId: 1, name: `Club ${i + 1}`, countryCode: 'TR', color: '#123456', played: 0, goalDifference: 0, points: 0 }))
const league: Season = { id: 1, name: 'Test', fullName: 'Test league', city: 'Antalya', year: 2026, seasonType: 'league', league: { teamCount: 5, slots: teams.map((team, index) => ({ position: index + 1, teamId: team.id })) } }
const options: FixtureOptions = { phase: 'table', legs: 1, startDate: '2026-12-30', time: '18:00', venue: 'Test Ground', daysBetweenRounds: 7, minutesBetweenMatches: 120, publication: 'Draft' }
let checks = 0
function check(name: string, fn: () => void) { fn(); checks++; console.log(`  ok   ${name}`) }

check('all odd/even pools from 2–32 play every opponent exactly once without double booking a club in a round', () => {
  for (let count = 2; count <= 32; count++) {
    const schedule = roundRobin(Array.from({ length: count }, (_, i) => i + 1))
    const pairs = schedule.flat().map((pair) => [...pair].sort((a, b) => a - b).join(':'))
    assert.equal(pairs.length, count * (count - 1) / 2)
    assert.equal(new Set(pairs).size, pairs.length)
    for (const round of schedule) assert.equal(new Set(round.flat()).size, round.flat().length)
  }
})
check('a club entered in another season is rejected, naming the season checked', () => {
  const foreign = { ...league, league: { teamCount: 2, slots: [{ position: 1, teamId: 1 }, { position: 2, teamId: 99 }] } }
  assert.throws(() => planFixtures(foreign, teams, [], options), /^Error: 2026 — Test: a club in its table or draw is not entered in this season/)
})
check('duplicate assignments and incomplete tables are rejected', () => {
  assert.throws(() => roundRobin([1, 1]), /more than once/)
  assert.throws(() => roundRobin([1]), /at least two/)
})
const first = planFixtures(league, teams, [], options)
check('five clubs get ten fixtures visible with their parent tournament with exact dates across New Year', () => {
  assert.equal(first.fixtures.length, 10)
  assert.ok(first.fixtures.every((m) => m.status === 'Scheduled' && m.homeTeamId !== m.awayTeamId && m.kickoffAt?.endsWith('+03:00')))
  assert.equal(first.fixtures[2].kickoffAt?.slice(0, 10), '2027-01-06')
  assert.equal(new Set(first.fixtures.map((m) => m.fixtureKey)).size, 10)
})
check('retry preserves generated fixtures and scores', () => {
  const saved = first.fixtures.map((m, index) => ({ ...m, id: index + 1, homeScore: 3, awayScore: 1, matchStatus: 'completed' as const }))
  assert.equal(planFixtures(league, teams, saved, options).fixtures.length, 0)
  assert.equal(saved[0].homeScore, 3)
})
check('home-and-away planning is rejected', () => {
  assert.throws(() => planFixtures(league, teams, [], { ...options, legs: 2 }), /one match per pair/)
})
check('manual fixtures count towards the schedule, other seasons do not', () => {
  const manual = { ...first.fixtures[0], fixtureKey: undefined, id: 99 }
  assert.equal(planFixtures(league, teams, [manual], options).fixtures.length, 9)
  assert.equal(planFixtures(league, teams, [{ ...manual, seasonId: 2 }], options).fixtures.length, 10)
  const reversed = { ...manual, home: manual.away, away: manual.home, homeTeamId: manual.awayTeamId, awayTeamId: manual.homeTeamId }
  assert.equal(planFixtures(league, teams, [reversed], options).fixtures.length, 9)
})
check('renamed clubs match existing fixtures by IDs', () => {
  const renamed = teams.map((team) => ({ ...team, name: `Renamed ${team.id}` }))
  assert.equal(planFixtures(league, renamed, first.fixtures, options).fixtures.length, 0)
})
check('groups do not play each other', () => {
  const groups: Season = { ...league, seasonType: 'group_league', groupLeague: { groupCount: 2, groups: [
    { id: 'a', name: 'Group A', slots: [{ position: 1, teamId: 1 }, { position: 2, teamId: 2 }] },
    { id: 'b', name: 'Group B', slots: [{ position: 1, teamId: 3 }, { position: 2, teamId: 4 }, { position: 3, teamId: 5 }] },
  ] } }
  const plan = planFixtures(groups, teams, [], options)
  assert.equal(plan.fixtures.length, 4)
  assert.ok(plan.fixtures.every((match) => match.stage === 'Group A' ? [1, 2].includes(match.homeTeamId!) && [1, 2].includes(match.awayTeamId!) : ![1, 2].includes(match.homeTeamId!) && ![1, 2].includes(match.awayTeamId!)))
  assert.throws(() => planFixtures({ ...groups, groupLeague: { ...groups.groupLeague!, groups: groups.groupLeague!.groups.map((g) => ({ ...g, slots: [{ position: 1, teamId: 1 }, { position: 2, teamId: 2 }] })) } }, teams, [], options), /more than one table/)
})
check('invalid dates, times, gaps and overlapping rounds cannot be saved', () => {
  for (const change of [{ startDate: '2026-02-30' }, { time: '25:30' }, { daysBetweenRounds: 0 }, { minutesBetweenMatches: 0 }, { venue: '' }]) assert.throws(() => planFixtures(league, teams, [], { ...options, ...change }))
  assert.throws(() => planFixtures(league, teams, [], { ...options, daysBetweenRounds: 1, minutesBetweenMatches: 1440 }), /overlap/)
})
const cup: Season = { ...league, seasonType: 'tournament', bracket: autoSeedBracket(generateEmptyBracket(4), teams.slice(0, 4), false) }
const knockOptions = { ...options, phase: 'knockout' as const }
const semis = planFixtures(cup, teams, [], knockOptions)
check('only seeded knockout opponents get games; the final waits', () => {
  assert.equal(semis.fixtures.length, 2)
  assert.equal(semis.waiting, 1)
  assert.equal(semis.fixtures[0].stage, 'Semi-finals')
  assert.equal(planFixtures(cup, teams, semis.fixtures, knockOptions).fixtures.length, 0)
})
check('registering a draw pairing creates only that fixture and preserves its round', () => {
  const key = semis.fixtures[0].fixtureKey!
  const selected = planFixtures(cup, teams, [], { ...knockOptions, onlyFixtureKey: key })
  assert.equal(selected.fixtures.length, 1)
  assert.equal(selected.fixtures[0].fixtureKey, key)
  assert.equal(selected.fixtures[0].stage, 'Semi-finals')
  assert.equal(planFixtures(cup, teams, selected.fixtures, { ...knockOptions, onlyFixtureKey: key }).fixtures.length, 0)
  assert.throws(() => planFixtures(cup, teams, [], { ...knockOptions, onlyFixtureKey: 'knockout:unknown:1:2' }), /pairing changed or is waiting/)
})
const results: Match[] = semis.fixtures.map((m, index) => ({ ...m, id: index + 1, status: 'Scheduled', matchStatus: 'completed', homeScore: 2, awayScore: 0 }))
const final = planFixtures(cup, teams, results, knockOptions).fixtures[0]
check('completed results create the final once', () => {
  assert.equal(final.stage, 'Final')
  assert.deepEqual([final.homeTeamId, final.awayTeamId], [1, 3])
  assert.equal(planFixtures(cup, teams, [...results, final], knockOptions).fixtures.length, 0)
})
check('correcting a semi does not silently duplicate or score a stale final', () => {
  const corrected = [{ ...results[0], homeScore: 0, awayScore: 3 }, results[1], { ...final, id: 3, status: 'Scheduled' as const, matchStatus: 'completed' as const, homeScore: 2, awayScore: 1 }]
  assert.throws(() => planFixtures(cup, teams, corrected, knockOptions), /different clubs/)
  assert.equal(bracketWithResults(cup.bracket!, corrected).championSlot?.teamId, null)
})
check('fixture identity survives club renames in bracket progression', () => {
  const changed = results.map((match) => ({ ...match, home: 'Renamed home', away: 'Renamed away' }))
  const bracket = bracketWithResults(cup.bracket!, changed)
  assert.deepEqual([bracket.rounds[1].matches[0].slot1.teamId, bracket.rounds[1].matches[0].slot2.teamId], [1, 3])
})
check('playoff phases persist as knockout database values and keep labels after reload', () => {
  const season: Season = { ...league, bracket: { ...generateEmptyBracket(32), qualification: { qualifiersPerTable: 13 } } }
  for (const [label, stored] of [['Preliminary round', 'round_of_32'], ['Playoff round', 'round_of_16'], ['Quarter-finals', 'quarter_final'], ['Semi-finals', 'semi_final'], ['Final', 'final'], ['Third-place Play-off', 'third_place'], ['Group A', 'group']] as const) assert.equal(toDbStage(label), stored)
  assert.equal(displayDbStage(toDbStage('Preliminary round'), season), 'Preliminary round')
  assert.equal(displayDbStage(toDbStage('Playoff round'), season), 'Playoff round')
  assert.equal(displayDbStage('round_of_32'), 'Round of 32')
  assert.equal(displayDbStage('round_of_16'), 'Round of 16')
})
console.log(`\n${checks} fixture checks passed`)

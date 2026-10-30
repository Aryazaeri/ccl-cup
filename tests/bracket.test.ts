import { autoSeedBracket, generateEmptyBracket, setMatchWinner } from '../src/lib/bracketUtils'
import { bracketMatchScores, bracketWithResults, qualificationOptions, qualificationPreview, seedQualifiedBracket, tableStageMatches } from '../src/lib/qualificationUtils'
import { computeGroupStandings, withDerivedTeamTotals } from '../src/lib/standingsUtils'
import type { Match, Season, Team, TournamentBracket } from '../src/types'

let passed = 0
let failed = 0

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    passed++
    console.log(`  ok   ${name}`)
  } else {
    failed++
    console.log(`  FAIL ${name}\n       expected ${e}\n       actual   ${a}`)
  }
}

function team(id: number, name: string): Team {
  return { id, name, countryCode: 'TR', color: '#000', played: 0, goalDifference: 0, points: 0 }
}

const teams = [
  team(1, 'ALPHA'),
  team(2, 'BRAVO'),
  team(3, 'CHARLIE'),
  team(4, 'DELTA'),
]

/** Seeded 4-team bracket: ALPHA v BRAVO, CHARLIE v DELTA, then a final. */
function seeded(): TournamentBracket {
  return autoSeedBracket(generateEmptyBracket(4), teams, false)
}

const nameAt = (b: TournamentBracket, r: number, m: number, slot: 1 | 2) =>
  (slot === 1 ? b.rounds[r].matches[m].slot1 : b.rounds[r].matches[m].slot2).teamName ?? null

console.log('\n1. Seeding and shape')
{
  const b = seeded()
  check('two rounds for four teams', b.rounds.length, 2)
  check('first round has two matches', b.rounds[0].matches.length, 2)
  check('final has one match', b.rounds[1].matches.length, 1)
  check('round one seeded in order', [nameAt(b, 0, 0, 1), nameAt(b, 0, 0, 2)], ['ALPHA', 'BRAVO'])
  check('final starts empty', [nameAt(b, 1, 0, 1), nameAt(b, 1, 0, 2)], [null, null])
}

console.log('\n2. A winner advances')
{
  let b = seeded()
  b = setMatchWinner(b, b.rounds[0].matches[0].matchId, b.rounds[0].matches[0].slot1.slotId)
  check('even match feeds slot 1 of the next round', nameAt(b, 1, 0, 1), 'ALPHA')
  check('the other side stays empty', nameAt(b, 1, 0, 2), null)

  b = setMatchWinner(b, b.rounds[0].matches[1].matchId, b.rounds[0].matches[1].slot2.slotId)
  check('odd match feeds slot 2', nameAt(b, 1, 0, 2), 'DELTA')
  check('champion not decided yet', b.championSlot?.teamName ?? null, null)
}

console.log('\n3. The final decides a champion')
{
  let b = seeded()
  b = setMatchWinner(b, b.rounds[0].matches[0].matchId, b.rounds[0].matches[0].slot1.slotId)
  b = setMatchWinner(b, b.rounds[0].matches[1].matchId, b.rounds[0].matches[1].slot1.slotId)
  const final = b.rounds[1].matches[0]
  b = setMatchWinner(b, final.matchId, final.slot2.slotId)
  check('final slot 2 was CHARLIE', nameAt(b, 1, 0, 2), 'CHARLIE')
  check('champion is the final winner', b.championSlot?.teamName, 'CHARLIE')
}

console.log('\n4. Revising a result clears what followed')
{
  let b = seeded()
  b = setMatchWinner(b, b.rounds[0].matches[0].matchId, b.rounds[0].matches[0].slot1.slotId)
  b = setMatchWinner(b, b.rounds[0].matches[1].matchId, b.rounds[0].matches[1].slot1.slotId)
  let final = b.rounds[1].matches[0]
  b = setMatchWinner(b, final.matchId, final.slot1.slotId)
  check('champion is ALPHA', b.championSlot?.teamName, 'ALPHA')

  // ALPHA never actually qualified — BRAVO won that semi instead.
  b = setMatchWinner(b, b.rounds[0].matches[0].matchId, b.rounds[0].matches[0].slot2.slotId)
  check('final slot 1 becomes BRAVO', nameAt(b, 1, 0, 1), 'BRAVO')
  check('the stale champion is cleared', b.championSlot?.teamName ?? null, null)
  final = b.rounds[1].matches[0]
  check('the stale final result is dropped', final.winnerSlotId ?? null, null)
}

console.log('\n5. Clearing a winner')
{
  let b = seeded()
  const m0 = b.rounds[0].matches[0]
  b = setMatchWinner(b, m0.matchId, m0.slot1.slotId)
  check('advanced', nameAt(b, 1, 0, 1), 'ALPHA')
  b = setMatchWinner(b, m0.matchId, m0.slot1.slotId)
  check('picking the same slot again clears it', nameAt(b, 1, 0, 1), null)
  check('winner is unset', b.rounds[0].matches[0].winnerSlotId ?? null, null)
}

console.log('\n6. An empty slot cannot win')
{
  const b0 = autoSeedBracket(generateEmptyBracket(4), [teams[0]], false)
  const m0 = b0.rounds[0].matches[0]
  const b = setMatchWinner(b0, m0.matchId, m0.slot2.slotId)
  check('a bye slot holds no team', b0.rounds[0].matches[0].slot2.teamId, null)
  check('winner on an empty slot is refused', b.rounds[0].matches[0].winnerSlotId ?? null, null)
  check('nothing advanced', nameAt(b, 1, 0, 1), null)
}

console.log('\n7. Eight-team bracket routes correctly')
{
  const eight = [...teams, team(5, 'ECHO'), team(6, 'FOXTROT'), team(7, 'GOLF'), team(8, 'HOTEL')]
  let b = autoSeedBracket(generateEmptyBracket(8), eight, false)
  check('three rounds', b.rounds.length, 3)
  // Match 2 (index 2) is even, so it feeds slot 1 of semi-final index 1.
  b = setMatchWinner(b, b.rounds[0].matches[2].matchId, b.rounds[0].matches[2].slot1.slotId)
  check('quarter 3 winner reaches semi 2 slot 1', nameAt(b, 1, 1, 1), 'ECHO')
  b = setMatchWinner(b, b.rounds[0].matches[3].matchId, b.rounds[0].matches[3].slot2.slotId)
  check('quarter 4 winner reaches semi 2 slot 2', nameAt(b, 1, 1, 2), 'HOTEL')
}

console.log('\n8. Table stage qualifies into a knockout draw')
const season: Season = {
  id: 10, city: 'Antalya', year: 2026, name: 'Test', fullName: 'Antalya 2026 Test', seasonType: 'group_league', groupCount: 2,
  groupLeague: { groupCount: 2, groups: [
    { id: 'a', name: 'Group A', slots: [{ position: 1, teamId: 1 }, { position: 2, teamId: 2 }] },
    { id: 'b', name: 'Group B', slots: [{ position: 1, teamId: 3 }, { position: 2, teamId: 4 }] },
  ] },
  bracket: { ...generateEmptyBracket(4), qualification: { qualifiersPerTable: 2 } },
}
function fixture(id: number, home: string, away: string, stage: string, homeScore = 1, awayScore = 0): Match {
  return { id, home, away, stage, homeScore, awayScore, seasonId: 10, date: '18 Aug', time: '20:30', venue: 'Arena', matchStatus: 'completed', status: 'Scheduled' }
}
const tableFixtures = [fixture(1, 'ALPHA', 'BRAVO', 'Group A'), fixture(2, 'CHARLIE', 'DELTA', 'Group B')]
{
  const preview = qualificationPreview(season, teams, tableFixtures)
  check('complete table stage is ready', preview.ready, true)
  check('all four table qualifiers', preview.qualifiers.map((row) => row.teamName), ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA'])
  const b = seedQualifiedBracket(season, teams, tableFixtures, 'test-date')
  check('group winner meets other group runner-up', [nameAt(b, 0, 0, 1), nameAt(b, 0, 0, 2)], ['ALPHA', 'DELTA'])
  check('opposite pairing uses the remaining qualifiers', [nameAt(b, 0, 1, 1), nameAt(b, 0, 1, 2)], ['CHARLIE', 'BRAVO'])
  check('qualification source shown in the draw', b.rounds[0].matches[0].slot1.qualificationLabel, 'Group A #1')
  check('seed time persisted', b.qualification?.seededAt, 'test-date')
  check('two qualifiers support a final-only draw', generateEmptyBracket(2).rounds.map((round) => round.matches.length), [1])
  check('single table supports top 2, 4, 8, 16', qualificationOptions(1), [2, 4, 8, 16])
  check('four groups support top 1, 2, 4', qualificationOptions(4), [1, 2, 4])
  check('three equal groups cannot form a full knockout draw', qualificationOptions(3), [])
  check('pending group match blocks qualification', qualificationPreview(season, teams, [tableFixtures[0], { ...tableFixtures[1], matchStatus: 'scheduled' }]).ready, false)
  check('child publication flag does not block parent tournament qualification', qualificationPreview(season, teams, [tableFixtures[0], { ...tableFixtures[1], status: 'Draft' }]).ready, true)
  check('empty fixture list blocks qualification', qualificationPreview(season, teams, []).ready, false)
  check('missing club results block qualification', qualificationPreview(season, teams, [tableFixtures[0]]).ready, false)
  const duplicate = { ...season, groupLeague: { groupCount: 2, groups: [season.groupLeague!.groups[0], { ...season.groupLeague!.groups[1], slots: [{ position: 1, teamId: 1 }, { position: 2, teamId: 4 }] }] } }
  check('club cannot qualify from two groups', qualificationPreview(duplicate, teams, tableFixtures).ready, false)
  check('pending fixture outside the assigned tables does not block', qualificationPreview(season, teams, [...tableFixtures, { ...fixture(8, 'OUTSIDE', 'ALPHA', 'Group Stage'), matchStatus: 'scheduled' }]).ready, true)
  check('another season does not affect qualification', qualificationPreview(season, teams, [...tableFixtures, { ...tableFixtures[0], id: 9, seasonId: 11, matchStatus: 'scheduled' }]).ready, true)
}

console.log('\n9. Single table ignores legacy group names')
{
  const league: Season = { ...season, lotsOrder: [1, 3, 2, 4], seasonType: 'league', groupLeague: undefined, league: { teamCount: 4, slots: teams.map((t, index) => ({ position: index + 1, teamId: t.id })) }, bracket: { ...generateEmptyBracket(2), qualification: { qualifiersPerTable: 2 } } }
  const tagged = teams.map((t) => ({ ...t, groupName: t.id <= 2 ? 'Old A' : 'Old B' }))
  check('league always has one table', computeGroupStandings(tagged, tableFixtures, league).length, 1)
  check('league table uses all assigned clubs', computeGroupStandings(tagged, tableFixtures, league)[0].rows.length, 4)
  check('playing one game each does not qualify an incomplete league schedule', qualificationPreview(league, tagged, tableFixtures).ready, false)
  const completeLeague = [...tableFixtures, fixture(6, 'ALPHA', 'CHARLIE', 'League', 0, 0), fixture(7, 'ALPHA', 'DELTA', 'League', 0, 0), fixture(8, 'BRAVO', 'CHARLIE', 'League', 0, 0), fixture(9, 'BRAVO', 'DELTA', 'League', 0, 0)]
  const b = seedQualifiedBracket(league, tagged, completeLeague, 'test-date')
  check('top two qualify directly into the final', [nameAt(b, 0, 0, 1), nameAt(b, 0, 0, 2)], ['ALPHA', 'CHARLIE'])
  check('empty league layout still includes all registered clubs', computeGroupStandings(teams, tableFixtures, { ...league, league: { teamCount: 0, slots: [] } })[0].rows.length, teams.length)
  const partial = { ...league, league: { teamCount: 1, slots: [{ position: 1, teamId: teams[0].id }] } }
  check('partial league layout does not hide results or opponents', computeGroupStandings(teams, tableFixtures, partial)[0].rows.map((r) => [r.teamName, r.played, r.points]), computeGroupStandings(teams, tableFixtures, league)[0].rows.map((r) => [r.teamName, r.played, r.points]))
  const scoped = teams.map((t) => ({ ...t, seasonId: league.id }))
  const mixed = [...scoped, { ...teams[0], id: 999, seasonId: league.id + 1 }]
  check('another season club stays out of the league', computeGroupStandings(mixed, [...tableFixtures, { ...tableFixtures[0], id: 999, seasonId: league.id + 1 }], partial)[0].rows.map((r) => [r.teamId, r.played, r.points]), computeGroupStandings(scoped, tableFixtures, league)[0].rows.map((r) => [r.teamId, r.played, r.points]))
}

console.log('\nEight groups feed a round of 16')
{
  const clubs = Array.from({ length: 16 }, (_, index) => team(index + 1, `CLUB ${index + 1}`))
  const groups = Array.from({ length: 8 }, (_, index) => ({ id: `g${index}`, name: `Group ${String.fromCharCode(65 + index)}`, slots: [{ position: 1, teamId: index * 2 + 1 }, { position: 2, teamId: index * 2 + 2 }] }))
  const larger: Season = { ...season, groupCount: 8, groupLeague: { groupCount: 8, groups } }
  const games = groups.map((g, index) => fixture(index + 1, clubs[index * 2].name, clubs[index * 2 + 1].name, g.name))
  const b = seedQualifiedBracket(larger, clubs, games, 'test-date')
  const slots = b.rounds[0].matches.flatMap((tie) => [tie.slot1, tie.slot2])
  check('sixteen distinct clubs are seeded', new Set(slots.map((slot) => slot.teamId)).size, 16)
  check('sixteen qualifiers produce four rounds', b.rounds.length, 4)
  check('first-round opponents always come from different groups', b.rounds[0].matches.every((tie) => tie.slot1.qualificationLabel?.split(' #')[0] !== tie.slot2.qualificationLabel?.split(' #')[0]), true)
  check('group winners meet runners-up', b.rounds[0].matches.every((tie) => [tie.slot1.qualificationLabel?.split(' #')[1], tie.slot2.qualificationLabel?.split(' #')[1]].sort().join(',') === '1,2'), true)
}

console.log('\n10. Fixture scores drive knockout progression without affecting tables')
{
  const seeded = seedQualifiedBracket(season, teams, tableFixtures, 'test-date')
  const semis = [fixture(3, 'DELTA', 'ALPHA', 'Semi-final', 1, 3), fixture(4, 'CHARLIE', 'BRAVO', 'Semi-finals', 0, 1)]
  const final = { ...fixture(5, 'ALPHA', 'BRAVO', 'Final', 2, 2), homePenalties: 3, awayPenalties: 4 }
  const all = [...tableFixtures, ...semis, final]
  const b = bracketWithResults(seeded, all)
  check('home/away reversal still advances correct club', nameAt(b, 1, 0, 1), 'ALPHA')
  check('reversed fixture displays scores beside the seeded clubs', bracketMatchScores(b.rounds[0].matches[0], semis[0]), [3, 1])
  check('score display handles normalized club names', bracketMatchScores(b.rounds[0].matches[0], fixture(7, '  alpha ', 'DELTA', 'Semi-final', 3, 1)), [3, 1])
  check('second semi advances the winner', nameAt(b, 1, 0, 2), 'BRAVO')
  check('penalty shootout decides champion', b.championSlot?.teamName, 'BRAVO')
  check('fixture id attaches to its tie', b.rounds[1].matches[0].resultMatchId, 5)
  check('knockout scores leave table matches unchanged', tableStageMatches(season, all).map((m) => m.id), [1, 2])
  check('table points exclude cup wins', computeGroupStandings(teams, tableStageMatches(season, all), season)[0].rows.map((row) => row.points), [3, 0])
  const scopedTeams = teams.map((t) => ({ ...t, seasonId: 10 }))
  check('club pool totals also exclude cup wins', withDerivedTeamTotals(scopedTeams, all, [season]).find((t) => t.id === 1)?.points, 3)
  check('club pool played count comes from its table', withDerivedTeamTotals(scopedTeams, all, [season]).find((t) => t.id === 1)?.played, 1)
  check('another season does not inflate club pool totals', withDerivedTeamTotals(scopedTeams, [...all, { ...fixture(6, 'ALPHA', 'BRAVO', 'Group Stage', 8, 0), seasonId: 11 }], [season]).find((t) => t.id === 1)?.points, 3)
  check('shootout missing leaves final unresolved', bracketWithResults(seeded, [...tableFixtures, ...semis, { ...final, homePenalties: undefined, awayPenalties: undefined }]).championSlot?.teamId, null)
  check('live scores do not advance clubs', bracketWithResults(seeded, [...tableFixtures, { ...semis[0], matchStatus: 'live' }]).rounds[1].matches[0].slot1.teamId, null)
  check('deleting a result removes stale advancement', bracketWithResults(b, tableFixtures).championSlot?.teamId, null)
  check('revised semi clears incompatible final result', bracketWithResults(b, [...tableFixtures, { ...semis[0], homeScore: 4 }, semis[1], final]).championSlot?.teamId, null)
  check('group match between finalists cannot decide final', bracketWithResults(seeded, [...tableFixtures, ...semis, { ...final, stage: 'Group Stage' }]).championSlot?.teamId, null)
  check('third place never supplies a final result', bracketWithResults(seeded, [...tableFixtures, ...semis, { ...final, stage: 'Third-place Play-off' }]).championSlot?.teamId, null)
  check('progression does not mutate saved draw', seeded.rounds[1].matches[0].slot1.teamId, null)
  const reseeded = seedQualifiedBracket({ ...season, bracket: b }, teams, tableFixtures, 'new-date')
  check('regenerating clears saved winners', reseeded.championSlot?.teamId, null)
  check('regenerating keeps qualification settings', reseeded.qualification?.qualifiersPerTable, 2)
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)

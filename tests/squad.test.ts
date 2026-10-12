import assert from 'node:assert/strict'
import { MIN_SQUAD, clubsToEnter, isInTeam, latestSquad, matchSquad, playerTeamId, shrinkError, squadOf, withSquad } from '../src/lib/squadUtils'
import { assignedGroupName } from '../src/lib/groupLeagueUtils'
import type { Player, Season, Team } from '../src/types'

const entry = (id: number, clubId: number, seasonId: number, name: string): Team =>
  ({ id, clubId, seasonId, name, countryCode: 'TR', color: '#123456', played: 0, goalDifference: 0, points: 0 })
const person = (id: number, squads: Player['squads']): Player => ({ id, squads, fullName: `Player ${id}`, position: 'forward' })

// Seasons newest first, as loaded. Club 1 played 2025 (entry 10) and 2026 (entry 20).
const seasonOrder = [2026, 2025]
const teams = [entry(10, 1, 2025, 'NOVA'), entry(20, 1, 2026, 'NOVA'), entry(11, 2, 2025, 'ATLAS')]
let checks = 0
function check(name: string, fn: () => void) { fn(); checks++; console.log(`  ok   ${name}`) }

check('one person keeps a separate squad place per season', () => {
  const p = person(1, [{ seasonId: 2025, teamId: 10 }, { seasonId: 2026, teamId: 20 }])
  assert.equal(playerTeamId(p, 2025), 10)
  assert.equal(playerTeamId(p, 2026), 20)
  assert.equal(latestSquad(p, seasonOrder)?.teamId, 20)
  assert.ok(isInTeam(p, 10) && isInTeam(p, 20))
})

check('a transfer replaces the club for that season only', () => {
  const squads = withSquad([{ seasonId: 2025, teamId: 10 }, { seasonId: 2026, teamId: 20 }], 2025, 11)
  assert.deepEqual(squads.sort((a, b) => a.seasonId - b.seasonId), [{ seasonId: 2025, teamId: 11 }, { seasonId: 2026, teamId: 20 }])
  assert.deepEqual(withSquad(squads, 2025, null), [{ seasonId: 2026, teamId: 20 }])
})

check('squads may not shrink below the minimum', () => {
  assert.equal(MIN_SQUAD, 5)
  assert.equal(shrinkError({ name: 'NOVA' }, 6), '')
  assert.match(shrinkError({ name: 'NOVA' }, 5), /NOVA needs at least 5 players.*would have 4/)
  assert.match(shrinkError({ name: 'OLD' }, 2), /would have 1/)
})

check('clubs to enter are those not in the season, as their latest entry', () => {
  assert.deepEqual(clubsToEnter(teams, 2026, seasonOrder).map((t) => t.id), [11])
  const newSeason = clubsToEnter(teams, 2027, [2027, ...seasonOrder])
  assert.deepEqual(newSeason.map((t) => t.id).sort(), [11, 20])
})

check('match squads prefer the recorded snapshot over the current squad', () => {
  const players = [person(1, [{ seasonId: 2025, teamId: 11 }]), person(2, [{ seasonId: 2025, teamId: 10 }])]
  // Player 1 has since transferred to ATLAS, but played for NOVA in this match.
  const played = { squads: [{ teamId: 10, playerId: 1, playerName: 'Player 1', shirtNumber: 9 }] }
  assert.deepEqual(matchSquad(played, 10, players).map((p) => p.playerId), [1])
  assert.deepEqual(matchSquad({}, 10, players).map((p) => p.playerId), [2])
  assert.deepEqual(squadOf(players, 10).map((p) => p.id), [2])
  assert.deepEqual(matchSquad(played, undefined, players), [])
})

check('group badges come from the saved draw, not the club field', () => {
  const season = {
    id: 2026, name: 'Cup', fullName: 'Cup', city: 'Antalya', year: 2026, seasonType: 'group_league',
    groupLeague: { groupCount: 2, groups: [
      { id: 'a', name: 'Group A', slots: [{ position: 1, teamId: 11 }] },
      { id: 'b', name: 'Group B', slots: [{ position: 1, teamId: 20 }] },
    ] },
  } as Season
  assert.equal(assignedGroupName(season, 20), 'Group B')
  assert.equal(assignedGroupName(season, 99), undefined)
  assert.equal(assignedGroupName(undefined, 20), undefined)
})

console.log(`squad: ${checks} checks passed`)

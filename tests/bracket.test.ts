import { autoSeedBracket, generateEmptyBracket, setMatchWinner } from '../src/lib/bracketUtils'
import type { Team, TournamentBracket } from '../src/types'

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

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)

import assert from 'node:assert/strict'
import { FORMATIONS, filledSlots, reseat, resolveLineup, type Lineup } from '../src/lib/formations'
import type { PlayerPosition } from '../src/types'

type P = { id: number; position: PlayerPosition }
const squad: P[] = [
  { id: 1, position: 'goalkeeper' }, { id: 2, position: 'defender' }, { id: 3, position: 'defender' },
  { id: 4, position: 'midfielder' }, { id: 5, position: 'forward' }, { id: 6, position: 'forward' },
]
const pos = (p: P) => p.position
let checks = 0
function check(name: string, fn: () => void) { fn(); checks++; console.log(`  ok   ${name}`) }

check('the counter counts only the formation\'s own slots (item 5)', () => {
  // Six starters keyed for 4-3-3; after a naive switch to 5v5 only some keys exist there.
  const stale = { gk: 1, cb1: 2, cb2: 3, cm2: 4, st: 5, rw: 6 }
  assert.ok(Object.keys(stale).length > FORMATIONS['5v5'].slots.length)
  assert.ok(filledSlots('5v5', stale) <= FORMATIONS['5v5'].slots.length)
  assert.equal(filledSlots('4-3-3', {}), 0)
})

check('switching formation re-seats starters and benches the overflow', () => {
  const starters = { gk: squad[0], lb: squad[1], cb1: squad[2], cm2: squad[3], lw: squad[4], st: squad[5] }
  const { starters: next, overflow } = reseat('5v5', starters, pos)
  const seated = Object.values(next)
  assert.equal(seated.length + overflow.length, 6)
  assert.equal(seated.length, FORMATIONS['5v5'].slots.length)
  assert.equal(filledSlots('5v5', next), seated.length)
  assert.equal(next.gk?.id, 1)
  for (const [slotId] of Object.entries(next)) assert.ok(FORMATIONS['5v5'].slots.some((s) => s.id === slotId))
})

check('re-seating prefers the same position', () => {
  const { starters: next } = reseat('4-4-2', { rw: squad[4] }, pos)
  const slot = FORMATIONS['4-4-2'].slots.find((s) => next[s.id]?.id === 5)
  assert.equal(slot?.position, 'forward')
})

check('a saved lineup drops departed players and benches unplaced squad members', () => {
  const saved: Lineup = { formation: '5v5', starters: { gk: 1, st1: 99 }, bench: [5, 77] }
  const resolved = resolveLineup(saved, squad)!
  assert.equal(resolved.formation, '5v5')
  assert.deepEqual(Object.values(resolved.starters).map((p) => p.id), [1])
  assert.deepEqual(resolved.bench.map((p) => p.id), [5, 2, 3, 4, 6])
  assert.equal(resolveLineup(undefined, squad), null)
  assert.equal(resolveLineup({ ...saved, formation: 'nope' as Lineup['formation'] }, squad), null)
})

console.log(`formations: ${checks} checks passed`)

import assert from 'node:assert/strict'
import { fixtureSchedule, kickoffCountdown } from '../src/lib/countdown'
const now = Date.parse('2026-10-29T12:00:00Z')
const match = { matchStatus: 'scheduled' as const, kickoffAt: '2026-10-31T18:04:05+03:00' }
assert.deepEqual(kickoffCountdown(match, now), { days: 2, hours: 3, minutes: 4, seconds: 5, due: false })
assert.equal(kickoffCountdown({ ...match, matchStatus: 'completed' }, now), null)
assert.equal(kickoffCountdown({ ...match, matchStatus: 'live' }, now), null)
assert.equal(kickoffCountdown({ ...match, matchStatus: 'postponed' }, now), null)
for (const kickoffAt of [undefined, 'invalid', '2026-10-31T18:04:05']) assert.equal(kickoffCountdown({ ...match, kickoffAt }, now), null)
assert.deepEqual(kickoffCountdown(match, Date.parse(match.kickoffAt)), { days: 0, hours: 0, minutes: 0, seconds: 0, due: true })
assert.equal(kickoffCountdown(match, Date.parse(match.kickoffAt) + 60000)?.due, true)
console.log('Kickoff countdown timezone, status and zero-boundary checks passed')

// The kickoff boundary uses an absolute instant, including Istanbul's offset.
const kickoff = '2026-10-30T12:00:00+03:00'
const at = Date.parse(kickoff)
const fixtures = [
  { id: 1, matchStatus: 'scheduled', kickoffAt: kickoff },
  { id: 2, matchStatus: 'scheduled', kickoffAt: '2026-10-30T13:00:00+03:00' },
  { id: 3, matchStatus: 'postponed', kickoffAt: kickoff },
  { id: 4, matchStatus: 'completed', kickoffAt: kickoff },
  { id: 5, matchStatus: 'live', kickoffAt: kickoff },
  { id: 6, matchStatus: 'scheduled', kickoffAt: undefined },
] as import('../src/types').Match[]
assert.deepEqual(fixtureSchedule(fixtures, at - 1).upcoming.map((m) => m.id), [1, 2, 6])
assert.deepEqual(fixtureSchedule(fixtures, at).upcoming.map((m) => m.id), [2, 6])
assert.deepEqual(fixtureSchedule(fixtures, at).awaitingResult.map((m) => m.id), [1])
assert.deepEqual(fixtureSchedule(fixtures, at).postponed.map((m) => m.id), [3])
assert.deepEqual(fixtureSchedule(fixtures, at + 3600000).awaitingResult.map((m) => m.id), [1, 2])
console.log('Fixture timing, timezone, status separation and unknown kickoff checks passed')

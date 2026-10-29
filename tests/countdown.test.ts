import assert from 'node:assert/strict'
import { kickoffCountdown } from '../src/lib/countdown'
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

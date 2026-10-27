import assert from 'node:assert/strict'
import { computeStandings, computeGroupStandings } from '../src/lib/standingsUtils'
import { defaultSeasonId } from '../src/lib/seasonLabels'
import { isStoryPublic, publicationInput } from '../src/lib/publication'
import { FORMATIONS } from '../src/lib/formations'
import { goalScore, defaultMatchLineups } from '../src/lib/matchRules'
import { mapAssetReferences } from '../src/lib/assetReferences'
import type { Match, Season, Story, Team } from '../src/types'

const club = (id: number, name: string): Team => ({ id, seasonId: 1, name, color: '#123456', countryCode: 'TR', played: 0, points: 0, goalDifference: 0 })
let sequence = 0
const result = (h: Team, hs: number, a: Team, as: number): Match => ({ id: ++sequence, seasonId: 1, home: h.name, homeTeamId: h.id, away: a.name, awayTeamId: a.id, homeScore: hs, awayScore: as, stage: 'Group A', date: '1 Jan', time: '18:00', venue: '', status: 'Scheduled', matchStatus: 'completed' })
const [a,b,c,d] = [club(1,'Alpha'),club(2,'Bravo'),club(3,'Charlie'),club(4,'Delta')]
const tied = [result(a,2,b,1),result(b,1,c,0),result(c,1,a,0),result(a,1,d,0),result(b,10,d,0),result(c,2,d,0)]
assert.deepEqual(computeStandings([a,b,c,d],tied).map((r) => r.teamId), [1,2,3,4], 'mini-table reapplication overrides overall GD for remaining pair')
const level = [result(a,0,b,0),result(a,0,c,3),result(b,0,c,3)]
const forfeits = level.map((m,i) => i===1 ? { ...m, resultKind: 'forfeit' as const, forfeitTeamId: a.id } : m)
assert.deepEqual(computeStandings([a,b,c],forfeits).slice(1).map((r) => r.teamId), [2,1], 'fewer forfeits wins the football fallback')
const cards = level.map((m,i) => ({ ...m, events: i===0 ? [
  { id:1,matchId:m.id,teamId:a.id,teamName:a.name,playerName:'A1',eventType:'yellow_card' as const,minute:1 },
  { id:2,matchId:m.id,teamId:a.id,teamName:a.name,playerName:'A2',eventType:'yellow_card' as const,minute:2 },
  { id:3,matchId:m.id,teamId:b.id,teamName:b.name,playerName:'B1',eventType:'red_card' as const,minute:3 },
] : [] }))
const disciplined = computeStandings([a,b,c],cards)
assert.deepEqual(disciplined.slice(1).map((r) => [r.teamId,r.disciplinaryPoints]), [[1,2],[2,3]])
assert.ok(computeStandings([a,b,c],level).slice(1).every((r) => r.lotsPending))
assert.deepEqual(computeStandings([a,b,c],level,{ lotsOrder:[2,1] }).slice(1).map((r) => r.teamId), [2,1])
assert.ok(computeStandings([a,b,c],level,{ lotsOrder:[2,1] }).every((r) => !r.lotsPending))

const season = (id: number, startDate: string, status: Season['status']='published', createdAt='2026-01-01'): Season => ({ id,city:'Antalya',name:`Cup ${id}`,fullName:`Cup ${id}`,year:2026,startDate,status,createdAt })
assert.equal(defaultSeasonId([season(1,'2026-05-01'),season(2,'2027-01-01'),season(3,'2028-01-01','draft'),season(4,'2029-01-01','archived')]), 2)
assert.equal(defaultSeasonId([season(1,'2026-01-01','published','2026-02-01'),season(2,'2026-01-01','published','2026-03-01')]), 2)
assert.deepEqual(computeGroupStandings([a,b,c],level,{ ...season(1,'2026-01-01'),lotsOrder:[2,1] })[0].rows.slice(1).map((r) => r.teamId),[2,1])
const scheduled: Story = { id:1,title:'Scheduled',status:'Scheduled',publishedAt:'2026-10-27T12:00:00Z' }
assert.equal(isStoryPublic(scheduled,Date.parse('2026-10-27T11:59:59Z')),false)
assert.equal(isStoryPublic(scheduled,Date.parse('2026-10-27T12:00:00Z')),true)
assert.equal(isStoryPublic({ ...scheduled,status:'Draft' },Date.parse('2026-10-28')),false)
assert.equal(publicationInput(scheduled.publishedAt),'2026-10-27T15:00')
assert.equal(FORMATIONS['8v8'].slots.length,8)
assert.equal(FORMATIONS['8v8'].slots.filter((s) => s.position==='goalkeeper').length,1)
const match = result(a,99,b,99)
match.events = [
  { id:1,matchId:match.id,teamId:a.id,teamName:a.name,playerName:'A',eventType:'goal',minute:1 },
  { id:2,matchId:match.id,teamId:b.id,teamName:b.name,playerName:'B',eventType:'own_goal',minute:2 },
]
assert.deepEqual(goalScore(match),[2,0], 'typed totals are not the ledger')
assert.deepEqual(defaultMatchLineups({ ...match,squads:[{teamId:1,playerId:7,playerName:'Saved',lineupRole:'starter'}] },[],[]).map((r) => r.playerId),[7])
const copied = mapAssetReferences({ seasons:[{ bracket:{ rounds:[{teamLogo:'signed-url'}] } }],teams:[{logoUrl:'signed-url'}] }, (u) => u==='signed-url' ? 'canonical-url' : u)
assert.equal(copied.seasons[0].bracket.rounds[0].teamLogo,'canonical-url')
assert.equal(copied.teams[0].logoUrl,'canonical-url')
console.log('Confirmed competition, publication, asset-reference and lineup rules passed')

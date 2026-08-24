import { initialMatches, initialPlayers, initialTeams } from '../src/data'
import {
  computeGroupStandings,
  computePlayerStats,
  computeStandings,
  computeTopScorers,
  withDerivedTeamTotals,
} from '../src/lib/standingsUtils'
import type { Match, Season, Team } from '../src/types'

let passed = 0
let failed = 0

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    passed += 1
    console.log(`  ok   ${label}`)
  } else {
    failed += 1
    console.log(`  FAIL ${label}\n         expected ${e}\n         actual   ${a}`)
  }
}

function section(title: string) {
  console.log(`\n${title}`)
}

/* ---------------- helpers ---------------- */

let teamSeq = 0
function team(name: string, extra: Partial<Team> = {}): Team {
  teamSeq += 1
  return {
    id: teamSeq,
    name,
    countryCode: 'TR',
    color: '#63e35b',
    played: 999,
    goalDifference: 999,
    points: 999,
    ...extra,
  }
}

let matchSeq = 0
function played(home: string, hs: number, away: string, as: number, stage = 'Group A'): Match {
  matchSeq += 1
  return {
    id: matchSeq,
    home,
    away,
    stage,
    date: '15 Aug',
    time: '20:00',
    venue: 'Central Arena',
    homeScore: hs,
    awayScore: as,
    matchStatus: 'completed',
    status: 'Scheduled',
    events: [],
  }
}

function scheduled(home: string, away: string, stage = 'Group A'): Match {
  matchSeq += 1
  return {
    id: matchSeq,
    home,
    away,
    stage,
    date: '20 Aug',
    time: '20:00',
    venue: 'Central Arena',
    matchStatus: 'scheduled',
    status: 'Scheduled',
    events: [],
  }
}

const order = (rows: { teamName: string }[]) => rows.map((r) => r.teamName)

/* ---------------- 1. seed data ---------------- */

section('1. Real seed data')
{
  const rows = computeStandings(initialTeams, initialMatches)
  const by = (name: string) => rows.find((r) => r.teamName === name)!

  check('MARMARA won its only match', [by('MARMARA').played, by('MARMARA').won, by('MARMARA').points], [1, 1, 3])
  check('MARMARA goals 2-1, GD +1', [by('MARMARA').goalsFor, by('MARMARA').goalsAgainst, by('MARMARA').goalDifference], [2, 1, 1])
  check('BOSPHORUS lost, 0 points', [by('BOSPHORUS').played, by('BOSPHORUS').lost, by('BOSPHORUS').points], [1, 1, 0])
  check('UNION drew 0-0, 1 point', [by('UNION').played, by('UNION').drawn, by('UNION').points], [1, 1, 1])
  check('NORTHSIDE drew 0-0, 1 point', [by('NORTHSIDE').drawn, by('NORTHSIDE').points], [1, 1])
  check('NOVA FC has played nothing (only scheduled fixtures)', [by('NOVA FC').played, by('NOVA FC').points], [0, 0])
  check('ATLAS SK has played nothing', [by('ATLAS SK').played, by('ATLAS SK').points], [0, 0])
  check('table leader is MARMARA', rows[0].teamName, 'MARMARA')
  check('positions are 1..6 with no gaps', rows.map((r) => r.position), [1, 2, 3, 4, 5, 6])
  check('stored 999-style totals are ignored entirely', by('NOVA FC').played, 0)
  check('MARMARA form guide', by('MARMARA').form, ['W'])
}

/* ---------------- 2. scheduled + incomplete matches ---------------- */

section('2. Only completed matches with a full scoreline count')
{
  teamSeq = 0; matchSeq = 0
  const teams = [team('A'), team('B')]
  const rows = computeStandings(teams, [
    scheduled('A', 'B'),
    { ...played('A', 1, 'B', 0), matchStatus: 'live' } as Match,
    { ...played('A', 1, 'B', 0), matchStatus: 'postponed' } as Match,
    { ...played('A', 1, 'B', 0), homeScore: undefined } as Match,
  ])
  check('nothing counted', rows.map((r) => r.played), [0, 0])
}

/* ---------------- 3. tie-break chain ---------------- */

section('3. Tie-breaks: Points > GD > GF > Head-to-head')
{
  // Equal points, different goal difference.
  teamSeq = 0; matchSeq = 0
  const teams = [team('LOWGD'), team('HIGHGD'), team('FILLER1'), team('FILLER2')]
  const rows = computeStandings(teams, [
    played('LOWGD', 1, 'FILLER1', 0),
    played('HIGHGD', 5, 'FILLER2', 0),
  ])
  check('higher GD ranks above lower GD on equal points', order(rows).slice(0, 2), ['HIGHGD', 'LOWGD'])
}
{
  // Equal points and GD, different goals scored.
  teamSeq = 0; matchSeq = 0
  const teams = [team('LOWGF'), team('HIGHGF'), team('F1'), team('F2')]
  const rows = computeStandings(teams, [
    played('LOWGF', 1, 'F1', 0),
    played('HIGHGF', 4, 'F2', 3),
    played('F1', 0, 'HIGHGF', 0),
    played('F2', 0, 'LOWGF', 0),
  ])
  const low = rows.find((r) => r.teamName === 'LOWGF')!
  const high = rows.find((r) => r.teamName === 'HIGHGF')!
  check('both on same points', [low.points, high.points], [4, 4])
  check('both on same GD', [low.goalDifference, high.goalDifference], [1, 1])
  check('more goals scored ranks higher', order(rows).slice(0, 2), ['HIGHGF', 'LOWGF'])
}
{
  // Identical points, GD and GF — separated only by head-to-head.
  teamSeq = 0; matchSeq = 0
  const teams = [team('ALPHA'), team('BETA'), team('X'), team('Y')]
  // Both finish on 6 points, GF 4, GA 2, GD +2 — identical in every respect
  // except that BETA won the meeting between them.
  const rows = computeStandings(teams, [
    played('ALPHA', 0, 'BETA', 1),
    played('ALPHA', 2, 'X', 0),
    played('ALPHA', 2, 'Y', 1),
    played('BETA', 3, 'X', 1),
    played('BETA', 0, 'Y', 1),
  ])
  const alpha = rows.find((r) => r.teamName === 'ALPHA')!
  const beta = rows.find((r) => r.teamName === 'BETA')!
  check('ALPHA and BETA are level on points', [alpha.points, beta.points], [6, 6])
  check('level on GD', [alpha.goalDifference, beta.goalDifference], [2, 2])
  check('level on GF', [alpha.goalsFor, beta.goalsFor], [4, 4])
  check('head-to-head winner ranks first', order(rows).indexOf('BETA') < order(rows).indexOf('ALPHA'), true)
}
{
  // Truly inseparable teams must still produce a stable, deterministic order.
  teamSeq = 0; matchSeq = 0
  const teams = [team('ZEBRA'), team('APPLE')]
  const matches = [played('ZEBRA', 1, 'APPLE', 1)]
  const first = order(computeStandings(teams, matches))
  const second = order(computeStandings([...teams].reverse(), matches))
  check('identical teams sort alphabetically', first, ['APPLE', 'ZEBRA'])
  check('order does not depend on input order', first, second)
}

/* ---------------- 4. UEFA ordering option ---------------- */

section('4. headToHeadFirst option')
{
  teamSeq = 0; matchSeq = 0
  const teams = [team('SMALLWIN'), team('BIGGD'), team('P1'), team('P2')]
  const matches = [
    played('SMALLWIN', 1, 'BIGGD', 0), // head-to-head favours SMALLWIN
    played('BIGGD', 6, 'P1', 0), // but BIGGD has a far better GD overall
    played('SMALLWIN', 0, 'P2', 0),
    played('BIGGD', 0, 'P2', 0),
    played('SMALLWIN', 0, 'P1', 5),
  ]
  const standard = computeStandings(teams, matches)
  const uefa = computeStandings(teams, matches, { headToHeadFirst: true })
  check('default order puts better GD first', order(standard).indexOf('BIGGD') < order(standard).indexOf('SMALLWIN'), true)
  check('UEFA order puts head-to-head winner first', order(uefa).indexOf('SMALLWIN') < order(uefa).indexOf('BIGGD'), true)
}

/* ---------------- 5. adjustments ---------------- */

section('5. Points adjustments (deductions / bonuses)')
{
  teamSeq = 0; matchSeq = 0
  const teams = [team('CLEAN'), team('DOCKED')]
  const docked = teams[1]
  const rows = computeStandings(teams, [played('DOCKED', 3, 'CLEAN', 0)], {
    adjustments: [{ teamId: docked.id, points: -6, note: 'Ineligible player' }],
  })
  const row = rows.find((r) => r.teamName === 'DOCKED')!
  check('deduction applied', row.points, -3)
  check('deduction recorded', [row.adjustment, row.adjustmentNote], [-6, 'Ineligible player'])
  check('deducted team drops below the clean team', rows[0].teamName, 'CLEAN')
}

/* ---------------- 6. custom points system ---------------- */

section('6. Configurable points')
{
  teamSeq = 0; matchSeq = 0
  const teams = [team('W'), team('L')]
  const rows = computeStandings(teams, [played('W', 2, 'L', 0)], { pointsForWin: 2, pointsForLoss: -1 })
  check('2 points for a win', rows.find((r) => r.teamName === 'W')!.points, 2)
  check('-1 for a loss', rows.find((r) => r.teamName === 'L')!.points, -1)
}

/* ---------------- 7. robustness ---------------- */

section('7. Bad data does not corrupt the table')
{
  teamSeq = 0; matchSeq = 0
  const teams = [team('REAL')]
  const rows = computeStandings(teams, [
    played('REAL', 2, 'GHOST TEAM', 1), // opponent not in the table
    played('REAL', 1, 'REAL', 1), // self-match
    played('  real  ', 3, 'GHOST TEAM', 0), // whitespace variant, still unknown opponent
  ])
  check('matches against unknown teams are skipped', rows[0].played, 0)
}
{
  teamSeq = 0; matchSeq = 0
  // Turkish dotted I: the club is stored uppercase, the fixture was typed
  // lowercase by hand. These must still resolve to the same team.
  const teams = [team('KAYSERİ'), team('OTHER')]
  const rows = computeStandings(teams, [played('kayseri', 2, 'other', 0)])
  check('team names match case-insensitively', rows[0].teamName, 'KAYSERİ')
  check('and the result counts', rows[0].points, 3)
}
{
  teamSeq = 0; matchSeq = 0
  const teams = [team('BEŞİKTAŞ'), team('GALATASARAY')]
  const rows = computeStandings(teams, [played('  besiktas ', 3, 'GALATASARAY', 1)])
  check('diacritics and stray whitespace still match', rows[0].teamName, 'BEŞİKTAŞ')
  check('and that result counts too', rows[0].points, 3)
}
{
  const rows = computeStandings([], [])
  check('empty input yields empty table', rows, [])
}
{
  teamSeq = 0; matchSeq = 0
  const teams = [team('SOLO')]
  const before = JSON.stringify(teams)
  const matches = [played('SOLO', 1, 'SOLO', 0)]
  const matchesBefore = JSON.stringify(matches)
  computeStandings(teams, matches)
  check('inputs are not mutated (teams)', JSON.stringify(teams), before)
  check('inputs are not mutated (matches)', JSON.stringify(matches), matchesBefore)
}

/* ---------------- 8. stage filter ---------------- */

section('8. Stage filtering')
{
  teamSeq = 0; matchSeq = 0
  const teams = [team('A'), team('B')]
  const rows = computeStandings(teams, [
    played('A', 3, 'B', 0, 'Group A'),
    played('B', 3, 'A', 0, 'Knockout Stage'),
  ], { stages: ['Group A'] })
  check('only group-stage results counted', rows.find((r) => r.teamName === 'A')!.points, 3)
  check('knockout result excluded', rows.find((r) => r.teamName === 'B')!.points, 0)
}

/* ---------------- 9. group tables ---------------- */

section('9. Group standings')
{
  teamSeq = 0; matchSeq = 0
  const teams = [
    team('A1', { groupName: 'Group A' }),
    team('A2', { groupName: 'Group A' }),
    team('B1', { groupName: 'Group B' }),
    team('B2', { groupName: 'Group B' }),
  ]
  const groups = computeGroupStandings(teams, [played('A1', 2, 'A2', 0), played('B1', 0, 'B2', 1)])
  check('two groups produced', groups.map((g) => g.groupName), ['Group A', 'Group B'])
  check('Group A has 2 rows', groups[0].rows.length, 2)
  check('Group A leader', groups[0].rows[0].teamName, 'A1')
  check('Group B leader', groups[1].rows[0].teamName, 'B2')
}
{
  teamSeq = 0; matchSeq = 0
  const teams = [team('ONE', { groupName: 'Group A' }), team('TWO', { groupName: 'Group A' })]
  const groups = computeGroupStandings(teams, [played('ONE', 1, 'TWO', 0)])
  check('a single group renders as one league table', groups.length, 1)
}
{
  teamSeq = 0; matchSeq = 0
  const a = team('SA')
  const b = team('SB')
  const c = team('SC')
  const season: Season = {
    id: 1,
    city: 'Antalya',
    year: 2026,
    name: 'S',
    fullName: 'S',
    seasonType: 'group_league',
    groupCount: 2,
    groupLeague: {
      groupCount: 2,
      groups: [
        { id: 'group_a', name: 'Grup A', slots: [{ position: 1, teamId: a.id }, { position: 2, teamId: b.id }] },
        { id: 'group_b', name: 'Grup B', slots: [{ position: 1, teamId: c.id }] },
      ],
    },
  }
  const groups = computeGroupStandings([a, b, c], [played('SA', 0, 'SB', 2)], season)
  check('canvas layout drives group membership', groups.map((g) => g.groupName), ['Grup A', 'Grup B'])
  check('Grup A leader is the winner', groups[0].rows[0].teamName, 'SB')
  check('Grup B holds only its own team', groups[1].rows.map((r) => r.teamName), ['SC'])
}

/* ---------------- 10. player stats ---------------- */

section('10. Player statistics from the event log')
{
  const scorers = computeTopScorers(initialPlayers, initialMatches)
  check('top scorer is Tolga Çelik with 2', [scorers[0].playerName, scorers[0].goals], ['Tolga Çelik', 2])
  check('second is Kaan Tekin with 1', [scorers[1].playerName, scorers[1].goals], ['Kaan Tekin', 1])
  check('only players who actually scored appear', scorers.length, 2)

  const stats = computePlayerStats(initialPlayers, initialMatches)
  const oguzhan = stats.find((s) => s.playerName === 'Oğuzhan Kurt')!
  check('yellow card counted', oguzhan.yellowCards, 1)
  check('Oğuzhan scored nothing in completed matches', oguzhan.goals, 0)

  const emre = stats.find((s) => s.playerName === 'Emre Yılmaz')!
  check('stored goals are NOT trusted — derived value is 0', emre.goals, 0)
}
{
  teamSeq = 0; matchSeq = 0
  const match = played('A', 2, 'B', 0)
  match.events = [
    { id: 1, matchId: match.id, teamName: 'A', playerName: 'Striker', eventType: 'goal', minute: 10 },
    { id: 2, matchId: match.id, teamName: 'A', playerName: 'Striker', eventType: 'penalty_scored', minute: 70 },
    { id: 3, matchId: match.id, teamName: 'B', playerName: 'Rough', eventType: 'red_card', minute: 80 },
  ]
  const stats = computePlayerStats([], [match])
  const striker = stats.find((s) => s.playerName === 'Striker')!
  check('penalties count towards goals', striker.goals, 2)
  check('scorer with no roster record still appears', striker.playerId, undefined)
  check('red card counted', stats.find((s) => s.playerName === 'Rough')!.redCards, 1)
}
{
  teamSeq = 0; matchSeq = 0
  const match = scheduled('A', 'B')
  match.events = [{ id: 9, matchId: match.id, teamName: 'A', playerName: 'Ghost', eventType: 'goal', minute: 5 }]
  check('events on non-completed matches are ignored', computeTopScorers([], [match]).length, 0)
}

/* ---------------- 11. bridge helper ---------------- */

section('11. withDerivedTeamTotals')
{
  const derived = withDerivedTeamTotals(initialTeams, initialMatches)
  const nova = derived.find((t) => t.name === 'NOVA FC')!
  const marmara = derived.find((t) => t.name === 'MARMARA')!
  check('NOVA FC stored 3/6/9 is replaced by real 0/0/0', [nova.played, nova.goalDifference, nova.points], [0, 0, 0])
  check('MARMARA stored 3/2/6 is replaced by real 1/1/3', [marmara.played, marmara.goalDifference, marmara.points], [1, 1, 3])
  check('team identity preserved', nova.id, initialTeams.find((t) => t.name === 'NOVA FC')!.id)
}

/* ---------------- summary ---------------- */

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)

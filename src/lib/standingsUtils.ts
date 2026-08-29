import type { Match, MatchEvent, Player, Season, Team } from '../types'

/**
 * Standings engine.
 *
 * Derives league tables and player statistics from completed match results.
 * Nothing in here mutates its inputs — every function is pure, so results can be
 * recomputed on every render without side effects.
 *
 * Tie-break order follows the tournament specification:
 *   Points > Goal Difference > Goals Scored > Head-to-Head
 * (set `headToHeadFirst: true` to use the UEFA-style order instead, where
 * head-to-head is applied before goal difference.)
 */

export type FormResult = 'W' | 'D' | 'L'

export type StandingsRow = {
  position: number
  teamId: number
  teamName: string
  shortName?: string
  logoUrl?: string
  color?: string
  countryCode?: string
  groupName?: string
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  points: number
  /** Most recent first, capped at 5. */
  form: FormResult[]
  /** Manual adjustment applied to this row's points, if any. */
  adjustment: number
  adjustmentNote?: string
}

export type PointsAdjustment = {
  teamId: number
  points: number
  note?: string
}

export type StandingsOptions = {
  pointsForWin?: number
  pointsForDraw?: number
  pointsForLoss?: number
  /** Only count matches whose `stage` is in this list. */
  stages?: string[]
  /** Restrict the table to these team ids. */
  teamIds?: number[]
  /** Disciplinary deductions or bonuses, applied after aggregation. */
  adjustments?: PointsAdjustment[]
  /** Apply head-to-head before goal difference (UEFA order). Default false. */
  headToHeadFirst?: boolean
}

const DEFAULTS = {
  pointsForWin: 3,
  pointsForDraw: 1,
  pointsForLoss: 0,
}

/**
 * Matches reference teams by display name rather than id, so comparison has to
 * be forgiving or results silently vanish from the table.
 *
 * Turkish dotted/dotless I is the specific hazard: `'İSTANBUL'.toLowerCase()`
 * yields `i` followed by a combining dot (U+0307), which does not equal the
 * `istanbul` an admin types by hand. Decomposing and stripping combining marks
 * makes both sides agree.
 *
 * Side effect: this also folds ö→o, ş→s and similar, so two clubs whose names
 * differ only by diacritics would collide. That is the better trade — a
 * duplicate-name collision is visible in the UI, whereas an unmatched name
 * quietly drops a played match out of the standings.
 */
function normalizeName(value: string | undefined | null): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
}

/** A match only counts once it is completed and carries a full scoreline. */
export function isCountableMatch(match: Match): boolean {
  return (
    match.matchStatus === 'completed' &&
    typeof match.homeScore === 'number' &&
    typeof match.awayScore === 'number' &&
    Number.isFinite(match.homeScore) &&
    Number.isFinite(match.awayScore)
  )
}

type Accumulator = {
  team: Team
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  /** Chronological; reversed to "most recent first" at the end. */
  form: FormResult[]
}

function emptyAccumulator(team: Team): Accumulator {
  return { team, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, form: [] }
}

/**
 * Matches carry only free-text dates ("18 Aug"), so true chronological ordering
 * is not reliable. Match id ascending is used as a stable proxy for "played in
 * the order they were entered", which is good enough for a form guide.
 */
function orderMatches(matches: Match[]): Match[] {
  return [...matches].sort((a, b) => a.id - b.id)
}

export function computeStandings(
  teams: Team[],
  matches: Match[],
  options: StandingsOptions = {},
): StandingsRow[] {
  const pointsForWin = options.pointsForWin ?? DEFAULTS.pointsForWin
  const pointsForDraw = options.pointsForDraw ?? DEFAULTS.pointsForDraw
  const pointsForLoss = options.pointsForLoss ?? DEFAULTS.pointsForLoss

  const included = options.teamIds
    ? teams.filter((team) => options.teamIds!.includes(team.id))
    : teams

  const byName = new Map<string, Accumulator>()
  const byId = new Map<number, Accumulator>()
  for (const team of included) {
    const accumulator = emptyAccumulator(team)
    byId.set(team.id, accumulator)
    // Last writer wins on duplicate names; duplicates are a data problem, not
    // something this function should silently paper over with a merge.
    byName.set(normalizeName(team.name), accumulator)
  }

  const stageFilter = options.stages?.map(normalizeName)

  for (const match of orderMatches(matches)) {
    if (!isCountableMatch(match)) continue
    if (stageFilter && stageFilter.length > 0 && !stageFilter.includes(normalizeName(match.stage))) continue

    const home = byName.get(normalizeName(match.home))
    const away = byName.get(normalizeName(match.away))
    // A match against a team outside this table (or a renamed/deleted club) is
    // skipped rather than half-counted.
    if (!home || !away) continue
    if (home === away) continue

    const homeScore = match.homeScore as number
    const awayScore = match.awayScore as number

    home.played += 1
    away.played += 1
    home.goalsFor += homeScore
    home.goalsAgainst += awayScore
    away.goalsFor += awayScore
    away.goalsAgainst += homeScore

    if (homeScore > awayScore) {
      home.won += 1
      away.lost += 1
      home.form.push('W')
      away.form.push('L')
    } else if (homeScore < awayScore) {
      away.won += 1
      home.lost += 1
      away.form.push('W')
      home.form.push('L')
    } else {
      home.drawn += 1
      away.drawn += 1
      home.form.push('D')
      away.form.push('D')
    }
  }

  const adjustmentMap = new Map<number, PointsAdjustment>()
  for (const adjustment of options.adjustments ?? []) {
    adjustmentMap.set(adjustment.teamId, adjustment)
  }

  const rows: StandingsRow[] = included.map((team) => {
    const accumulator = byId.get(team.id)!
    const adjustment = adjustmentMap.get(team.id)
    const basePoints =
      accumulator.won * pointsForWin +
      accumulator.drawn * pointsForDraw +
      accumulator.lost * pointsForLoss

    return {
      position: 0,
      teamId: team.id,
      teamName: team.name,
      shortName: team.shortName,
      logoUrl: team.logoUrl,
      color: team.color,
      countryCode: team.countryCode,
      groupName: team.groupName,
      played: accumulator.played,
      won: accumulator.won,
      drawn: accumulator.drawn,
      lost: accumulator.lost,
      goalsFor: accumulator.goalsFor,
      goalsAgainst: accumulator.goalsAgainst,
      goalDifference: accumulator.goalsFor - accumulator.goalsAgainst,
      points: basePoints + (adjustment?.points ?? 0),
      form: [...accumulator.form].reverse().slice(0, 5),
      adjustment: adjustment?.points ?? 0,
      adjustmentNote: adjustment?.note,
    }
  })

  return sortStandings(rows, matches, {
    pointsForWin,
    pointsForDraw,
    pointsForLoss,
    headToHeadFirst: options.headToHeadFirst ?? false,
    stages: options.stages,
  })
}

type HeadToHeadRecord = { points: number; goalDifference: number; goalsFor: number }

/**
 * Mini-table across only the matches played between the given teams.
 * Used to separate teams that are otherwise inseparable.
 */
export function headToHead(
  teamRows: StandingsRow[],
  matches: Match[],
  config: { pointsForWin: number; pointsForDraw: number; pointsForLoss: number; stages?: string[] },
): Map<number, HeadToHeadRecord> {
  const nameToId = new Map<number | string, number>()
  for (const row of teamRows) nameToId.set(normalizeName(row.teamName), row.teamId)

  const records = new Map<number, HeadToHeadRecord>()
  for (const row of teamRows) records.set(row.teamId, { points: 0, goalDifference: 0, goalsFor: 0 })

  const stageFilter = config.stages?.map(normalizeName)

  for (const match of matches) {
    if (!isCountableMatch(match)) continue
    if (stageFilter && stageFilter.length > 0 && !stageFilter.includes(normalizeName(match.stage))) continue

    const homeId = nameToId.get(normalizeName(match.home))
    const awayId = nameToId.get(normalizeName(match.away))
    // Both teams must be inside the tied group for the match to be relevant.
    if (homeId === undefined || awayId === undefined || homeId === awayId) continue

    const homeScore = match.homeScore as number
    const awayScore = match.awayScore as number
    const home = records.get(homeId)!
    const away = records.get(awayId)!

    home.goalsFor += homeScore
    away.goalsFor += awayScore
    home.goalDifference += homeScore - awayScore
    away.goalDifference += awayScore - homeScore

    if (homeScore > awayScore) {
      home.points += config.pointsForWin
      away.points += config.pointsForLoss
    } else if (homeScore < awayScore) {
      away.points += config.pointsForWin
      home.points += config.pointsForLoss
    } else {
      home.points += config.pointsForDraw
      away.points += config.pointsForDraw
    }
  }

  return records
}

function sortStandings(
  rows: StandingsRow[],
  matches: Match[],
  config: {
    pointsForWin: number
    pointsForDraw: number
    pointsForLoss: number
    headToHeadFirst: boolean
    stages?: string[]
  },
): StandingsRow[] {
  // Primary pass. Head-to-head is deliberately excluded here: it is only
  // meaningful within a set of already-tied teams, so it is resolved below.
  const primary = (a: StandingsRow, b: StandingsRow): number => {
    if (b.points !== a.points) return b.points - a.points
    if (config.headToHeadFirst) return 0
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor
    return 0
  }

  const sorted = [...rows].sort((a, b) => primary(a, b) || a.teamName.localeCompare(b.teamName, 'tr'))

  // Second pass: walk runs of teams the primary pass could not separate and
  // re-order each run by its internal head-to-head record.
  const result: StandingsRow[] = []
  let index = 0
  while (index < sorted.length) {
    let end = index + 1
    while (end < sorted.length && primary(sorted[index], sorted[end]) === 0) end += 1

    const run = sorted.slice(index, end)
    if (run.length > 1) {
      const records = headToHead(run, matches, config)
      run.sort((a, b) => {
        const recordA = records.get(a.teamId)!
        const recordB = records.get(b.teamId)!
        if (recordB.points !== recordA.points) return recordB.points - recordA.points
        if (recordB.goalDifference !== recordA.goalDifference) {
          return recordB.goalDifference - recordA.goalDifference
        }
        if (recordB.goalsFor !== recordA.goalsFor) return recordB.goalsFor - recordA.goalsFor
        // UEFA order: fall back to overall GD/GF only after head-to-head.
        if (config.headToHeadFirst) {
          if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference
          if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor
        }
        // Genuinely inseparable — order alphabetically so the table is at least
        // deterministic across reloads rather than dependent on input order.
        return a.teamName.localeCompare(b.teamName, 'tr')
      })
    }

    result.push(...run)
    index = end
  }

  return result.map((row, position) => ({ ...row, position: position + 1 }))
}

/* ------------------------------------------------------------------ *
 * Group tables
 * ------------------------------------------------------------------ */

export type GroupStandings = {
  groupId: string
  groupName: string
  rows: StandingsRow[]
}

/**
 * Builds one table per group.
 *
 * Group membership is taken from the season's group-league layout when one has
 * been built in the canvas; otherwise it falls back to each team's `groupName`.
 * A season with a single group (or none) yields one combined league table.
 */
export function computeGroupStandings(
  teams: Team[],
  matches: Match[],
  season?: Season | null,
  options: StandingsOptions = {},
): GroupStandings[] {
  const layout = season?.groupLeague

  if (layout && Array.isArray(layout.groups) && layout.groups.length > 0) {
    return layout.groups.map((group) => {
      const teamIds = group.slots
        .map((slot) => slot.teamId)
        .filter((id): id is number => typeof id === 'number' && id > 0)

      return {
        groupId: group.id,
        groupName: group.name,
        rows: computeStandings(teams, matches, { ...options, teamIds }),
      }
    })
  }

  const grouped = new Map<string, Team[]>()
  for (const team of teams) {
    const key = team.groupName?.trim() || 'League Table'
    const bucket = grouped.get(key)
    if (bucket) bucket.push(team)
    else grouped.set(key, [team])
  }

  if (grouped.size <= 1) {
    return [
      {
        groupId: 'league',
        groupName: [...grouped.keys()][0] ?? 'League Table',
        rows: computeStandings(teams, matches, options),
      },
    ]
  }

  return [...grouped.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'tr'))
    .map(([groupName, groupTeams]) => ({
      groupId: groupName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      groupName,
      rows: computeStandings(teams, matches, {
        ...options,
        teamIds: groupTeams.map((team) => team.id),
      }),
    }))
}

/* ------------------------------------------------------------------ *
 * Player statistics
 * ------------------------------------------------------------------ */

export type PlayerStatLine = {
  playerId?: number
  playerName: string
  teamName: string
  teamId?: number
  goals: number
  assists: number
  yellowCards: number
  redCards: number
  appearances: number
}

const GOAL_EVENTS: MatchEvent['eventType'][] = ['goal', 'penalty_scored']

/** Every event across the countable matches, flattened. */
function countableEvents(matches: Match[]): MatchEvent[] {
  const events: MatchEvent[] = []
  for (const match of matches) {
    if (!isCountableMatch(match)) continue
    for (const event of match.events ?? []) events.push(event)
  }
  return events
}

/**
 * Derives per-player statistics from the match event log.
 *
 * Events identify players by name, not id, so names are matched against the
 * roster. A scorer who has no matching player record still appears in the
 * table (as an unlinked row) rather than being dropped — otherwise a typo in
 * the event log silently loses goals.
 *
 * Assists are derived from 'assist' events, added in migration 202608290002.
 * The stored `player.assists` column is no longer read: like goals, it was a
 * number nobody could check against what happened in a match.
 */
export function computePlayerStats(players: Player[], matches: Match[]): PlayerStatLine[] {
  const lines = new Map<string, PlayerStatLine>()

  const keyFor = (playerName: string, teamName: string) =>
    `${normalizeName(playerName)}::${normalizeName(teamName)}`

  for (const player of players) {
    lines.set(keyFor(player.fullName, player.teamName), {
      playerId: player.id,
      playerName: player.fullName,
      teamName: player.teamName,
      teamId: player.teamId,
      goals: 0,
      assists: 0,
      yellowCards: 0,
      redCards: 0,
      appearances: 0,
    })
  }

  for (const event of countableEvents(matches)) {
    if (!event.playerName?.trim()) continue
    const key = keyFor(event.playerName, event.teamName)
    let line = lines.get(key)
    if (!line) {
      line = {
        playerName: event.playerName.trim(),
        teamName: event.teamName,
        goals: 0,
        assists: 0,
        yellowCards: 0,
        redCards: 0,
        appearances: 0,
      }
      lines.set(key, line)
    }

    if (GOAL_EVENTS.includes(event.eventType)) line.goals += 1
    else if (event.eventType === 'assist') line.assists += 1
    else if (event.eventType === 'yellow_card') line.yellowCards += 1
    else if (event.eventType === 'red_card') line.redCards += 1
  }

  return [...lines.values()]
}

/** Top scorers, highest first. Ties broken by fewer cards, then by name. */
export function computeTopScorers(
  players: Player[],
  matches: Match[],
  limit = 10,
): PlayerStatLine[] {
  return computePlayerStats(players, matches)
    .filter((line) => line.goals > 0)
    .sort(
      (a, b) =>
        b.goals - a.goals ||
        a.redCards - b.redCards ||
        a.yellowCards - b.yellowCards ||
        a.playerName.localeCompare(b.playerName, 'tr'),
    )
    .slice(0, limit)
}

/** Top assist providers, highest first. Ties broken by name. */
export function computeTopAssists(
  players: Player[],
  matches: Match[],
  limit = 10,
): PlayerStatLine[] {
  return computePlayerStats(players, matches)
    .filter((line) => line.assists > 0)
    .sort((a, b) => b.assists - a.assists || a.playerName.localeCompare(b.playerName, 'tr'))
    .slice(0, limit)
}

/* ------------------------------------------------------------------ *
 * Convenience
 * ------------------------------------------------------------------ */

/**
 * Returns the team list with `played` / `goalDifference` / `points` replaced by
 * their derived values.
 *
 * This is the bridge for code that still reads those fields off `Team`. New
 * code should consume `computeStandings` directly — the stored columns are no
 * longer the source of truth.
 */
export function withDerivedTeamTotals(teams: Team[], matches: Match[]): Team[] {
  const rows = new Map(computeStandings(teams, matches).map((row) => [row.teamId, row]))
  return teams.map((team) => {
    const row = rows.get(team.id)
    if (!row) return team
    return { ...team, played: row.played, goalDifference: row.goalDifference, points: row.points }
  })
}

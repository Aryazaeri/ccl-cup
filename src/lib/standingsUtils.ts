import type { Match, MatchEvent, Player, Season, Team } from '../types'
import { tableStageMatches } from './matchStages'
import { goalScore } from './matchRules'

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
  forfeits: number
  disciplinaryPoints: number
  lotsRank?: number
  lotsPending?: boolean
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
  lotsOrder?: number[]
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

    const home = match.homeTeamId != null ? byId.get(match.homeTeamId) : byName.get(normalizeName(match.home))
    const away = match.awayTeamId != null ? byId.get(match.awayTeamId) : byName.get(normalizeName(match.away))
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
      forfeits: matches.filter((m) => isCountableMatch(m) && (!stageFilter || stageFilter.includes(normalizeName(m.stage))) && m.forfeitTeamId === team.id).length,
      disciplinaryPoints: matches.filter((m) => isCountableMatch(m) && (!stageFilter || stageFilter.includes(normalizeName(m.stage)))).flatMap((m) => m.events ?? [])
        .filter((e) => e.teamId === team.id || (e.teamId == null && normalizeName(e.teamName) === normalizeName(team.name)))
        .reduce((sum, e) => sum + (e.eventType === 'yellow_card' ? 1 : e.eventType === 'red_card' ? 3 : 0), 0),
      lotsRank: options.lotsOrder?.includes(team.id) ? options.lotsOrder.indexOf(team.id) : undefined,
    }
  })

  return sortStandings(rows, matches, {
    pointsForWin,
    pointsForDraw,
    pointsForLoss,
    headToHeadFirst: options.headToHeadFirst ?? true,
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

    const homeId = match.homeTeamId ?? nameToId.get(normalizeName(match.home))
    const awayId = match.awayTeamId ?? nameToId.get(normalizeName(match.away))
    // Both teams must be inside the tied group for the match to be relevant.
    if (homeId === undefined || awayId === undefined || homeId === awayId || !records.has(homeId) || !records.has(awayId)) continue

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
  const partition = (input: StandingsRow[], compare: (a: StandingsRow, b: StandingsRow) => number) => {
    const sorted = [...input].sort(compare)
    const groups: StandingsRow[][] = []
    for (const row of sorted) {
      const last = groups.at(-1)
      if (last && compare(last[0], row) === 0) last.push(row)
      else groups.push([row])
    }
    return groups
  }
  const fallback = (run: StandingsRow[]) => partition(run, (a, b) =>
    b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor ||
    a.forfeits - b.forfeits || a.disciplinaryPoints - b.disciplinaryPoints
  ).flatMap((tied) => {
    if (tied.length < 2) return tied
    const recorded = tied.every((r) => r.lotsRank != null) && new Set(tied.map((r) => r.lotsRank)).size === tied.length
    return recorded ? tied.sort((a, b) => a.lotsRank! - b.lotsRank!)
      : tied.sort((a, b) => a.teamId - b.teamId).map((r) => ({ ...r, lotsPending: true }))
  })
  const resolve = (run: StandingsRow[]): StandingsRow[] => {
    if (run.length < 2) return run
    const records = headToHead(run, matches, config)
    const groups = partition(run, (a, b) => {
      const x = records.get(a.teamId)!, y = records.get(b.teamId)!
      return y.points - x.points || y.goalDifference - x.goalDifference || y.goalsFor - x.goalsFor
    })
    // Reapply the mini-table only when it separated some of this tied group.
    // An unchanged group falls through, preventing infinite recursion.
    return groups.length === 1 ? fallback(run) : groups.flatMap(resolve)
  }
  const primary = partition(rows, (a, b) => b.points - a.points ||
    (config.headToHeadFirst ? 0 : b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor))
  return primary.flatMap(resolve).map((row, position) => ({ ...row, position: position + 1 }))
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
  // A saved draw can still name clubs that are not entered in this season
  // (copied layouts, moved or deleted entries). Only this season's clubs count.
  const entered = new Set(teams.map((team) => team.id))
  const placed = (slots: { teamId?: number | null }[]) =>
    slots.map((slot) => slot.teamId).filter((id): id is number => typeof id === 'number' && id > 0)
  const seasonIds = (slots: { teamId?: number | null }[]) => placed(slots).filter((id) => entered.has(id))

  // A saved single table takes precedence over legacy team.groupName values.
  if (season?.seasonType === 'league') {
    const teamIds = season.league ? seasonIds(season.league.slots) : undefined
    return [{
      groupId: 'league',
      groupName: 'League Table',
      rows: computeStandings(teams, matches, { lotsOrder: season?.lotsOrder, ...options, ...(teamIds ? { teamIds } : {}) }),
    }]
  }
  const groups = season?.groupLeague?.groups ?? []
  const drawn = groups.map((group) => ({ group, teamIds: seasonIds(group.slots) }))
  // An empty draw is shown as drawn (nobody placed yet). A draw that places only
  // other seasons' clubs is stale (2022 deneme): fall back to the clubs' own groups.
  const stale = drawn.every(({ teamIds }) => teamIds.length === 0) && groups.some((group) => placed(group.slots).length > 0)

  if (groups.length > 0 && !stale) {
    return drawn.map(({ group, teamIds }) => ({
      groupId: group.id,
      groupName: group.name,
      rows: computeStandings(teams, matches, { lotsOrder: season?.lotsOrder, ...options, teamIds }),
    }))
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
        rows: computeStandings(teams, matches, { lotsOrder: season?.lotsOrder, ...options }),
      },
    ]
  }

  return [...grouped.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'tr'))
    .map(([groupName, groupTeams]) => ({
      groupId: groupName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      groupName,
      rows: computeStandings(teams, matches, {
        lotsOrder: season?.lotsOrder,
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

/**
 * The score after adding (step 1) or removing (step -1) one event. Mirrors
 * public.apply_goal_event: goals and scored penalties move their club's score
 * by one, an own goal counts for the other club, and other events change
 * nothing. Adjusting rather than recounting keeps results entered without a
 * full event log.
 */
export function scoreAfterEvent(match: Match, event: MatchEvent, step: 1 | -1): Pick<Match, 'homeScore' | 'awayScore'> {
  if (match.resultKind === 'forfeit' || match.scoreSource === 'legacy') return { homeScore: match.homeScore, awayScore: match.awayScore }
  const events = step === 1 ? [...(match.events ?? []), event] : (match.events ?? []).filter((e) => e.id !== event.id)
  const [homeScore, awayScore] = goalScore({ ...match, events })
  return { homeScore, awayScore }
}

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

  const legacyKey = (playerName: string, teamName: string) =>
    `${normalizeName(playerName)}::${normalizeName(teamName)}`
  const legacyPlayers = new Map<string, Player[]>()
  // A player's club here is their squad entry among the clubs in these matches.
  const clubNames = new Map<number, string>()
  for (const match of matches) {
    if (match.homeTeamId != null) clubNames.set(match.homeTeamId, match.home)
    if (match.awayTeamId != null) clubNames.set(match.awayTeamId, match.away)
  }

  for (const player of players) {
    const teamId = player.squads.find((entry) => clubNames.has(entry.teamId))?.teamId
    const teamName = teamId != null ? clubNames.get(teamId)! : ''
    const key = legacyKey(player.fullName, teamName)
    legacyPlayers.set(key, [...(legacyPlayers.get(key) ?? []), player])
    lines.set(`player:${player.id}`, {
      playerId: player.id,
      playerName: player.fullName,
      teamName,
      teamId,
      goals: 0,
      assists: 0,
      yellowCards: 0,
      redCards: 0,
      appearances: 0,
    })
  }

  for (const event of countableEvents(matches)) {
    if (!event.playerName?.trim()) continue
    // Old unlinked events can resolve only when the roster match is unique.
    // Once recorded, a database ID survives both transfers and name changes.
    const candidates = legacyPlayers.get(legacyKey(event.playerName, event.teamName)) ?? []
    const playerId = event.playerId ?? (candidates.length === 1 ? candidates[0].id : undefined)
    const key = playerId != null ? `player:${playerId}` : `unlinked:${legacyKey(event.playerName, event.teamName)}`
    let line = lines.get(key)
    if (!line) {
      line = {
        playerId,
        playerName: event.playerName.trim(),
        teamName: event.teamName,
        teamId: event.teamId,
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
export function withDerivedTeamTotals(teams: Team[], matches: Match[], seasons: Season[] = []): Team[] {
  const rows = new Map(computeStandings(teams, matches).map((row) => [row.teamId, row]))
  for (const season of seasons) {
    const seasonTeams = teams.filter((team) => team.seasonId === season.id)
    if (!seasonTeams.length) continue
    const names = new Set(seasonTeams.map((team) => normalizeName(team.name)))
    const seasonMatches = matches.filter((match) => match.seasonId != null ? match.seasonId === season.id : names.has(normalizeName(match.home)) && names.has(normalizeName(match.away)))
    const groups = computeGroupStandings(seasonTeams, tableStageMatches(season, seasonMatches), season)
    const seasonRows = new Map(groups.flatMap((group) => group.rows).map((row) => [row.teamId, row]))
    for (const team of seasonTeams) {
      rows.set(team.id, seasonRows.get(team.id) ?? computeStandings([team], [])[0])
    }
  }
  return teams.map((team) => {
    const row = rows.get(team.id)
    if (!row) return team
    return { ...team, played: row.played, goalDifference: row.goalDifference, points: row.points }
  })
}

/** Keep roster/pool totals in sync with the same event log as the scorer lists. */
export function withDerivedPlayerTotals(players: Player[], matches: Match[]): Player[] {
  const stats = new Map(computePlayerStats(players, matches).map((line) => [line.playerId, line]))
  return players.map((player) => {
    const line = stats.get(player.id)
    return { ...player, goals: line?.goals ?? 0, assists: line?.assists ?? 0 }
  })
}

/** Why a shootout cannot be saved, or '' when it can: it follows a level score and has a winner. */
export function shootoutError(homeScore: number, awayScore: number, homePenalties: number, awayPenalties: number): string {
  if (homeScore !== awayScore) return 'A penalty shootout only follows a level score. Clear the penalties or correct the score.'
  if (homePenalties === awayPenalties) return 'A penalty shootout needs a winner. Enter the final shootout score.'
  return ''
}

/** "Northside won 5–4 on penalties", or null when there was no shootout. */
export function shootoutLine(match: Match): string | null {
  const { homePenalties: home, awayPenalties: away } = match
  if (home == null || away == null || home === away) return null
  return home > away
    ? `${match.home} won ${home}–${away} on penalties`
    : `${match.away} won ${away}–${home} on penalties`
}

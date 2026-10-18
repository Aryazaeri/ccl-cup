// Builds knockout brackets for the imported archive seasons from their
// knockout fixtures. Run from the signed-in admin page (localhost:5173):
//   const m = await import('/tools/season-scraper/brackets.ts'); await m.run(false)  // preview
//   await m.run(true)                                                                     // write
// The tree is rebuilt backwards from the final: each tie's clubs came from the
// ties they won one round earlier. Results and progression then come from the
// app's own bracketWithResults, exactly as the public site computes them.
import { supabase } from '/src/lib/supabase.ts'
import { generateEmptyBracket } from '/src/lib/bracketUtils.ts'
import { bracketWithResults } from '/src/lib/qualificationUtils.ts'

const SIZE: Record<string, number> = { round_of_32: 32, round_of_16: 16, quarter_final: 8, semi_final: 4, final: 2 }
const ROUND: Record<number, string> = { 32: 'round-of-32', 16: 'round-of-16', 8: 'quarter-final', 4: 'semi-final', 2: 'final' }
type Club = { name: string; logo_url: string | null }
type Row = { id: number; season_id: number; stage: string; home_team_id: number; away_team_id: number; home_score: number | null; away_score: number | null; home_penalties: number | null; away_penalties: number | null; match_status: string; home: Club; away: Club }
/** A recorded fixture, or a tie missing from the archive (`through` = the club that played the next round). */
type Tie = { home: number | null; away: number | null; fixture?: Row; through?: number }

const winner = (m: Row) =>
  m.home_score == null || m.away_score == null ? null
    : m.home_score > m.away_score ? m.home_team_id
    : m.away_score > m.home_score ? m.away_team_id
    : m.home_penalties != null && m.away_penalties != null && m.home_penalties !== m.away_penalties
      ? (m.home_penalties > m.away_penalties ? m.home_team_id : m.away_team_id) : null

export async function run(write: boolean) {
  const { data: seasons, error: seasonError } = await supabase!.from('seasons').select('id, name').like('slug', 'archive-%').order('id')
  if (seasonError) throw seasonError
  const { data, error } = await supabase!
    .from('matches')
    .select('id, season_id, stage, home_team_id, away_team_id, home_score, away_score, home_penalties, away_penalties, match_status, home:teams!matches_home_team_id_fkey(name, logo_url), away:teams!matches_away_team_id_fkey(name, logo_url)')
    .in('season_id', seasons.map((s) => s.id))
    .neq('stage', 'group')
  if (error) throw error
  const { data: teamRows } = await supabase!.from('teams').select('id, name, logo_url').in('season_id', seasons.map((s) => s.id))
  const teamInfo = new Map((teamRows ?? []).map((t) => [t.id as number, t as { id: number; name: string; logo_url: string | null }]))

  const report = []
  for (const season of seasons) {
    const ko = (data as unknown as Row[]).filter((m) => m.season_id === season.id && SIZE[m.stage])
    if (!ko.length) { report.push({ season: season.name, skipped: 'no knockout matches' }); continue }
    const sizes = [...new Set(ko.map((m) => SIZE[m.stage]))].sort((a, b) => b - a)
    const first = sizes[0]
    const byRound = (size: number) => ko.filter((m) => SIZE[m.stage] === size)
    const notes: string[] = []
    const used = new Set<number>()

    // The final is the one between the semi-final winners.
    const semiWinners = byRound(4).map(winner).filter((t): t is number => t != null)
    const finals = byRound(2)
    const recorded = finals.find((f) => semiWinners.includes(f.home_team_id) && semiWinners.includes(f.away_team_id))
    let final: Tie
    if (recorded) final = { home: recorded.home_team_id, away: recorded.away_team_id, fixture: recorded }
    else if (semiWinners.length === 2) {
      final = { home: semiWinners[0], away: semiWinners[1] }
      notes.push('final missing from the archive (its "final" is between the semi-final losers); final shown without a result')
    } else final = { home: finals[0]?.home_team_id ?? null, away: finals[0]?.away_team_id ?? null, fixture: finals[0] }
    if (finals.length > 1) notes.push(`${finals.length} finals recorded; the bracket uses the one between the semi-final winners`)
    if (final.fixture) used.add(final.fixture.id)

    // levels[size] = ties of that round in bracket order.
    const levels: Record<number, Tie[]> = { 2: [final] }
    for (let size = 2; size < first; size *= 2) {
      const below = size * 2
      const reached = new Set(byRound(below).flatMap((m) => [m.home_team_id, m.away_team_id]))
      levels[below] = levels[size].flatMap((tie) => [tie.home, tie.away].map((team): Tie => {
        if (team == null) return { home: null, away: null }
        const m = byRound(below).find((x) => !used.has(x.id) && winner(x) === team)
        if (m) { used.add(m.id); return { home: team, away: m.home_team_id === team ? m.away_team_id : m.home_team_id, fixture: m } }
        // Missing tie: the club played the next round, so it went through. Its opponent, if
        // known, won a tie one round further down and appears in no recorded tie at this round.
        const opponentTie = below < first
          ? byRound(below * 2).find((x) => !used.has(x.id) && winner(x) != null && winner(x) !== team && !reached.has(winner(x)))
          : undefined
        notes.push(`${ROUND[below]} for ${teamInfo.get(team)?.name ?? team} missing from the archive; shown as through (it played the next round)`)
        return { home: team, away: opponentTie ? winner(opponentTie) : null, through: team }
      }))
    }
    const unplaced = byRound(first).filter((m) => !used.has(m.id))
    if (unplaced.length) notes.push(`${unplaced.length} ${ROUND[first]} matches are not on the bracket tree (extra/plate ties)`)

    const slot = (slotId: string, team: number | null) => {
      const info = team == null ? undefined : teamInfo.get(team)
      return info ? { slotId, teamId: info.id, teamName: info.name, teamLogo: info.logo_url ?? undefined, teamColor: '#63e35b', teamCountryCode: 'TR' } : { slotId, teamId: null }
    }
    const empty = generateEmptyBracket(first)
    empty.rounds[0].matches.forEach((tie, i) => {
      const t = levels[first][i]
      tie.slot1 = slot(tie.slot1.slotId, t?.home ?? null)
      tie.slot2 = slot(tie.slot2.slotId, t?.away ?? null)
    })
    // Record every winner up front so the first progression pass fills each round; a missing
    // tie keeps the club that went through (bracketWithResults leaves fixture-less ties alone).
    empty.rounds.forEach((round, r) => round.matches.forEach((tie, i) => {
      const t = levels[first / 2 ** r]?.[i]
      const won = t?.through ?? (t?.fixture ? winner(t.fixture) : null)
      if (won == null || !t) return
      tie.winnerSlotId = won === t.home ? tie.slot1.slotId : tie.slot2.slotId
      tie.winnerTeamId = won
    }))

    const appMatches = ko.map((m) => ({ id: m.id, stage: m.stage, home: m.home.name, away: m.away.name, homeTeamId: m.home_team_id, awayTeamId: m.away_team_id, homeScore: m.home_score ?? undefined, awayScore: m.away_score ?? undefined, homePenalties: m.home_penalties ?? undefined, awayPenalties: m.away_penalties ?? undefined, matchStatus: m.match_status, status: 'played' }))
    // Round 0 holds every slot; recomputeProgression (inside bracketWithResults) fills the rest.
    const bracket = bracketWithResults(empty, appMatches as never)
    const ties = bracket.rounds.flatMap((r) => r.matches)
    if (write) {
      const { error: saveError } = await supabase!.from('seasons').update({ bracket }).eq('id', season.id)
      if (saveError) throw saveError
    }
    report.push({ season: season.name, teams: first, knockoutMatches: ko.length,
      tiesWithResult: `${ties.filter((t) => t.resultMatchId != null || t.winnerTeamId != null).length}/${ties.length}`,
      champion: bracket.championSlot?.teamName ?? null, notes })
  }
  return report
}

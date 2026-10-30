import { useAdminLanguage } from '../i18n/AdminLanguageContext'
import type { BracketMatch, BracketRound, BracketSlot, Match, TournamentBracket } from '../types'
import { TeamMark } from './TeamMark'
import { bracketMatchScores, isByeTie } from '../lib/qualificationUtils'

/** Shared draw with optional staff match registration; public views remain read-only. */
export function KnockoutBracket({ bracket, matches = [], onMatchAction }: { bracket: TournamentBracket; matches?: Match[]; onMatchAction?: (tie: BracketMatch, round: BracketRound, fixture?: Match) => void }) {
  const { tr } = useAdminLanguage()
  const club = (slot: BracketSlot, winner: boolean, score?: number) => (
    <div className={`knockout-club${winner ? ' is-winner' : ''}`}>
      {slot.teamId ? <TeamMark name={slot.teamName ?? 'Club'} logoUrl={slot.teamLogo} color={slot.teamColor} size="sm" /> : null}
      <span><strong>{slot.teamName ?? tr("To be decided")}</strong>{slot.qualificationLabel ? <small>{slot.qualificationLabel}</small> : null}</span>
      {score != null ? <b>{score}</b> : winner ? <b aria-label={tr("Winner")}>✓</b> : null}
    </div>
  )
  return (
    <div className="knockout-scroll" role="region" aria-label={tr("Knockout bracket")} tabIndex={0}>
      <div className="knockout-rounds">
        {bracket.rounds.filter((round) => round.matches.some((tie) => !isByeTie(tie))).map((round) => (
          <section className="knockout-round" key={round.roundIndex} aria-label={tr(round.roundName)}>
            <h3>{tr(round.roundName)}</h3>
            <div className="knockout-ties">
              {round.matches.filter((tie) => !isByeTie(tie)).map((tie) => {
                const fixture = matches.find((match) => match.id === tie.resultMatchId)
                const [score1, score2] = bracketMatchScores(tie, fixture)
                return (
                  <article className={onMatchAction && tie.slot1.teamId && tie.slot2.teamId ? 'knockout-tie is-actionable' : 'knockout-tie'} key={tie.matchId} onClick={onMatchAction && tie.slot1.teamId && tie.slot2.teamId ? () => onMatchAction(tie, round, fixture) : undefined}>
                    {club(tie.slot1, tie.winnerSlotId === tie.slot1.slotId, score1)}
                    {club(tie.slot2, tie.winnerSlotId === tie.slot2.slotId, score2)}
                    {onMatchAction && <button type="button" className="knockout-match-action" disabled={!tie.slot1.teamId || !tie.slot2.teamId} onClick={(event) => { event.stopPropagation(); onMatchAction(tie, round, fixture) }}>
                      {fixture ? tr("Manage match") : tie.slot1.teamId && tie.slot2.teamId ? tr("Register match") : tr("Waiting for opponent")}
                    </button>}
                    {fixture?.homePenalties != null && fixture.awayPenalties != null ? <small className="knockout-note">{tr("Penalties: ")}{fixture.home} {fixture.homePenalties}–{fixture.awayPenalties} {fixture.away}</small> : null}
                  </article>
                )
              })}
            </div>
          </section>
        ))}
        <section className="knockout-round knockout-champion" aria-label={tr("Champion")}>
          <h3>{tr("Champion")}</h3>
          {club(bracket.championSlot ?? { slotId: 'champion', teamId: null }, bracket.championSlot?.teamId != null)}
        </section>
      </div>
    </div>
  )
}

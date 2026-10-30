import { useAdminLanguage } from '../i18n/AdminLanguageContext'
import { useMemo, useRef, useState } from 'react'
import { Trophy } from 'lucide-react'
import type { BracketMatch, BracketRound, Match, Season, Team } from '../types'
import { bracketWithResults, qualificationPreview, seedQualifiedBracket } from '../lib/qualificationUtils'
import { useConfirm } from './ConfirmDialog'
import { KnockoutBracket } from './KnockoutBracket'
import { KnockoutFixtureForm } from './KnockoutFixtureForm'
import type { FixtureOptions } from '../lib/fixtureUtils'

export function QualificationPanel({ season, teams, matches, canManage, onUpdateSeason, onOpenBracket, onGenerateFixtures, onManageMatch }: {
  season: Season
  teams: Team[]
  matches: Match[]
  canManage: boolean
  onUpdateSeason: (season: Season) => Promise<void>
  onOpenBracket: (season: Season) => void
  onGenerateFixtures?: (seasonId: number, options: FixtureOptions) => Promise<void>
  onManageMatch?: (match: Match) => void
}) {
  const { tr } = useAdminLanguage()
  const preview = useMemo(() => qualificationPreview(season, teams, matches), [season, teams, matches])
  const bracket = useMemo(() => season.bracket ? bracketWithResults(season.bracket, matches) : null, [season.bracket, matches])
  const [registration, setRegistration] = useState<{ tie: BracketMatch; round: BracketRound } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const flight = useRef(false)
  const { confirm, confirmDialog } = useConfirm()
  const seeded = Boolean(bracket?.qualification?.seededAt)
  const expected = preview.qualifiers.map((row) => `${row.teamId}:${row.qualificationLabel}`).sort().join('|')
  const saved = bracket?.rounds[0]?.matches.flatMap((tie) => [tie.slot1, tie.slot2]).filter((slot) => slot.teamId != null).map((slot) => `${slot.teamId}:${slot.qualificationLabel}`).sort().join('|')

  const changeCompletionMode = async (completionMode: 'round_robin' | 'scheduled') => {
    if (flight.current || seeded || !canManage || !season.bracket?.qualification) return
    flight.current = true
    try {
      if (completionMode === 'scheduled' && !(await confirm({
        title: 'Use the scheduled league matches?',
        body: 'Confirm that the scheduled fixtures are the complete league programme before generating the playoff draw.',
        consequences: ['Every scheduled league match must be completed.', 'Every registered club must have a result, and unresolved ranking ties still need a recorded lots order.'],
        confirmLabel: 'Use scheduled matches',
      }))) return
      setSaving(true)
      setError('')
      await onUpdateSeason({ ...season, bracket: { ...season.bracket, qualification: { ...season.bracket.qualification, completionMode } } })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The qualification setting could not be saved.')
    } finally {
      flight.current = false
      setSaving(false)
    }
  }

  const generate = async () => {
    if (flight.current) return
    flight.current = true
    try {
      if (seeded && !(await confirm({
        title: 'Replace knockout draw?',
        body: 'Generate a new draw using the current table positions?',
        consequences: ['Saved bracket winners will be cleared.', 'Fixtures and their scores will remain in Matches.'],
        confirmLabel: 'Replace draw',
      }))) return
      setSaving(true)
      setError('')
      const next = seedQualifiedBracket(season, teams, matches)
      await onUpdateSeason({ ...season, bracket: next })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The knockout draw could not be saved.')
    } finally {
      flight.current = false
      setSaving(false)
    }
  }

  return (
    <section className="admin-panel qualification-panel" aria-label={tr("Knockout qualification")}>
      <div className="admin-panel-head">
        <div><h3><Trophy size={18} /> {tr(" Table stage → Knockout")}</h3><p>{tr("Top ")}{preview.perTable} {tr(" from ")}{preview.groups.length === 1 ? tr("the table") : tr("each group")} {tr(" qualify · ")}{preview.teamCount} {tr(" clubs")}</p></div>
        {canManage ? <div className="qualification-actions">
          {seeded ? <button className="button button-admin" onClick={() => onOpenBracket(season)}>{tr("Open knockout draw")}</button> : null}
          <button className="button button-admin" disabled={saving || !preview.ready} onClick={() => void generate()}>{saving ? tr("Saving…") : seeded ? tr("Regenerate draw") : tr("Generate knockout draw")}</button>
        </div> : null}
      </div>
      {season.seasonType === 'league' && canManage ? <label className="qualification-message qualification-schedule">
        {tr("League schedule")} <select aria-label={tr("League schedule")} value={preview.completionMode} disabled={saving || seeded} onChange={(event) => void changeCompletionMode(event.target.value as 'round_robin' | 'scheduled')}>
          <option value="round_robin">{tr("Full round robin — every club meets every other club")}</option>
          <option value="scheduled">{tr("Custom schedule — all scheduled league matches completed")}</option>
        </select>
      </label> : null}
      {!preview.ready ? <p className="qualification-message">{tr(preview.reason)}</p> : !seeded ? <p className="qualification-message">{tr("All entered table fixtures are complete. Check the schedule, then generate the draw to confirm qualification.")}</p> : null}
      {seeded && expected !== saved ? <p className="qualification-message">{tr("Table positions have changed since qualification. The saved draw stays fixed until you regenerate it.")}</p> : null}
      {error ? <p className="form-error" role="alert">{tr(error)}</p> : null}
      {seeded && bracket ? <><p className="qualification-message">{tr("Enter knockout fixtures with the round shown below. Completed scores and penalty shootouts advance winners automatically.")}</p><KnockoutBracket bracket={bracket} matches={matches} onMatchAction={onGenerateFixtures ? (tie, round, fixture) => {
        if (fixture) onManageMatch?.(fixture)
        else setRegistration({ tie, round })
      } : undefined} /></> : (
        <div className="qualification-preview">{preview.qualifiers.map((row) => <span key={`${row.groupId}-${row.teamId}`}><small>{row.qualificationLabel}</small><strong>{row.teamName}</strong><span>{row.points} {tr(" pts")}</span></span>)}</div>
      )}
      {registration && onGenerateFixtures ? <KnockoutFixtureForm season={season} tie={registration.tie} round={registration.round} onClose={() => setRegistration(null)} onSave={(options) => onGenerateFixtures(season.id, options)} /> : null}
      {confirmDialog}
    </section>
  )
}

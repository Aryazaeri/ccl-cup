import { useAdminLanguage } from '../i18n/AdminLanguageContext'
import { useMemo, useRef, useState, type FormEvent } from 'react'
import { CalendarDays } from 'lucide-react'
import type { Match, Season, Team } from '../types'
import { planFixtures, type FixtureOptions } from '../lib/fixtureUtils'
import { defaultSeasonId, seasonLabel } from '../lib/seasonLabels'
import { Modal } from './Modal'

export function FixtureGenerator({ seasons, teams, matches, onGenerate }: {
  seasons: Season[]
  teams: Team[]
  matches: Match[]
  onGenerate: (seasonId: number, options: FixtureOptions) => Promise<void>
}) {
  const { tr } = useAdminLanguage()
  const [open, setOpen] = useState(false)
  const [seasonId, setSeasonId] = useState(() => defaultSeasonId(seasons) ?? seasons[0]?.id ?? 0)
  const season = seasons.find((item) => item.id === seasonId)
  const [options, setOptions] = useState<FixtureOptions>(() => ({
    phase: seasons.find((item) => item.id === seasonId)?.seasonType === 'tournament' ? 'knockout' : 'table',
    legs: 1, startDate: new Date().toLocaleDateString('en-CA'), time: '18:00', venue: '',
    daysBetweenRounds: 7, minutesBetweenMatches: 120, publication: 'Draft',
  }))
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const flight = useRef(false)
  const planned = useMemo(() => {
    if (!preview || !season) return { plan: null, error: '' }
    try { return { plan: planFixtures(season, teams, matches, options), error: '' } }
    catch (reason) { return { plan: null, error: reason instanceof Error ? reason.message : 'The schedule could not be generated.' } }
  }, [preview, season, teams, matches, options])
  const change = (next: Partial<FixtureOptions>) => {
    setOptions((current) => ({ ...current, ...next }))
    setPreview(false)
    setError('')
  }
  const showPreview = (event: FormEvent) => { event.preventDefault(); setError(''); setPreview(true) }
  const save = async () => {
    if (flight.current || !planned.plan?.fixtures.length) return
    flight.current = true
    setSaving(true)
    setError('')
    try {
      await onGenerate(seasonId, { ...options, expectedKeys: planned.plan.fixtures.map((match) => match.fixtureKey!) })
      setMessage('Saved. All fixtures are public when their tournament is published.')
      setOpen(false)
      setPreview(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The fixtures could not be saved.')
    } finally { flight.current = false; setSaving(false) }
  }
  return (
    <section className="admin-panel fixture-generator" aria-label={tr("Fixture generation")}>
      <div className="admin-panel-head">
        <div><h3><CalendarDays size={18} /> {tr(" Generate fixtures")}</h3><p>{tr("Create a table schedule or the next available knockout games.")}</p></div>
        <button className="button button-admin" disabled={!seasons.length} onClick={() => { setOpen(true); setMessage(''); setError('') }}>{tr("Plan fixtures")}</button>
      </div>
      {message ? <p role="status">{tr(message)}</p> : null}
      {open ? <Modal title={tr("Plan fixtures")} className="fixture-modal" onClose={() => { if (!flight.current) setOpen(false) }}>
        <form className="admin-form fixture-options" onSubmit={showPreview}>
          <fieldset className="fixture-fields" disabled={saving}>
            <label>{tr("Season")}<select value={seasonId} onChange={(event) => {
              const id = Number(event.target.value)
              setSeasonId(id)
              change({ phase: seasons.find((item) => item.id === id)?.seasonType === 'tournament' ? 'knockout' : 'table' })
            }}>{seasons.map((item) => <option key={item.id} value={item.id}>{seasonLabel(item)}</option>)}</select></label>
            <label>{tr("Stage")}<select value={options.phase} onChange={(event) => change({ phase: event.target.value as FixtureOptions['phase'] })}>
              <option value="table" disabled={season?.seasonType === 'tournament'}>{tr("League / group stage")}</option>
              <option value="knockout">{tr("Knockout games with known opponents")}</option>
            </select></label>
            {options.phase === 'table' ? <label>{tr("Meetings per pair")}<select value={options.legs} onChange={(event) => change({ legs: Number(event.target.value) as 1 | 2 })}><option value={1}>{tr("Once")}</option></select></label> : null}
            <label>{tr("First match date")}<input type="date" required value={options.startDate} onChange={(event) => change({ startDate: event.target.value })} /></label>
            <label>{tr("First kickoff (Istanbul time)")}<input type="time" required value={options.time} onChange={(event) => change({ time: event.target.value })} /></label>
            <label>{tr("Venue")}<input required value={options.venue} onChange={(event) => change({ venue: event.target.value })} placeholder={tr("Ground name")} /></label>
            <label>{tr("Days between rounds")}<input type="number" min={1} max={365} required value={options.daysBetweenRounds} onChange={(event) => change({ daysBetweenRounds: Number(event.target.value) })} /></label>
            <label>{tr("Minutes between games")}<input type="number" min={1} max={1440} required value={options.minutesBetweenMatches} onChange={(event) => change({ minutesBetweenMatches: Number(event.target.value) })} /></label>
          </fieldset>
          <div className="form-actions span-2"><button className="button button-admin" type="submit" disabled={saving}>{tr("Preview schedule")}</button></div>
        </form>
        {planned.error || error ? <p className="form-error" role="alert">{tr(error || planned.error)}</p> : null}
        {planned.plan ? <section className="fixture-preview" aria-label={tr("Schedule preview")}>
          <h3>{planned.plan.fixtures.length} {tr(" new fixture")}{planned.plan.fixtures.length === 1 ? '' : tr("s")} · {planned.plan.skipped} {tr(" existing game")}{planned.plan.skipped === 1 ? '' : tr("s")} {tr(" kept")}</h3>
          {planned.plan.waiting ? <p>{planned.plan.waiting} {tr(" knockout games await opponents. Generate again after recording the earlier results.")}</p> : null}
          <p>{tr("Games at ")}{options.venue} {tr(" use Istanbul time. Check these dates against existing fixtures before saving.")}</p>
          {planned.plan.fixtures.length ? <>
            <div className="fixture-preview-scroll"><table><thead><tr><th>{tr("Stage")}</th><th>{tr("Fixture")}</th><th>{tr("Date")}</th><th>{tr("Time")}</th><th>{tr("Visibility")}</th></tr></thead><tbody>{planned.plan.fixtures.map((match) => <tr key={match.fixtureKey}><td>{match.stage}</td><td>{match.home} {tr(" vs ")}{match.away}</td><td>{match.kickoffAt?.slice(0, 10)}</td><td>{match.time}</td><td>{match.status === 'Draft' ? tr("Draft") : tr("Published")}</td></tr>)}</tbody></table></div>
            <div className="form-actions"><button type="button" className="button button-admin" disabled={saving} onClick={() => void save()}>{saving ? tr("Saving…") : tr("Create {value0} fixture{value1}", { value0: planned.plan.fixtures.length, value1: planned.plan.fixtures.length === 1 ? '' : 's' })}</button></div>
          </> : <p>{tr("No new fixtures are needed for this selection.")}</p>}
        </section> : null}
      </Modal> : null}
    </section>
  )
}

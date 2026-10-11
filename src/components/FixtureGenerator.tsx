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
      setMessage(`Schedule saved. Existing games were kept. ${options.publication === 'Draft' ? 'Draft games are ready to review in Matches.' : 'Published games are visible on the public site.'}`)
      setOpen(false)
      setPreview(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The fixtures could not be saved.')
    } finally { flight.current = false; setSaving(false) }
  }
  return (
    <section className="admin-panel fixture-generator" aria-label="Fixture generation">
      <div className="admin-panel-head">
        <div><h3><CalendarDays size={18} /> Generate fixtures</h3><p>Create a table schedule or the next available knockout games.</p></div>
        <button className="button button-admin" disabled={!seasons.length} onClick={() => { setOpen(true); setMessage(''); setError('') }}>Plan fixtures</button>
      </div>
      {message ? <p role="status">{message}</p> : null}
      {open ? <Modal title="Plan fixtures" className="fixture-modal" onClose={() => { if (!flight.current) setOpen(false) }}>
        <form className="admin-form fixture-options" onSubmit={showPreview}>
          <fieldset className="fixture-fields" disabled={saving}>
            <label>Season<select value={seasonId} onChange={(event) => {
              const id = Number(event.target.value)
              setSeasonId(id)
              change({ phase: seasons.find((item) => item.id === id)?.seasonType === 'tournament' ? 'knockout' : 'table' })
            }}>{seasons.map((item) => <option key={item.id} value={item.id}>{seasonLabel(item)}</option>)}</select></label>
            <label>Stage<select value={options.phase} onChange={(event) => change({ phase: event.target.value as FixtureOptions['phase'] })}>
              <option value="table" disabled={season?.seasonType === 'tournament'}>League / group stage</option>
              <option value="knockout">Knockout games with known opponents</option>
            </select></label>
            {options.phase === 'table' ? <label>Meetings per pair<select value={options.legs} onChange={(event) => change({ legs: Number(event.target.value) as 1 | 2 })}><option value={1}>Once</option><option value={2}>Twice — home and away</option></select></label> : null}
            <label>First match date<input type="date" required value={options.startDate} onChange={(event) => change({ startDate: event.target.value })} /></label>
            <label>First kickoff (Istanbul time)<input type="time" required value={options.time} onChange={(event) => change({ time: event.target.value })} /></label>
            <label>Venue<input required value={options.venue} onChange={(event) => change({ venue: event.target.value })} placeholder="Ground name" /></label>
            <label>Days between rounds<input type="number" min={1} max={365} required value={options.daysBetweenRounds} onChange={(event) => change({ daysBetweenRounds: Number(event.target.value) })} /></label>
            <label>Minutes between games<input type="number" min={1} max={1440} required value={options.minutesBetweenMatches} onChange={(event) => change({ minutesBetweenMatches: Number(event.target.value) })} /></label>
            <label>Visibility<select value={options.publication} onChange={(event) => change({ publication: event.target.value as Match['status'] })}><option value="Draft">Draft — review before publishing</option><option value="Scheduled">Published — show on public site</option></select></label>
          </fieldset>
          <div className="form-actions span-2"><button className="button button-admin" type="submit" disabled={saving}>Preview schedule</button></div>
        </form>
        {planned.error || error ? <p className="form-error" role="alert">{error || planned.error}</p> : null}
        {planned.plan ? <section className="fixture-preview" aria-label="Schedule preview">
          <h3>{planned.plan.fixtures.length} new fixture{planned.plan.fixtures.length === 1 ? '' : 's'} · {planned.plan.skipped} existing game{planned.plan.skipped === 1 ? '' : 's'} kept</h3>
          {planned.plan.waiting ? <p>{planned.plan.waiting} knockout games await opponents. Generate again after recording the earlier results.</p> : null}
          <p>Games at {options.venue} use Istanbul time. Check these dates against existing fixtures before saving.</p>
          {planned.plan.fixtures.length ? <>
            <div className="fixture-preview-scroll"><table><thead><tr><th>Stage</th><th>Fixture</th><th>Date</th><th>Time</th><th>Visibility</th></tr></thead><tbody>{planned.plan.fixtures.map((match) => <tr key={match.fixtureKey}><td>{match.stage}</td><td>{match.home} vs {match.away}</td><td>{match.kickoffAt?.slice(0, 10)}</td><td>{match.time}</td><td>{match.status === 'Draft' ? 'Draft' : 'Published'}</td></tr>)}</tbody></table></div>
            <div className="form-actions"><button type="button" className="button button-admin" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : `Create ${planned.plan.fixtures.length} fixture${planned.plan.fixtures.length === 1 ? '' : 's'}`}</button></div>
          </> : <p>No new fixtures are needed for this selection.</p>}
        </section> : null}
      </Modal> : null}
    </section>
  )
}

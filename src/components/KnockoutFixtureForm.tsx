import { useRef, useState, type FormEvent } from 'react'
import { useAdminLanguage } from '../i18n/AdminLanguageContext'
import type { BracketMatch, BracketRound, Season } from '../types'
import type { FixtureOptions } from '../lib/fixtureUtils'
import { knockoutFixtureKey } from '../lib/matchStages'
import { Modal } from './Modal'

export function KnockoutFixtureForm({ season, tie, round, onClose, onSave }: {
  season: Season
  tie: BracketMatch
  round: BracketRound
  onClose: () => void
  onSave: (options: FixtureOptions) => Promise<void>
}) {
  const { tr } = useAdminLanguage()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const flight = useRef(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (flight.current) return
    flight.current = true
    setSaving(true)
    setError('')
    const data = new FormData(event.currentTarget)
    try {
      const key = knockoutFixtureKey(tie)
      await onSave({ phase: 'knockout', onlyFixtureKey: key, expectedKeys: [key], legs: 1,
        startDate: String(data.get('date')), time: String(data.get('time')), venue: String(data.get('venue')),
        daysBetweenRounds: 1, minutesBetweenMatches: 1, publication: 'Scheduled' })
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create match.')
    } finally {
      flight.current = false
      setSaving(false)
    }
  }
  return <Modal title={tr("Register knockout match")} onClose={() => { if (!flight.current) onClose() }}>
    <form className="admin-form" onSubmit={(event) => void submit(event)} data-saving={saving ? 'true' : undefined}>
      <p className="span-2"><strong>{season.fullName}</strong><br />{tr(round.roundName)}<br />{tie.slot1.teamName} {tr("vs")} {tie.slot2.teamName}</p>
      <label>{tr("Date")}<input name="date" type="date" required defaultValue={new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())} disabled={saving} /></label>
      <label>{tr("First kickoff (Istanbul time)")}<input name="time" type="time" required defaultValue="10:00" disabled={saving} /></label>
      <label className="span-2">{tr("Venue")}<input name="venue" required defaultValue={season.city} disabled={saving} /></label>
      <p className="field-hint span-2">{tr("This match belongs to the knockout draw and does not change league points.")}</p>
      {error ? <p className="form-error span-2" role="alert">{tr(error)}</p> : null}
      <div className="form-actions span-2"><button type="button" className="button button-secondary" disabled={saving} onClick={onClose}>{tr("Cancel")}</button><button type="submit" className="button button-admin" disabled={saving}>{saving ? tr("Saving…") : tr("Create fixture")}</button></div>
    </form>
  </Modal>
}

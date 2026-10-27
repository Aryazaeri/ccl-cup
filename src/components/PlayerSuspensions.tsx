import { useEffect, useState, type FormEvent } from 'react'
import type { Player, PlayerSuspension, Season } from '../types'
import { seasonLabel } from '../lib/seasonLabels'
import { suspensionsRepository } from '../services/tournamentRepository'
import { isSupabaseConfigured } from '../lib/supabase'

export function PlayerSuspensions({ player, seasons }: { player: Player; seasons: Season[] }) {
  const [records, setRecords] = useState<PlayerSuspension[]>([])
  const [seasonId, setSeasonId] = useState(player.squads[0]?.seasonId)
  const [mode, setMode] = useState('matches')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!isSupabaseConfigured) return
    let active = true
    suspensionsRepository.list(player.id).then((rows) => { if (active) setRecords(rows) }).catch((e) => { if (active) setError(String(e.message)) })
    return () => { active = false }
  }, [player.id])
  const issue = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (busy) return
    const form = e.currentTarget, data = new FormData(form)
    const squad = player.squads.find((s) => s.seasonId === seasonId)
    if (!squad) { setError('Choose a tournament where this player is registered.'); return }
    setBusy(true); setError('')
    try {
      await suspensionsRepository.issue({ playerId: player.id, seasonId: squad.seasonId, teamId: squad.teamId,
        reason: String(data.get('reason')).trim(), matchCount: mode === 'matches' ? Number(data.get('matches')) : undefined,
        endsOn: mode === 'date' ? String(data.get('endsOn')) : undefined })
      setRecords(await suspensionsRepository.list(player.id)); form.reset()
    } catch (e) { setError(e instanceof Error ? e.message : 'Suspension could not be recorded.') }
    finally { setBusy(false) }
  }
  return <section className="player-suspensions">
    <h3>Staff-assigned suspensions</h3><p className="field-hint">Tournament only. Cards do not create automatic bans. A match is served when the club completes an actually played match with the player excluded from its lineup. Forfeits do not count. Date bans include the stated end date.</p>
    {!isSupabaseConfigured ? <p>Suspension records require the connected test or production database.</p> : <>
      {records.map((r) => <div className="module-note" key={r.id}><strong>{seasons.find((s) => s.id === r.seasonId)?.name}</strong> · {r.reason} · {r.matchCount != null ? `${Math.max(0, r.matchCount - r.served)} of ${r.matchCount} matches remaining` : `Banned through ${r.endsOn}`}
        {r.revokedAt ? ' · Revoked' : <button type="button" disabled={busy} onClick={async () => {
          setBusy(true); setError('')
          try { await suspensionsRepository.revoke(r.id); setRecords(await suspensionsRepository.list(player.id)) }
          catch (e) { setError(e instanceof Error ? e.message : 'Could not revoke suspension.') }
          finally { setBusy(false) }
        }}>Revoke suspension</button>}
      </div>)}
      <form className="admin-form" onSubmit={issue}>
        <label>Tournament<select value={seasonId ?? ''} onChange={(e) => setSeasonId(Number(e.target.value))} required>
          <option value="">Choose tournament</option>{player.squads.map((s) => <option key={s.seasonId} value={s.seasonId}>{seasons.find((t) => t.id === s.seasonId) ? seasonLabel(seasons.find((t) => t.id === s.seasonId)!) : 'Tournament'}</option>)}
        </select></label>
        <label>Duration<select value={mode} onChange={(e) => setMode(e.target.value)}><option value="matches">Match count</option><option value="date">Through an end date</option></select></label>
        {mode === 'matches' ? <label>Matches *<input name="matches" type="number" min={1} required /></label> : <label>Last suspended date *<input name="endsOn" type="date" required /></label>}
        <label className="span-2">Staff decision / reason *<textarea name="reason" required maxLength={2000} /></label>
        <div className="form-actions span-2"><button className="button button-admin" disabled={busy || !player.squads.length}>{busy ? 'Saving…' : 'Record suspension'}</button></div>
      </form>
    </>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>
}

import { useState, type FormEvent } from 'react'
import type { Season, Team } from '../types'
import { Modal } from './Modal'

export function LotsOrderForm({ season, teams, onSave, onClose }: {
  season: Season; teams: Team[]; onSave: (season: Season) => Promise<void>; onClose: () => void
}) {
  const [order, setOrder] = useState<(number | '')[]>(() => teams.map((_, i) => season.lotsOrder?.[i] ?? ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (busy) return
    if (order.some((id) => id === '') || new Set(order).size !== teams.length) { setError('Record every club once in the order drawn.'); return }
    setBusy(true); setError('')
    try { await onSave({ ...season, lotsOrder: order as number[] }); onClose() }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save the drawing order.') }
    finally { setBusy(false) }
  }
  return <Modal title={`Drawing of lots: ${season.name}`} onClose={() => { if (!busy) onClose() }}>
    <p>Record the order drawn by staff. It is used only after head-to-head, goal difference, goals scored, forfeits and disciplinary points remain equal. The app does not draw randomly.</p>
    <form className="admin-form" onSubmit={submit}>{order.map((id, index) => <label key={index}>Drawn position {index + 1}
      <select required value={id} onChange={(e) => setOrder(order.map((v, i) => i === index ? Number(e.target.value) || '' : v))}>
        <option value="">Choose club</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select></label>)}
      {error && <p role="alert" className="form-error span-2">{error}</p>}
      <div className="form-actions span-2"><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button disabled={busy} className="button button-admin">{busy ? 'Saving…' : 'Record drawing order'}</button></div>
    </form>
  </Modal>
}

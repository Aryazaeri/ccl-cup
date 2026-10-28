import { useAdminLanguage } from '../i18n/AdminLanguageContext'
import { useState, type FormEvent } from 'react'
import type { Club, Player, Season } from '../types'
import type { NewSquadPlayer } from '../services/tournamentRepository'
import { COUNTRIES } from '../lib/countries'
import { defaultSeasonId, seasonLabel } from '../lib/seasonLabels'
import { reportAssetSaveFailure } from '../lib/assetSaveUtils'
import { Modal } from './Modal'
import { ImageUploadField } from './ImageUploadField'

export function ClubRegistry({ clubs, seasons, onNew, onEdit, onEnter, entered }: {
  clubs: Club[]; seasons: Season[]; onNew: () => void; onEdit: (club: Club) => void
  onEnter: (club: Club, seasonId: number) => void; entered: (clubId: number, seasonId: number) => boolean
}) {
  const { tr } = useAdminLanguage()
  const [seasonId, setSeasonId] = useState(defaultSeasonId(seasons))
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const filtered = clubs.filter((c) => c.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 10) - 1))
  const visible = filtered.slice(currentPage * 10, currentPage * 10 + 10)
  return <section className="manager-view club-registry">
    <div className="manager-head"><div><h2>{tr("Club registry")}</h2><p>{tr("Register a club before entering a tournament. Registration has no player minimum; each new tournament squad starts empty and needs five players at entry.")}</p></div>
      <button className="button button-admin" onClick={onNew}>{tr("Register club")}</button></div>
    <div className="filter-bar"><label>{tr("Find club")}<input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0) }} /></label>
      <label>{tr("Entry tournament")}<select value={seasonId ?? ''} onChange={(e) => setSeasonId(Number(e.target.value))}>
        {seasons.map((s) => <option key={s.id} value={s.id}>{seasonLabel(s)}</option>)}
      </select></label></div>
    <div className="table-scroll"><table className="admin-table"><thead><tr><th>{tr("Club")}</th><th>{tr("Registered players")}</th><th>{tr("Actions")}</th></tr></thead><tbody>
      {visible.map((c) => <tr key={c.id}>
        <td>{c.name}</td><td>{c.registeredPlayerIds.length}</td><td><button className="row-action" onClick={() => onEdit(c)}>{tr("Edit registration")}</button>
          <button className="row-action" disabled={!seasonId || entered(c.id, seasonId)} onClick={() => seasonId && onEnter(c, seasonId)}>
            {seasonId && entered(c.id, seasonId) ? tr("Already entered") : tr("Enter tournament")}
          </button></td></tr>)}
    </tbody></table></div>
    {!filtered.length && <p className="field-hint">{clubs.length ? tr("No clubs match this search.") : tr("Register a club to start its shared identity.")}</p>}
    {filtered.length > 10 && <div className="manager-head-actions">
      <span>{tr("Showing ")}{currentPage * 10 + 1}–{Math.min((currentPage + 1) * 10, filtered.length)} {tr(" of ")}{filtered.length} {tr(" clubs")}</span>
      <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{tr("Previous clubs")}</button>
      <button type="button" disabled={(currentPage + 1) * 10 >= filtered.length} onClick={() => setPage(currentPage + 1)}>{tr("Next clubs")}</button>
    </div>}
  </section>
}

export function RegisteredClubForm({ initial, players, onClose, onSave }: {
  initial: Club | null; players: Player[]; onClose: () => void; onSave: (club: Club, newPlayers: NewSquadPlayer[]) => Promise<void>
}) {
  const { tr } = useAdminLanguage()
  const [ids, setIds] = useState(initial?.registeredPlayerIds ?? [])
  const [newPlayers, setNewPlayers] = useState<NewSquadPlayer[]>([])
  const [newName, setNewName] = useState('')
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (saving) return
    const form = e.currentTarget
    const data = new FormData(form)
    setSaving(true); setError('')
    try {
      await onSave({ id: initial?.id ?? 0, name: String(data.get('name')).trim(), countryCode: String(data.get('countryCode')),
        color: String(data.get('color')), logoUrl: String(data.get('logoUrl')) || undefined, registeredPlayerIds: ids }, newPlayers)
      onClose()
    } catch (reason) { reportAssetSaveFailure(form, reason); setError(reason instanceof Error ? reason.message : 'Club registration could not be saved.') }
    finally { setSaving(false) }
  }
  return <Modal title={initial ? tr("Club registration: {value0}", { value0: initial.name }) : tr("Register club")} onClose={() => { if (!saving) onClose() }}>
    <form className="admin-form" onSubmit={submit}>
      <label className="span-2">{tr("Club name *")}<input name="name" required maxLength={80} defaultValue={initial?.name ?? ''} /></label>
      <label>{tr("Country")}<select name="countryCode" defaultValue={initial?.countryCode ?? 'TR'}>{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{tr(c.name)}</option>)}</select></label>
      <label>{tr("Club colour")}<input type="color" name="color" defaultValue={initial?.color ?? '#63e35b'} /></label>
      <ImageUploadField name="logoUrl" label={tr("Club crest")} folder="logos" defaultValue={initial?.logoUrl} />
      <fieldset className="span-2"><legend>{tr("Registered players (")}{ids.length + newPlayers.length})</legend>
        <p className="field-hint">{tr("This registration list does not assign anyone to a tournament squad or transfer a player.")}</p>
        <label>{tr("Find existing player")}<input value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        <div className="registry-player-list">{players.filter((p) => p.fullName.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map((p) => <label className="checkbox-label" key={p.id}>
          <input type="checkbox" checked={ids.includes(p.id)} onChange={(e) => setIds(e.target.checked ? [...ids, p.id] : ids.filter((id) => id !== p.id))} />{p.fullName}
        </label>)}</div>
        <label>{tr("New player name")}<input value={newName} onChange={(e) => setNewName(e.target.value)} /></label>
        <button type="button" disabled={!newName.trim()} onClick={() => { setNewPlayers([...newPlayers, { fullName: newName.trim(), position: 'forward' }]); setNewName('') }}>{tr("Add new player to registration")}</button>
        {newPlayers.map((p, index) => <p key={index}>{p.fullName} <button type="button" onClick={() => setNewPlayers(newPlayers.filter((_, i) => i !== index))}>{tr("Remove")}</button></p>)}
      </fieldset>
      {error && <p className="form-error span-2" role="alert">{tr(error)}</p>}
      <div className="form-actions span-2"><button type="button" disabled={saving} onClick={onClose}>{tr("Cancel")}</button><button className="button button-admin" disabled={saving}>{saving ? tr("Saving…") : tr("Save club registration")}</button></div>
    </form>
  </Modal>
}

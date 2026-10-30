import { useAdminLanguage } from '../i18n/AdminLanguageContext'
import {
  Check,
  Dices,
  GripVertical,
  Maximize2,
  Minimize2,
  Plus,
  RotateCcw,
  Search,
  Trophy,
  X,
} from 'lucide-react'
import { useMemo, useRef, useState, type DragEvent } from 'react'
import { getCountry } from '../lib/countries'
import { autoSeedLeague, clearLeagueSlots } from '../lib/leagueUtils'
import { computeGroupStandings } from '../lib/standingsUtils'
import { tableStageMatches } from '../lib/matchStages'
import type { LeagueSlot, Match, Season, SeasonLeague, Team } from '../types'
import { Modal } from './Modal'
import { TeamMark } from './TeamMark'

type Props = {
  season?: Season
  matches?: Match[]
  seasonTitle: string
  teams: Team[]
  initialLeague?: SeasonLeague
  onClose: () => void
  onSave: (league: SeasonLeague) => void | Promise<void>
}

export function LeagueCanvasModal({
  seasonTitle,
  season,
  matches = [],
  teams,
  initialLeague,
  onClose,
  onSave,
}: Props) {
  const { tr } = useAdminLanguage()
  const [showCurrent, setShowCurrent] = useState(Boolean(season))
  const currentRows = useMemo(() => computeGroupStandings(teams, tableStageMatches(season, matches), season).flatMap((group) => group.rows), [teams, matches, season])
  // Extract placed slots only (slots that actually have a team)
  const [placedSlots, setPlacedSlots] = useState<LeagueSlot[]>(() => {
    if (!initialLeague?.slots) return []
    return initialLeague.slots
      .filter((s) => s.teamId != null)
      .map((s, idx) => ({ ...s, position: idx + 1 }))
  })

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const savingRef = useRef(false)

  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null)
  const [dragOverPosition, setDragOverPosition] = useState<number | null>(null)
  const [isFullScreen, setIsFullScreen] = useState(false)

  // Placed team IDs for quick lookup
  const placedTeamIds = useMemo(() => {
    const ids = new Set<number>()
    for (const slot of placedSlots) {
      if (slot.teamId) ids.add(slot.teamId)
    }
    return ids
  }, [placedSlots])

  // Filtered available teams for the sidebar
  const filteredTeams = useMemo(() => {
    return teams.filter((t) => {
      if (!searchTerm) return true
      return t.name.toLowerCase().includes(searchTerm.toLowerCase())
    })
  }, [teams, searchTerm])

  const handleAutoSeed = () => {
    const seeded = autoSeedLeague(teams, true)
    setPlacedSlots(seeded.slots)
  }

  const handleClearAll = () => {
    const cleared = clearLeagueSlots()
    setPlacedSlots(cleared.slots)
  }

  const handleDragStart = (e: DragEvent, team: Team) => {
    e.dataTransfer.setData('application/json', JSON.stringify(team))
    e.dataTransfer.effectAllowed = 'copyMove'
  }

  const handleDragOver = (e: DragEvent, position: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    if (dragOverPosition !== position) setDragOverPosition(position)
  }

  const handleDragLeave = (e: DragEvent, position: number) => {
    e.preventDefault()
    if (dragOverPosition === position) setDragOverPosition(null)
  }

  const handleDropOnPosition = (e: DragEvent, position: number) => {
    e.preventDefault()
    setDragOverPosition(null)

    try {
      const dataStr = e.dataTransfer.getData('application/json')
      if (!dataStr) return
      const team: Team = JSON.parse(dataStr)
      placeTeamInPosition(team, position)
    } catch {
      // Ignored
    }
  }

  const placeTeamInPosition = (team: Team, position: number) => {
    // If team is already in the list at another position, remove that instance first
    const withoutTeam = placedSlots.filter((s) => s.teamId !== team.id)

    const targetIdx = position - 1
    const newSlot: LeagueSlot = {
      position,
      teamId: team.id,
      teamName: team.name,
      teamColor: team.color,
      teamLogo: team.logoUrl,
      teamCountryCode: team.countryCode,
    }

    let updated: LeagueSlot[]
    if (targetIdx >= withoutTeam.length) {
      // Add to end
      updated = [...withoutTeam, newSlot]
    } else {
      // Insert / replace at position
      updated = [...withoutTeam]
      updated.splice(targetIdx, 1, newSlot)
    }

    // Re-index all positions from 1 to N
    const reindexed = updated.map((s, idx) => ({
      ...s,
      position: idx + 1,
    }))

    setPlacedSlots(reindexed)
    setSelectedTeamId(null)
  }

  const handleSlotClick = (position: number) => {
    if (selectedTeamId) {
      const selectedTeam = teams.find((t) => t.id === selectedTeamId)
      if (selectedTeam) {
        placeTeamInPosition(selectedTeam, position)
      }
    }
  }

  const removeTeamFromPosition = (position: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const updated = placedSlots.filter((s) => s.position !== position)
    const reindexed = updated.map((s, idx) => ({
      ...s,
      position: idx + 1,
    }))
    setPlacedSlots(reindexed)
  }

  const handleSave = async () => {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setSaveError('')
    const leagueData: SeasonLeague = {
      teamCount: placedSlots.length,
      slots: placedSlots,
    }
    try {
      await onSave(leagueData)
      onClose()
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : 'The league table could not be saved.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  if (showCurrent && season) return (
    <Modal title={tr("⚽ {value0} - League table", { value0: seasonTitle || 'League' })} onClose={onClose} className="bracket-canvas-modal-dialog">
      <section className="module-section canvas-results-preview" aria-label={tr("Current standings")}>
        <div className="module-head"><div><h3>{tr("Current standings")}</h3><p>{tr("Calculated from completed matches. Layout changes do not change points or rankings.")}</p></div>
          <button type="button" className="button button-admin" onClick={() => setShowCurrent(false)}>{tr("Edit table layout")}</button>
        </div>
        <div className="table-wrap"><table><thead><tr>{['Pos', 'Club', 'P', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'Pts'].map((label) => <th key={label} scope="col">{tr(label)}</th>)}</tr></thead><tbody>
          {currentRows.map((row) => <tr key={row.teamId}><td>{row.position}</td><td><TeamMark name={row.teamName} logoUrl={row.logoUrl} color={row.color} size="sm" /> {row.teamName}{row.lotsPending ? <small> {tr("Provisional ranking")}</small> : null}</td><td>{row.played}</td><td>{row.won}</td><td>{row.drawn}</td><td>{row.lost}</td><td>{row.goalsFor}</td><td>{row.goalsAgainst}</td><td>{row.goalDifference}</td><td>{row.points}</td></tr>)}
        </tbody></table></div>
      </section>
    </Modal>
  )

  // Next +1 position for the dynamic slot at the end
  const nextPlusOnePosition = placedSlots.length + 1

  return (
    <Modal
      title={tr("⚽ {value0} - League table", { value0: seasonTitle || 'League' })}
      onClose={() => { if (!savingRef.current) onClose() }}
      className={`bracket-canvas-modal-dialog ${isFullScreen ? 'is-fullscreen' : ''}`}
    >
      <div className="bracket-builder-shell">
        {/* TOP TOOLBAR */}
        <header className="bracket-builder-toolbar">
          <div className="toolbar-left">
            <span className="toolbar-label">{tr("Teams added:")}</span>
            <div className="count-pill-btn active">
              {placedSlots.length} {tr(" teams placed")}</div>
          </div>

          <div className="toolbar-right">
            {season && <button type="button" className="toolbar-btn" disabled={saving} onClick={() => setShowCurrent(true)}>{tr("Current standings")}</button>}
            <button type="button" className="toolbar-btn" disabled={saving} onClick={handleAutoSeed} title={tr("Add all clubs")}>
              <Dices size={16} /> {tr(" Add all clubs")}</button>
            <button type="button" className="toolbar-btn secondary" disabled={saving} onClick={handleClearAll} title={tr("Clear table")}>
              <RotateCcw size={16} /> {tr(" Clear")}</button>
            <button
              type="button"
              className="toolbar-btn icon-only"
              onClick={() => setIsFullScreen(!isFullScreen)}
              title={tr("Tam Ekran")}
            >
              {isFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button type="button" className="toolbar-btn primary" disabled={saving} onClick={() => void handleSave()}>
              <Check size={16} /> {saving ? tr("Saving…") : tr("Save league table ({value0} teams)", { value0: placedSlots.length })}
            </button>
          </div>
        </header>
        {saveError ? <p className="form-error" role="alert">{tr(saveError)}</p> : null}

        {/* WORKSPACE GRID: SIDEBAR + SINGLE FILE LEAGUE CANVAS */}
        <div className="bracket-workspace-grid" inert={saving}>
          {/* AVAILABLE CLUBS SIDEBAR */}
          <aside className="bracket-teams-sidebar">
            <div className="sidebar-search-box">
              <Search size={15} />
              <input
                type="text"
                placeholder={tr("Search clubs…")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="sidebar-stats-row">
              <span>{tr("Toplam Eklenen:")}</span>
              <strong>
                {placedSlots.length} / {teams.length} {tr(" clubs")}</strong>
            </div>

            <div className="draggable-teams-list">
              {filteredTeams.map((team) => {
                const isPlaced = placedTeamIds.has(team.id)
                const isSelected = selectedTeamId === team.id
                const country = getCountry(team.countryCode)

                return (
                  <div
                    key={team.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, team)}
                    onClick={() => setSelectedTeamId(isSelected ? null : team.id)}
                    className={`draggable-team-card ${isPlaced ? 'is-placed' : ''} ${
                      isSelected ? 'is-selected' : ''
                    }`}
                  >
                    <GripVertical size={14} className="drag-handle" />
                    <div
                      className="team-color-indicator"
                      style={{ background: team.color || '#63e35b' }}
                    />
                    <TeamMark
                      name={team.name}
                      color={team.color}
                      logoUrl={team.logoUrl}
                      size="sm"
                    />
                    <div className="team-card-info">
                      <strong>{team.name}</strong>
                      <small>
                        {country.flag} {tr(country.name)}
                      </small>
                    </div>
                    {isPlaced && (
                      <span className="placed-indicator-badge" title={tr("In the table")}>
                        ✓
                      </span>
                    )}
                  </div>
                )
              })}

              {filteredTeams.length === 0 && (
                <div className="empty-teams-notice">{tr("No clubs found.")}</div>
              )}
            </div>
          </aside>

          {/* DYNAMIC SINGLE-FILE LEAGUE CANVAS */}
          <main className="league-single-file-canvas-container">
            <div className="league-canvas-card">
              <div className="league-canvas-header">
                <div className="league-header-left">
                  <Trophy size={18} className="trophy-gold" />
                  <h3>
                    {tr("League order (")}{placedSlots.length} {tr(" teams)")}</h3>
                </div>
                <span className="league-drag-hint">
                  {tr("💡 Drag clubs in. A new position is always added at the end of the list.")}</span>
              </div>

              <div className="league-slots-list">
                {/* 1. PLACED TEAMS IN ORDER */}
                {placedSlots.map((slot) => {
                  const pos = slot.position
                  const isTopZone = pos <= 3
                  const country = slot.teamCountryCode ? getCountry(slot.teamCountryCode) : null
                  const isDragOver = dragOverPosition === pos

                  return (
                    <div
                      key={pos}
                      className={`league-file-slot-row ${isTopZone ? 'top-zone' : ''} has-team ${
                        isDragOver ? 'drag-over-active' : ''
                      }`}
                      onDragOver={(e) => handleDragOver(e, pos)}
                      onDragLeave={(e) => handleDragLeave(e, pos)}
                      onDrop={(e) => handleDropOnPosition(e, pos)}
                      onClick={() => handleSlotClick(pos)}
                    >
                      {/* POSITION NUMBER BADGE */}
                      <div className="slot-rank-badge">
                        <span>{pos}</span>
                      </div>

                      {/* FILLED SLOT CONTENT */}
                      <div className="slot-team-content">
                        <div
                          className="slot-color-bar"
                          style={{ background: slot.teamColor || '#63e35b' }}
                        />
                        <TeamMark
                          name={slot.teamName || ''}
                          color={slot.teamColor}
                          logoUrl={slot.teamLogo}
                          size="sm"
                        />
                        <div className="slot-name-details">
                          <strong className="slot-team-title">{slot.teamName}</strong>
                          {country && (
                            <small className="slot-country-tag">
                              {country.flag} {tr(country.name)}
                            </small>
                          )}
                        </div>
                        <span className="slot-zone-pill">
                          {pos === 1
                            ? tr("🥇 Leader")
                            : isTopZone
                            ? tr("🏆 Top places")
                            : tr("Position")}
                        </span>
                        <button
                          type="button"
                          className="btn-slot-remove"
                          onClick={(e) => removeTeamFromPosition(pos, e)}
                          title={tr("Remove from table")}
                        >
                          <X size={15} />
                        </button>
                      </div>
                    </div>
                  )
                })}

                {/* 2. ALWAYS PRESENT +1 EMPTY SLOT AT THE END */}
                <div
                  className={`league-file-slot-row empty ${
                    dragOverPosition === nextPlusOnePosition ? 'drag-over-active' : ''
                  }`}
                  onDragOver={(e) => handleDragOver(e, nextPlusOnePosition)}
                  onDragLeave={(e) => handleDragLeave(e, nextPlusOnePosition)}
                  onDrop={(e) => handleDropOnPosition(e, nextPlusOnePosition)}
                  onClick={() => handleSlotClick(nextPlusOnePosition)}
                >
                  <div className="slot-rank-badge">
                    <span>{nextPlusOnePosition}</span>
                  </div>
                  <div className="slot-empty-content">
                    <Plus size={16} className="empty-plus" />
                    <span>
                      {dragOverPosition === nextPlusOnePosition
                        ? tr("Drop here (position {value0})", { value0: nextPlusOnePosition })
                        : tr("+ Position {value0}: drag a club here or click", { value0: nextPlusOnePosition })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </Modal>
  )
}

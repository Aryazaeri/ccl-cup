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
import { useMemo, useState, type DragEvent } from 'react'
import { getCountry } from '../lib/countries'
import { autoSeedLeague, clearLeagueSlots } from '../lib/leagueUtils'
import type { LeagueSlot, SeasonLeague, Team } from '../types'
import { Modal } from './Modal'
import { TeamMark } from './TeamMark'

type Props = {
  seasonTitle: string
  teams: Team[]
  initialLeague?: SeasonLeague
  onClose: () => void
  onSave: (league: SeasonLeague) => void
}

export function LeagueCanvasModal({
  seasonTitle,
  teams,
  initialLeague,
  onClose,
  onSave,
}: Props) {
  // Extract placed slots only (slots that actually have a team)
  const [placedSlots, setPlacedSlots] = useState<LeagueSlot[]>(() => {
    if (!initialLeague?.slots) return []
    return initialLeague.slots
      .filter((s) => s.teamId != null)
      .map((s, idx) => ({ ...s, position: idx + 1 }))
  })

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

    let updated: LeagueSlot[] = []
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

  const handleSave = () => {
    const leagueData: SeasonLeague = {
      teamCount: placedSlots.length,
      slots: placedSlots,
    }
    onSave(leagueData)
    onClose()
  }

  // Next +1 position for the dynamic slot at the end
  const nextPlusOnePosition = placedSlots.length + 1

  return (
    <Modal
      title={`⚽ ${seasonTitle || 'Lig'} - Lig Tablosu (Dynamic Single-File Canvas)`}
      onClose={onClose}
      className={`bracket-canvas-modal-dialog ${isFullScreen ? 'is-fullscreen' : ''}`}
    >
      <div className="bracket-builder-shell">
        {/* TOP TOOLBAR */}
        <header className="bracket-builder-toolbar">
          <div className="toolbar-left">
            <span className="toolbar-label">Eklenen Takımlar:</span>
            <div className="count-pill-btn active">
              {placedSlots.length} Takım Yerleşti
            </div>
          </div>

          <div className="toolbar-right">
            <button type="button" className="toolbar-btn" onClick={handleAutoSeed} title="Tüm Kulüpleri Doldur">
              <Dices size={16} /> Otomatik Kura / Tümünü Ekle
            </button>
            <button type="button" className="toolbar-btn secondary" onClick={handleClearAll} title="Tabloyu Temizle">
              <RotateCcw size={16} /> Temizle
            </button>
            <button
              type="button"
              className="toolbar-btn icon-only"
              onClick={() => setIsFullScreen(!isFullScreen)}
              title="Tam Ekran"
            >
              {isFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button type="button" className="toolbar-btn primary" onClick={handleSave}>
              <Check size={16} /> Lig Tablosunu Kaydet ({placedSlots.length} Takım)
            </button>
          </div>
        </header>

        {/* WORKSPACE GRID: SIDEBAR + SINGLE FILE LEAGUE CANVAS */}
        <div className="bracket-workspace-grid">
          {/* AVAILABLE CLUBS SIDEBAR */}
          <aside className="bracket-teams-sidebar">
            <div className="sidebar-search-box">
              <Search size={15} />
              <input
                type="text"
                placeholder="Kulüp ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="sidebar-stats-row">
              <span>Toplam Eklenen:</span>
              <strong>
                {placedSlots.length} / {teams.length} Kulüp
              </strong>
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
                        {country.flag} {country.name}
                      </small>
                    </div>
                    {isPlaced && (
                      <span className="placed-indicator-badge" title="Tabloda Yer Aldı">
                        ✓
                      </span>
                    )}
                  </div>
                )
              })}

              {filteredTeams.length === 0 && (
                <div className="empty-teams-notice">Kulüp bulunamadı.</div>
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
                    Lig Sıralaması ve Katılımcı Takımlar ({placedSlots.length} Takım)
                  </h3>
                </div>
                <span className="league-drag-hint">
                  💡 Kulüpleri sürükleyip ekleyin. Liste sonuna her zaman yeni sıra (+1) otomatik eklenir.
                </span>
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
                              {country.flag} {country.name}
                            </small>
                          )}
                        </div>
                        <span className="slot-zone-pill">
                          {pos === 1
                            ? '🥇 Lider / Şampiyonluk Adayı'
                            : isTopZone
                            ? '🏆 Üst Sıra'
                            : 'Lig Sırası'}
                        </span>
                        <button
                          type="button"
                          className="btn-slot-remove"
                          onClick={(e) => removeTeamFromPosition(pos, e)}
                          title="Takımı Tablodan Çıkar"
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
                        ? `Buraya Bırak (#${nextPlusOnePosition}. Sıra)`
                        : `+ Sıra #${nextPlusOnePosition}: Kulübü buraya sürükleyin veya tıklayın`}
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

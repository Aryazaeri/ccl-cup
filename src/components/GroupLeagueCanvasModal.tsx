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
import { autoSeedGroupLeague, clearGroupLeagueSlots, generateEmptyGroupLeague } from '../lib/groupLeagueUtils'
import type { LeagueSlot, SeasonGroup, SeasonGroupLeague, Team } from '../types'
import { Modal } from './Modal'
import { TeamMark } from './TeamMark'

type Props = {
  seasonTitle: string
  teams: Team[]
  initialGroupLeague?: SeasonGroupLeague
  initialGroupCount?: number
  onClose: () => void
  onSave: (groupLeague: SeasonGroupLeague) => void
}

export function GroupLeagueCanvasModal({
  seasonTitle,
  teams,
  initialGroupLeague,
  initialGroupCount = 4,
  onClose,
  onSave,
}: Props) {
  const [groupCount, setGroupCount] = useState<number>(
    initialGroupLeague?.groupCount ?? initialGroupCount ?? 4
  )
  const [groups, setGroups] = useState<SeasonGroup[]>(() => {
    if (initialGroupLeague?.groups && initialGroupLeague.groups.length > 0) {
      return initialGroupLeague.groups
    }
    return generateEmptyGroupLeague(initialGroupCount).groups
  })

  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null)
  const [dragOverTarget, setDragOverTarget] = useState<{ groupId: string; position: number } | null>(null)
  const [isFullScreen, setIsFullScreen] = useState(false)

  // Map of placed teamId -> Group Name
  const placedTeamsMap = useMemo(() => {
    const map = new Map<number, string>()
    for (const group of groups) {
      for (const slot of group.slots) {
        if (slot.teamId) map.set(slot.teamId, group.name)
      }
    }
    return map
  }, [groups])

  const totalPlacedCount = placedTeamsMap.size

  const filteredTeams = useMemo(() => {
    return teams.filter((t) => {
      if (!searchTerm) return true
      return t.name.toLowerCase().includes(searchTerm.toLowerCase())
    })
  }, [teams, searchTerm])

  const handleGroupCountChange = (newCount: number) => {
    setGroupCount(newCount)
    const newEmpty = generateEmptyGroupLeague(newCount)
    // Preserve existing groups where possible
    const updatedGroups = newEmpty.groups.map((g, idx) => {
      const existing = groups[idx]
      if (existing) {
        return {
          ...g,
          slots: existing.slots,
        }
      }
      return g
    })
    setGroups(updatedGroups)
  }

  const handleAutoSeed = () => {
    const seeded = autoSeedGroupLeague(groupCount, teams, true)
    setGroups(seeded.groups)
  }

  const handleClearAll = () => {
    const cleared = clearGroupLeagueSlots(groupCount)
    setGroups(cleared.groups)
  }

  const handleDragStart = (e: DragEvent, team: Team) => {
    e.dataTransfer.setData('application/json', JSON.stringify(team))
    e.dataTransfer.effectAllowed = 'copyMove'
  }

  const handleDragOver = (e: DragEvent, groupId: string, position: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    if (dragOverTarget?.groupId !== groupId || dragOverTarget?.position !== position) {
      setDragOverTarget({ groupId, position })
    }
  }

  const handleDragLeave = (e: DragEvent, groupId: string, position: number) => {
    e.preventDefault()
    if (dragOverTarget?.groupId === groupId && dragOverTarget?.position === position) {
      setDragOverTarget(null)
    }
  }

  const handleDropOnGroupSlot = (e: DragEvent, groupId: string, position: number) => {
    e.preventDefault()
    setDragOverTarget(null)

    try {
      const dataStr = e.dataTransfer.getData('application/json')
      if (!dataStr) return
      const team: Team = JSON.parse(dataStr)
      placeTeamInGroupSlot(team, groupId, position)
    } catch {
      // Ignored
    }
  }

  const placeTeamInGroupSlot = (team: Team, targetGroupId: string, targetPosition: number) => {
    // 1. Remove team from any existing group first
    const cleanGroups: SeasonGroup[] = groups.map((g) => {
      const filteredSlots = g.slots.filter((s) => s.teamId !== team.id)
      return {
        ...g,
        slots: filteredSlots.map((s, idx) => ({ ...s, position: idx + 1 })),
      }
    })

    // 2. Add team to target group at targetPosition
    const targetGroup = cleanGroups.find((g) => g.id === targetGroupId)
    if (!targetGroup) return

    const newSlot: LeagueSlot = {
      position: targetPosition,
      teamId: team.id,
      teamName: team.name,
      teamColor: team.color,
      teamLogo: team.logoUrl,
      teamCountryCode: team.countryCode,
    }

    const targetIdx = targetPosition - 1
    if (targetIdx >= targetGroup.slots.length) {
      targetGroup.slots.push(newSlot)
    } else {
      targetGroup.slots.splice(targetIdx, 1, newSlot)
    }

    // Re-index target group slots
    targetGroup.slots = targetGroup.slots.map((s, idx) => ({
      ...s,
      position: idx + 1,
    }))

    setGroups([...cleanGroups])
    setSelectedTeamId(null)
  }

  const handleSlotClick = (groupId: string, position: number) => {
    if (selectedTeamId) {
      const selectedTeam = teams.find((t) => t.id === selectedTeamId)
      if (selectedTeam) {
        placeTeamInGroupSlot(selectedTeam, groupId, position)
      }
    }
  }

  const removeTeamFromGroup = (groupId: string, position: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const updated = groups.map((g) => {
      if (g.id !== groupId) return g
      const filteredSlots = g.slots.filter((s) => s.position !== position)
      return {
        ...g,
        slots: filteredSlots.map((s, idx) => ({ ...s, position: idx + 1 })),
      }
    })
    setGroups(updated)
  }

  const handleSave = () => {
    const data: SeasonGroupLeague = {
      groupCount: groups.length,
      groups,
    }
    onSave(data)
    onClose()
  }

  const groupCountOptions = [2, 3, 4, 5, 6, 8]

  return (
    <Modal
      title={`🗂️ ${seasonTitle || 'Grup Ligi'} - Çoklu Grup Tablosu (Group League Canvas)`}
      onClose={onClose}
      className={`bracket-canvas-modal-dialog ${isFullScreen ? 'is-fullscreen' : ''}`}
    >
      <div className="bracket-builder-shell">
        {/* TOP TOOLBAR */}
        <header className="bracket-builder-toolbar">
          <div className="toolbar-left">
            <span className="toolbar-label">Grup Sayısı:</span>
            <select
              className="league-count-select"
              value={groupCount}
              onChange={(e) => handleGroupCountChange(Number(e.target.value))}
            >
              {groupCountOptions.map((c) => (
                <option key={c} value={c}>
                  {c} Gruplu Format ({c === 2 ? 'Grup A, B' : c === 4 ? 'Grup A, B, C, D' : `${c} Grup`})
                </option>
              ))}
            </select>

            <div className="count-pill-btn active" style={{ marginLeft: 8 }}>
              Toplam: {totalPlacedCount} Takım Yerleşti
            </div>
          </div>

          <div className="toolbar-right">
            <button type="button" className="toolbar-btn" onClick={handleAutoSeed} title="Rastgele Kura ile Dağıt">
              <Dices size={16} /> Otomatik Kura / Gruplara Dağıt
            </button>
            <button type="button" className="toolbar-btn secondary" onClick={handleClearAll} title="Tüm Grupları Temizle">
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
              <Check size={16} /> Grupları Kaydet ({totalPlacedCount} Takım)
            </button>
          </div>
        </header>

        {/* WORKSPACE GRID: SIDEBAR + MULTI GROUP CANVAS */}
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
              <span>Toplam Yerleştirilen:</span>
              <strong>
                {totalPlacedCount} / {teams.length} Kulüp
              </strong>
            </div>

            <div className="draggable-teams-list">
              {filteredTeams.map((team) => {
                const assignedGroupName = placedTeamsMap.get(team.id)
                const isPlaced = Boolean(assignedGroupName)
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
                      <span className="placed-indicator-badge" title={`Yerleşti: ${assignedGroupName}`}>
                        {assignedGroupName?.replace('Grup ', '')}
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

          {/* MULTI GROUP LEAGUE CANVAS */}
          <main className="group-league-canvas-container">
            <div className="group-league-scroll-wrapper">
              <div className="group-league-grid">
                {groups.map((group) => {
                  const nextPlusOnePos = group.slots.length + 1
                  const isDragOverPlusOne =
                    dragOverTarget?.groupId === group.id &&
                    dragOverTarget?.position === nextPlusOnePos

                  return (
                    <div key={group.id} className="group-card-column">
                      {/* GROUP HEADER */}
                      <div className="group-card-header">
                        <div className="group-header-title">
                          <Trophy size={16} className="trophy-gold" />
                          <h4>{group.name}</h4>
                        </div>
                        <span className="group-team-badge">
                          {group.slots.length} Takım
                        </span>
                      </div>

                      {/* GROUP SLOTS */}
                      <div className="group-slots-list">
                        {/* PLACED TEAMS */}
                        {group.slots.map((slot) => {
                          const pos = slot.position
                          const isTopZone = pos <= 2
                          const country = slot.teamCountryCode
                            ? getCountry(slot.teamCountryCode)
                            : null
                          const isDragOver =
                            dragOverTarget?.groupId === group.id &&
                            dragOverTarget?.position === pos

                          return (
                            <div
                              key={pos}
                              className={`league-file-slot-row ${isTopZone ? 'top-zone' : ''} has-team ${
                                isDragOver ? 'drag-over-active' : ''
                              }`}
                              onDragOver={(e) => handleDragOver(e, group.id, pos)}
                              onDragLeave={(e) => handleDragLeave(e, group.id, pos)}
                              onDrop={(e) => handleDropOnGroupSlot(e, group.id, pos)}
                              onClick={() => handleSlotClick(group.id, pos)}
                            >
                              <div className="slot-rank-badge">
                                <span>{pos}</span>
                              </div>

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
                                <button
                                  type="button"
                                  className="btn-slot-remove"
                                  onClick={(e) => removeTeamFromGroup(group.id, pos, e)}
                                  title="Gruptan Çıkar"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            </div>
                          )
                        })}

                        {/* ALWAYS PRESENT +1 EMPTY SLOT AT THE END OF EACH GROUP */}
                        <div
                          className={`league-file-slot-row empty ${
                            isDragOverPlusOne ? 'drag-over-active' : ''
                          }`}
                          onDragOver={(e) => handleDragOver(e, group.id, nextPlusOnePos)}
                          onDragLeave={(e) => handleDragLeave(e, group.id, nextPlusOnePos)}
                          onDrop={(e) => handleDropOnGroupSlot(e, group.id, nextPlusOnePos)}
                          onClick={() => handleSlotClick(group.id, nextPlusOnePos)}
                        >
                          <div className="slot-rank-badge">
                            <span>{nextPlusOnePos}</span>
                          </div>
                          <div className="slot-empty-content">
                            <Plus size={15} className="empty-plus" />
                            <span>
                              {isDragOverPlusOne
                                ? `Bırak (#${nextPlusOnePos}. Sıra)`
                                : `+ Sıra #${nextPlusOnePos}`}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </main>
        </div>
      </div>
    </Modal>
  )
}

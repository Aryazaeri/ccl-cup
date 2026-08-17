import {
  Check,
  Dices,
  GripVertical,
  Maximize2,
  Minimize2,
  Plus,
  RotateCcw,
  Search,
  Shirt,
  Sparkles,
  Trash2,
  Trophy,
  UserCheck,
  UserMinus,
  Users,
  X,
} from 'lucide-react'
import { useMemo, useState, type DragEvent } from 'react'
import { getCountry } from '../lib/countries'
import type { Player, PlayerPosition, Team } from '../types'
import { Modal } from './Modal'
import { TeamMark } from './TeamMark'

type FormationType = '4-3-3' | '4-4-2' | '3-5-2' | '4-2-3-1' | '7v7' | '5v5'

type FormationSlotConfig = {
  id: string
  roleName: string
  position: PlayerPosition
  top: number // percentage from top (0-100)
  left: number // percentage from left (0-100)
}

const FORMATIONS: Record<FormationType, { name: string; slots: FormationSlotConfig[] }> = {
  '4-3-3': {
    name: '4-3-3 Attack',
    slots: [
      { id: 'gk', roleName: 'GK', position: 'goalkeeper', top: 86, left: 50 },
      { id: 'lb', roleName: 'LB', position: 'defender', top: 68, left: 16 },
      { id: 'cb1', roleName: 'CB', position: 'defender', top: 72, left: 38 },
      { id: 'cb2', roleName: 'CB', position: 'defender', top: 72, left: 62 },
      { id: 'rb', roleName: 'RB', position: 'defender', top: 68, left: 84 },
      { id: 'cm1', roleName: 'LCM', position: 'midfielder', top: 48, left: 26 },
      { id: 'cm2', roleName: 'CM', position: 'midfielder', top: 52, left: 50 },
      { id: 'cm3', roleName: 'RCM', position: 'midfielder', top: 48, left: 74 },
      { id: 'lw', roleName: 'LW', position: 'forward', top: 22, left: 20 },
      { id: 'st', roleName: 'ST', position: 'forward', top: 16, left: 50 },
      { id: 'rw', roleName: 'RW', position: 'forward', top: 22, left: 80 },
    ],
  },
  '4-4-2': {
    name: '4-4-2 Classic',
    slots: [
      { id: 'gk', roleName: 'GK', position: 'goalkeeper', top: 86, left: 50 },
      { id: 'lb', roleName: 'LB', position: 'defender', top: 68, left: 16 },
      { id: 'cb1', roleName: 'CB', position: 'defender', top: 72, left: 38 },
      { id: 'cb2', roleName: 'CB', position: 'defender', top: 72, left: 62 },
      { id: 'rb', roleName: 'RB', position: 'defender', top: 68, left: 84 },
      { id: 'lm', roleName: 'LM', position: 'midfielder', top: 45, left: 16 },
      { id: 'cm1', roleName: 'CM', position: 'midfielder', top: 48, left: 38 },
      { id: 'cm2', roleName: 'CM', position: 'midfielder', top: 48, left: 62 },
      { id: 'rm', roleName: 'RM', position: 'midfielder', top: 45, left: 84 },
      { id: 'st1', roleName: 'LS', position: 'forward', top: 18, left: 36 },
      { id: 'st2', roleName: 'RS', position: 'forward', top: 18, left: 64 },
    ],
  },
  '3-5-2': {
    name: '3-5-2 Dynamic',
    slots: [
      { id: 'gk', roleName: 'GK', position: 'goalkeeper', top: 86, left: 50 },
      { id: 'cb1', roleName: 'LCB', position: 'defender', top: 72, left: 26 },
      { id: 'cb2', roleName: 'CB', position: 'defender', top: 74, left: 50 },
      { id: 'cb3', roleName: 'RCB', position: 'defender', top: 72, left: 74 },
      { id: 'lwb', roleName: 'LWB', position: 'midfielder', top: 50, left: 12 },
      { id: 'dm', roleName: 'CDM', position: 'midfielder', top: 58, left: 50 },
      { id: 'cm1', roleName: 'CAM', position: 'midfielder', top: 38, left: 38 },
      { id: 'cm2', roleName: 'CAM', position: 'midfielder', top: 38, left: 62 },
      { id: 'rwb', roleName: 'RWB', position: 'midfielder', top: 50, left: 88 },
      { id: 'st1', roleName: 'LS', position: 'forward', top: 16, left: 36 },
      { id: 'st2', roleName: 'RS', position: 'forward', top: 16, left: 64 },
    ],
  },
  '4-2-3-1': {
    name: '4-2-3-1 Tactical',
    slots: [
      { id: 'gk', roleName: 'GK', position: 'goalkeeper', top: 86, left: 50 },
      { id: 'lb', roleName: 'LB', position: 'defender', top: 68, left: 16 },
      { id: 'cb1', roleName: 'CB', position: 'defender', top: 72, left: 38 },
      { id: 'cb2', roleName: 'CB', position: 'defender', top: 72, left: 62 },
      { id: 'rb', roleName: 'RB', position: 'defender', top: 68, left: 84 },
      { id: 'dm1', roleName: 'LDM', position: 'midfielder', top: 54, left: 36 },
      { id: 'dm2', roleName: 'RDM', position: 'midfielder', top: 54, left: 64 },
      { id: 'lam', roleName: 'LAM', position: 'midfielder', top: 36, left: 22 },
      { id: 'cam', roleName: 'CAM', position: 'midfielder', top: 34, left: 50 },
      { id: 'ram', roleName: 'RAM', position: 'midfielder', top: 36, left: 78 },
      { id: 'st', roleName: 'ST', position: 'forward', top: 15, left: 50 },
    ],
  },
  '7v7': {
    name: '7v7 Corporate Cup',
    slots: [
      { id: 'gk', roleName: 'GK', position: 'goalkeeper', top: 86, left: 50 },
      { id: 'df1', roleName: 'LCB', position: 'defender', top: 66, left: 28 },
      { id: 'df2', roleName: 'RCB', position: 'defender', top: 66, left: 72 },
      { id: 'mf1', roleName: 'LM', position: 'midfielder', top: 44, left: 22 },
      { id: 'mf2', roleName: 'CM', position: 'midfielder', top: 48, left: 50 },
      { id: 'mf3', roleName: 'RM', position: 'midfielder', top: 44, left: 78 },
      { id: 'fw', roleName: 'ST', position: 'forward', top: 18, left: 50 },
    ],
  },
  '5v5': {
    name: '5v5 Futsal / Arena',
    slots: [
      { id: 'gk', roleName: 'GK', position: 'goalkeeper', top: 86, left: 50 },
      { id: 'df', roleName: 'CB', position: 'defender', top: 64, left: 50 },
      { id: 'mf1', roleName: 'LM', position: 'midfielder', top: 42, left: 22 },
      { id: 'mf2', roleName: 'RM', position: 'midfielder', top: 42, left: 78 },
      { id: 'fw', roleName: 'ST', position: 'forward', top: 18, left: 50 },
    ],
  },
}

type Props = {
  team: Team
  allPlayers: Player[]
  teamPlayers: Player[]
  onClose: () => void
  onSaveSquad: (assignedPlayerIds: number[], unassignedPlayerIds: number[]) => Promise<void>
}

export function SquadCanvasModal({
  team,
  allPlayers,
  teamPlayers,
  onClose,
  onSaveSquad,
}: Props) {
  const [formation, setFormation] = useState<FormationType>('4-3-3')
  const [canvasView, setCanvasView] = useState<'pitch' | 'bench'>('pitch')
  const [searchTerm, setSearchTerm] = useState('')
  const [posFilter, setPosFilter] = useState<string>('All')
  const [isFullScreen, setIsFullScreen] = useState(false)
  const [selectedPoolPlayerId, setSelectedPoolPlayerId] = useState<number | null>(null)
  const [dragOverSlotId, setDragOverSlotId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // Map of slotId -> Player (Starting line-up on pitch)
  const [pitchLineup, setPitchLineup] = useState<Record<string, Player>>(() => {
    const initialMap: Record<string, Player> = {}
    const activeSlots = FORMATIONS[formation].slots
    const assignedIds = new Set<number>()

    // Try matching team players to formation positions
    activeSlots.forEach((slot) => {
      const match = teamPlayers.find(
        (p) => p.position === slot.position && !assignedIds.has(p.id)
      )
      if (match) {
        initialMap[slot.id] = match
        assignedIds.add(match.id)
      }
    })

    // Fill remaining empty slots with other team players if available
    activeSlots.forEach((slot) => {
      if (!initialMap[slot.id]) {
        const remaining = teamPlayers.find((p) => !assignedIds.has(p.id))
        if (remaining) {
          initialMap[slot.id] = remaining
          assignedIds.add(remaining.id)
        }
      }
    })

    return initialMap
  })

  // Bench players (team players not in starting lineup)
  const [benchPlayers, setBenchPlayers] = useState<Player[]>(() => {
    const startingIds = new Set(Object.values(pitchLineup).map((p) => p.id))
    return teamPlayers.filter((p) => !startingIds.has(p.id))
  })

  // All current team players (pitch + bench)
  const currentSquadPlayers = useMemo(() => {
    const map = new Map<number, Player>()
    Object.values(pitchLineup).forEach((p) => map.set(p.id, p))
    benchPlayers.forEach((p) => map.set(p.id, p))
    return Array.from(map.values())
  }, [pitchLineup, benchPlayers])

  const currentSquadIds = useMemo(() => {
    return new Set(currentSquadPlayers.map((p) => p.id))
  }, [currentSquadPlayers])

  // Filtered pool players (players in platform not currently on this squad)
  const filteredPool = useMemo(() => {
    return allPlayers.filter((p) => {
      if (currentSquadIds.has(p.id)) return false
      if (posFilter !== 'All' && p.position.toLowerCase() !== posFilter.toLowerCase()) return false
      if (!searchTerm.trim()) return true
      const q = searchTerm.toLowerCase()
      return (
        p.fullName.toLowerCase().includes(q) ||
        p.teamName.toLowerCase().includes(q) ||
        p.position.toLowerCase().includes(q)
      )
    })
  }, [allPlayers, currentSquadIds, posFilter, searchTerm])

  const country = getCountry(team.countryCode)

  // Drag and Drop handlers
  const handleDragStart = (e: DragEvent, player: Player) => {
    e.dataTransfer.setData('application/json', JSON.stringify(player))
    e.dataTransfer.effectAllowed = 'copyMove'
  }

  const handleDragOverSlot = (e: DragEvent, slotId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    if (dragOverSlotId !== slotId) setDragOverSlotId(slotId)
  }

  const handleDragLeaveSlot = (e: DragEvent, slotId: string) => {
    e.preventDefault()
    if (dragOverSlotId === slotId) setDragOverSlotId(null)
  }

  const handleDropOnSlot = (e: DragEvent, slotId: string) => {
    e.preventDefault()
    setDragOverSlotId(null)
    try {
      const dataStr = e.dataTransfer.getData('application/json')
      if (!dataStr) return
      const player: Player = JSON.parse(dataStr)
      assignPlayerToSlot(player, slotId)
    } catch (err) {
      console.error(err)
    }
  }

  const assignPlayerToSlot = (player: Player, slotId: string) => {
    setPitchLineup((prev) => {
      const updated = { ...prev }
      // If player was already in another slot, remove them from that slot
      Object.keys(updated).forEach((key) => {
        if (updated[key]?.id === player.id) {
          delete updated[key]
        }
      })
      updated[slotId] = player
      return updated
    })

    // If player was on bench, remove from bench
    setBenchPlayers((prev) => prev.filter((p) => p.id !== player.id))
    setSelectedPoolPlayerId(null)
  }

  const handleAssignSelectedToSlot = (slotId: string) => {
    if (!selectedPoolPlayerId) return
    const target = allPlayers.find((p) => p.id === selectedPoolPlayerId)
    if (target) {
      assignPlayerToSlot(target, slotId)
    }
  }

  const handleRemoveFromSlot = (slotId: string) => {
    const player = pitchLineup[slotId]
    if (!player) return
    setPitchLineup((prev) => {
      const updated = { ...prev }
      delete updated[slotId]
      return updated
    })
    // Move to bench
    setBenchPlayers((prev) => {
      if (prev.some((p) => p.id === player.id)) return prev
      return [...prev, player]
    })
  }

  const handleDropFromSquadCompletely = (playerId: number) => {
    setPitchLineup((prev) => {
      const updated = { ...prev }
      Object.keys(updated).forEach((key) => {
        if (updated[key]?.id === playerId) delete updated[key]
      })
      return updated
    })
    setBenchPlayers((prev) => prev.filter((p) => p.id !== playerId))
  }

  const handleAddDirectToBench = (player: Player) => {
    setBenchPlayers((prev) => {
      if (prev.some((p) => p.id === player.id)) return prev
      return [...prev, player]
    })
    setSelectedPoolPlayerId(null)
  }

  const handleAutoFillFromPool = () => {
    const activeSlots = FORMATIONS[formation].slots
    const newPitch = { ...pitchLineup }
    const usedIds = new Set(Object.values(newPitch).map((p) => p.id))

    activeSlots.forEach((slot) => {
      if (!newPitch[slot.id]) {
        // Try finding matching position in pool
        const match = filteredPool.find(
          (p) => p.position === slot.position && !usedIds.has(p.id)
        )
        if (match) {
          newPitch[slot.id] = match
          usedIds.add(match.id)
        }
      }
    })

    // If still empty slots, grab any pool players
    activeSlots.forEach((slot) => {
      if (!newPitch[slot.id]) {
        const match = filteredPool.find((p) => !usedIds.has(p.id))
        if (match) {
          newPitch[slot.id] = match
          usedIds.add(match.id)
        }
      }
    })

    setPitchLineup(newPitch)
  }

  const handleClearSquad = () => {
    setPitchLineup({})
    setBenchPlayers([])
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveError('')
    try {
      const newSquadIds = currentSquadPlayers.map((p) => p.id)
      const originalTeamPlayerIds = teamPlayers.map((p) => p.id)

      // Players to unassign (were in team before, but not in current squad)
      const unassignedIds = originalTeamPlayerIds.filter((id) => !newSquadIds.includes(id))

      await onSaveSquad(newSquadIds, unassignedIds)
      onClose()
    } catch (err: unknown) {
      console.error('Save squad error:', err)
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Failed to save squad roster.'
      setSaveError(msg)
    } finally {
      setSaving(false)
    }
  }

  const activeSlots = FORMATIONS[formation].slots
  const startingCount = Object.keys(pitchLineup).length
  const totalCount = currentSquadPlayers.length

  return (
    <Modal
      title={`🏟️ ${team.name} — Görsel Kadro & Saha Diziliş Tuvali`}
      onClose={onClose}
      className={`squad-canvas-modal-dialog ${isFullScreen ? 'is-fullscreen' : ''}`}
    >
      <div className="squad-canvas-modal-container">
        {/* TOP CONTROLS BAR */}
        <div className="squad-canvas-top-bar">
          <div className="team-meta-badge">
            <TeamMark
              name={team.name}
              color={team.color}
              secondaryColor={team.secondaryColor}
              logoUrl={team.logoUrl}
              size="md"
            />
            <div>
              <h3>{team.name}</h3>
              <span>
                {country.flag} {country.name} · {team.tournamentFormat ?? 'Champions Cup'}
              </span>
            </div>
          </div>

          <div className="canvas-action-controls">
            <label className="formation-select-wrap">
              <span>Formation:</span>
              <select
                value={formation}
                onChange={(e) => setFormation(e.target.value as FormationType)}
              >
                {Object.entries(FORMATIONS).map(([key, f]) => (
                  <option key={key} value={key}>
                    📐 {f.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="view-mode-tabs">
              <button
                type="button"
                className={`view-tab ${canvasView === 'pitch' ? 'active' : ''}`}
                onClick={() => setCanvasView('pitch')}
              >
                🏟️ Pitch View ({startingCount}/{activeSlots.length})
              </button>
              <button
                type="button"
                className={`view-tab ${canvasView === 'bench' ? 'active' : ''}`}
                onClick={() => setCanvasView('bench')}
              >
                🪑 Bench & Roster ({benchPlayers.length})
              </button>
            </div>

            <button
              type="button"
              className="quick-canvas-btn primary"
              onClick={handleAutoFillFromPool}
              title="Auto-fill empty formation slots with best available players from pool"
            >
              <Sparkles size={14} /> Auto-Fill
            </button>

            <button
              type="button"
              className="quick-canvas-btn danger"
              onClick={handleClearSquad}
              title="Release all players back to pool"
            >
              <RotateCcw size={14} /> Clear
            </button>

            <button
              type="button"
              className="quick-canvas-btn icon-only"
              onClick={() => setIsFullScreen(!isFullScreen)}
              title={isFullScreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>
        </div>

        {/* MAIN SPLIT WORKSPACE */}
        <div className="squad-canvas-body">
          {/* LEFT: PLAYER POOL SIDEBAR */}
          <aside className="squad-pool-sidebar">
            <div className="pool-header">
              <div className="pool-title">
                <Users size={16} />
                <h4>Player Pool ({filteredPool.length})</h4>
              </div>
              <span className="pool-subtext">Drag or click player, then pick slot</span>
            </div>

            <div className="pool-search-box">
              <Search size={14} />
              <input
                type="text"
                placeholder="Search player, club, pos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button type="button" onClick={() => setSearchTerm('')} className="clear-search-btn">
                  <X size={12} />
                </button>
              )}
            </div>

            {/* POSITION FILTER CHIPS */}
            <div className="pool-pos-filters">
              {['All', 'Goalkeeper', 'Defender', 'Midfielder', 'Forward'].map((pos) => (
                <button
                  key={pos}
                  type="button"
                  className={`pos-chip ${posFilter === pos ? 'active' : ''}`}
                  onClick={() => setPosFilter(pos)}
                >
                  {pos === 'All' ? 'All' : pos.slice(0, 3).toUpperCase()}
                </button>
              ))}
            </div>

            {/* POOL PLAYERS LIST */}
            <div className="pool-player-cards-list">
              {filteredPool.length === 0 ? (
                <div className="pool-empty-state">
                  <UserCheck size={28} />
                  <p>No available players in pool matching search.</p>
                </div>
              ) : (
                filteredPool.map((p) => {
                  const isSelected = selectedPoolPlayerId === p.id
                  return (
                    <div
                      key={p.id}
                      className={`pool-player-card ${isSelected ? 'selected' : ''}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, p)}
                      onClick={() => setSelectedPoolPlayerId(isSelected ? null : p.id)}
                    >
                      <div className="pool-card-drag-handle" title="Drag to pitch">
                        <GripVertical size={14} />
                      </div>
                      <span className="pool-card-shirt">#{p.shirtNumber ?? '-'}</span>
                      <div className="pool-card-info">
                        <strong>{p.fullName}</strong>
                        <div className="pool-card-meta">
                          <span className={`mini-pos-badge ${p.position}`}>
                            {p.position.slice(0, 3).toUpperCase()}
                          </span>
                          <span className="pool-team-tag">
                            {p.teamName && p.teamName !== 'Free Agent' ? `from ${p.teamName}` : 'Free Agent'}
                          </span>
                        </div>
                      </div>
                      <div className="pool-card-actions">
                        <button
                          type="button"
                          className="quick-bench-btn"
                          title="Add directly to substitutes bench"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleAddDirectToBench(p)
                          }}
                        >
                          <Plus size={14} /> Bench
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </aside>

          {/* RIGHT: TACTICAL PITCH OR BENCH CANVAS */}
          <main className="squad-pitch-workspace">
            {canvasView === 'pitch' ? (
              <div className="tactical-pitch-wrapper">
                {/* FOOTBALL STADIUM PITCH */}
                <div className="tactical-pitch-field">
                  {/* FIELD LINE MARKINGS */}
                  <div className="pitch-center-circle" />
                  <div className="pitch-halfway-line" />
                  <div className="pitch-penalty-area top" />
                  <div className="pitch-goal-area top" />
                  <div className="pitch-penalty-area bottom" />
                  <div className="pitch-goal-area bottom" />

                  {/* FORMATION SLOTS */}
                  {activeSlots.map((slot) => {
                    const assignedPlayer = pitchLineup[slot.id]
                    const isDragOver = dragOverSlotId === slot.id

                    return (
                      <div
                        key={slot.id}
                        className={`pitch-slot-node ${assignedPlayer ? 'filled' : 'empty'} ${
                          isDragOver ? 'drag-over' : ''
                        }`}
                        style={{
                          top: `${slot.top}%`,
                          left: `${slot.left}%`,
                        }}
                        onDragOver={(e) => handleDragOverSlot(e, slot.id)}
                        onDragLeave={(e) => handleDragLeaveSlot(e, slot.id)}
                        onDrop={(e) => handleDropOnSlot(e, slot.id)}
                        onClick={() => {
                          if (selectedPoolPlayerId) {
                            handleAssignSelectedToSlot(slot.id)
                          }
                        }}
                      >
                        {assignedPlayer ? (
                          <div className="assigned-pitch-card">
                            <div className="jersey-avatar" style={{ background: team.color }}>
                              <span>{assignedPlayer.shirtNumber ?? slot.roleName}</span>
                            </div>
                            <span className="player-pitch-name">{assignedPlayer.fullName}</span>
                            <span className="player-pitch-role">{slot.roleName}</span>
                            <button
                              type="button"
                              className="remove-from-pitch-btn"
                              title="Move to bench"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleRemoveFromSlot(slot.id)
                              }}
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <div className="empty-pitch-slot">
                            <span className="slot-role-target">{slot.roleName}</span>
                            <span className="slot-hint">
                              {selectedPoolPlayerId ? 'Tap to assign' : '+ Drop'}
                            </span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              /* BENCH & SQUAD LIST VIEW */
              <div className="squad-bench-workspace">
                <div className="bench-section-header">
                  <h4>Starting Lineup ({startingCount} Players)</h4>
                </div>
                <div className="bench-cards-grid">
                  {Object.entries(pitchLineup).map(([slotId, player]) => (
                    <div key={slotId} className="bench-player-row starting">
                      <span className="shirt-badge">{player.shirtNumber ?? '-'}</span>
                      <div className="bench-player-meta">
                        <strong>{player.fullName}</strong>
                        <span>
                          Role: {FORMATIONS[formation].slots.find((s) => s.id === slotId)?.roleName} ·{' '}
                          {player.position}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="bench-action-btn"
                        onClick={() => handleRemoveFromSlot(slotId)}
                        title="Move to bench"
                      >
                        Move to Bench
                      </button>
                    </div>
                  ))}
                  {startingCount === 0 && (
                    <p className="empty-bench-text">No starting players assigned yet.</p>
                  )}
                </div>

                <div className="bench-section-header" style={{ marginTop: '24px' }}>
                  <h4>Substitutes & Reserves ({benchPlayers.length} Players)</h4>
                </div>
                <div className="bench-cards-grid">
                  {benchPlayers.map((player) => (
                    <div key={player.id} className="bench-player-row">
                      <span className="shirt-badge">{player.shirtNumber ?? '-'}</span>
                      <div className="bench-player-meta">
                        <strong>{player.fullName}</strong>
                        <span>{player.position.toUpperCase()}</span>
                      </div>
                      <div className="row-actions-group">
                        <button
                          type="button"
                          className="bench-action-btn danger"
                          onClick={() => handleDropFromSquadCompletely(player.id)}
                          title="Release back to pool"
                        >
                          <UserMinus size={14} /> Release to Pool
                        </button>
                      </div>
                    </div>
                  ))}
                  {benchPlayers.length === 0 && (
                    <p className="empty-bench-text">No substitute players on the bench.</p>
                  )}
                </div>
              </div>
            )}
          </main>
        </div>

        {/* BOTTOM STATUS & SAVE BAR */}
        <div className="squad-canvas-footer">
          <div className="squad-status-counter">
            {totalCount >= 5 ? (
              <span className="status-badge valid">
                <Check size={14} /> Squad Ready: {totalCount} Players ({startingCount} Starting,{' '}
                {benchPlayers.length} Bench)
              </span>
            ) : (
              <span className="status-badge warning">
                ⚠️ Need at least 5 players (Currently: {totalCount})
              </span>
            )}
          </div>

          {saveError && <span className="canvas-error-text">{saveError}</span>}

          <div className="canvas-footer-actions">
            <button type="button" className="button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="button"
              className="button button-admin"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving Squad…' : '💾 Save Squad to Club'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

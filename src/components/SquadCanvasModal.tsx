import {
  Check,
  GripVertical,
  Maximize2,
  Minimize2,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  UserCheck,
  UserMinus,
  Users,
  X,
} from 'lucide-react'
import { useMemo, useState, type DragEvent } from 'react'
import { getCountry } from '../lib/countries'
import type { Player, Team } from '../types'
import { FORMATIONS, filledSlots, reseat, resolveLineup, type FormationType, type Lineup } from '../lib/formations'
import { Modal } from './Modal'
import { TeamMark } from './TeamMark'


type Props = {
  team: Team
  teamPlayers: Player[]
  onClose: () => void
  /** Saves squad membership changes, then the lineup (formation, starters by slot, bench). */
  onSaveSquad: (assignedPlayerIds: number[], unassignedPlayerIds: number[], lineup: Lineup) => Promise<void>
}

export function SquadCanvasModal({
  team,
  teamPlayers,
  onClose,
  onSaveSquad,
}: Props) {
  // Opens on the lineup saved for this club entry, if any.
  const [saved] = useState(() => resolveLineup(team.lineup?.formation === '8v8' ? team.lineup : undefined, teamPlayers))
  const [formation, setFormation] = useState<FormationType>('8v8')
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
    if (saved) return saved.starters
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
    if (saved) return saved.bench
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

  // Available players: this club's own registered squad members who are not
  // already placed on the pitch or the bench.
  //
  // Scoped to `teamPlayers`, not the global roster — the canvas arranges a
  // club's existing squad, it is not a transfer market. Signing a player from
  // another club (or a free agent) happens in the Players module, and they
  // appear here once they belong to this team.
  const filteredPool = useMemo(() => {
    return teamPlayers.filter((p) => {
      if (currentSquadIds.has(p.id)) return false
      if (posFilter !== 'All' && p.position.toLowerCase() !== posFilter.toLowerCase()) return false
      if (!searchTerm.trim()) return true
      const q = searchTerm.toLowerCase()
      return p.fullName.toLowerCase().includes(q) || p.position.toLowerCase().includes(q)
    })
  }, [teamPlayers, currentSquadIds, posFilter, searchTerm])

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
    const target = teamPlayers.find((p) => p.id === selectedPoolPlayerId)
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

  // Switching formation re-seats the starters into the new slots; anyone without a slot goes to the bench.
  const changeFormation = (next: FormationType) => {
    const { starters, overflow } = reseat(next, pitchLineup, (player) => player.position)
    setFormation(next)
    setPitchLineup(starters)
    if (overflow.length > 0) setBenchPlayers((bench) => [...bench, ...overflow.filter((p) => !bench.some((b) => b.id === p.id))])
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

      const lineup: Lineup = {
        formation,
        starters: Object.fromEntries(
          FORMATIONS[formation].slots.filter((slot) => pitchLineup[slot.id]).map((slot) => [slot.id, pitchLineup[slot.id].id]),
        ),
        bench: benchPlayers.map((p) => p.id),
      }
      await onSaveSquad(newSquadIds, unassignedIds, lineup)
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
  // Only this formation's slots count; a starter left over from another formation would inflate it.
  const startingCount = filledSlots(formation, pitchLineup)
  const totalCount = currentSquadPlayers.length

  return (
    <Modal
      title={`🏟️ ${team.name} — Squad & formation`}
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
                onChange={(e) => changeFormation(e.target.value as FormationType)}
              >
                {Object.entries(FORMATIONS).filter(([, f]) => f.slots.length === 8).map(([key, f]) => (
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
              aria-label="Auto-fill formation from player pool"
            >
              <Sparkles size={14} aria-hidden="true" /> Auto-Fill
            </button>

            <button
              type="button"
              className="quick-canvas-btn danger"
              onClick={handleClearSquad}
              title="Release all players back to pool"
              aria-label="Clear squad and return players to pool"
            >
              <RotateCcw size={14} aria-hidden="true" /> Clear
            </button>

            <button
              type="button"
              className="quick-canvas-btn icon-only"
              onClick={() => setIsFullScreen(!isFullScreen)}
              title={isFullScreen ? 'Exit Fullscreen' : 'Fullscreen'}
              aria-label={isFullScreen ? 'Exit fullscreen mode' : 'Enter fullscreen mode'}
            >
              {isFullScreen ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
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
              <Search size={14} aria-hidden="true" />
              <input
                type="text"
                placeholder="Search squad by name or position…"
                aria-label="Search squad by name or position"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="clear-search-btn"
                  aria-label="Clear search text"
                >
                  <X size={12} aria-hidden="true" />
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
                            {p.isCaptain ? 'Captain' : `#${p.shirtNumber ?? '—'} · ${p.position}`}
                          </span>
                        </div>
                      </div>
                      <div className="pool-card-actions">
                        <button
                          type="button"
                          className="quick-bench-btn"
                          title="Add directly to substitutes bench"
                          aria-label={`Add ${p.fullName} to bench`}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleAddDirectToBench(p)
                          }}
                        >
                          <Plus size={14} aria-hidden="true" /> Bench
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
                  <div className="pitch-center-circle" aria-hidden="true" />
                  <div className="pitch-halfway-line" aria-hidden="true" />
                  <div className="pitch-penalty-area top" aria-hidden="true" />
                  <div className="pitch-goal-area top" aria-hidden="true" />
                  <div className="pitch-penalty-area bottom" aria-hidden="true" />
                  <div className="pitch-goal-area bottom" aria-hidden="true" />

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
                              aria-label={`Remove ${assignedPlayer.fullName} from position ${slot.roleName}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleRemoveFromSlot(slot.id)
                              }}
                            >
                              <X size={12} aria-hidden="true" />
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

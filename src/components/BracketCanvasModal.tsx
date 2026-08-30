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
import {
  autoSeedBracket,
  clearBracketSlots,
  generateEmptyBracket,
  recomputeProgression,
  setMatchWinner,
} from '../lib/bracketUtils'
import type { BracketSlot, Team, TournamentBracket } from '../types'
import { Modal } from './Modal'
import { TeamMark } from './TeamMark'

type Props = {
  seasonTitle: string
  teams: Team[]
  initialBracket?: TournamentBracket
  onClose: () => void
  onSave: (bracket: TournamentBracket) => void
}

export function BracketCanvasModal({
  seasonTitle,
  teams,
  initialBracket,
  onClose,
  onSave,
}: Props) {
  const [teamCount, setTeamCount] = useState<number>(initialBracket?.teamCount ?? 8)
  const [bracket, setBracket] = useState<TournamentBracket>(
    initialBracket && initialBracket.rounds.length > 0
      ? initialBracket
      : generateEmptyBracket(initialBracket?.teamCount ?? 8)
  )
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null)
  const [dragOverSlotId, setDragOverSlotId] = useState<string | null>(null)
  const [isFullScreen, setIsFullScreen] = useState(false)

  // Track placed team IDs across all slots
  const placedTeamIds = useMemo(() => {
    const ids = new Set<number>()
    for (const round of bracket.rounds) {
      for (const match of round.matches) {
        if (match.slot1.teamId) ids.add(match.slot1.teamId)
        if (match.slot2.teamId) ids.add(match.slot2.teamId)
      }
    }
    if (bracket.championSlot?.teamId) ids.add(bracket.championSlot.teamId)
    return ids
  }, [bracket])

  // Filtered available teams for the sidebar
  const filteredTeams = useMemo(() => {
    return teams.filter((t) => {
      if (!searchTerm) return true
      return t.name.toLowerCase().includes(searchTerm.toLowerCase())
    })
  }, [teams, searchTerm])

  const handleTeamCountChange = (count: number) => {
    setTeamCount(count)
    const newBracket = generateEmptyBracket(count)
    setBracket(newBracket)
  }

  const handleAutoSeed = () => {
    const seeded = autoSeedBracket(bracket, teams, true)
    setBracket(seeded)
  }

  const handleClearAll = () => {
    setBracket(clearBracketSlots(bracket))
  }

  // Handle Drag from Team Sidebar or another slot
  const handleDragStart = (e: DragEvent, team: Team) => {
    e.dataTransfer.setData('application/json', JSON.stringify(team))
    e.dataTransfer.effectAllowed = 'copyMove'
  }

  const handleDragOver = (e: DragEvent, slotId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    if (dragOverSlotId !== slotId) setDragOverSlotId(slotId)
  }

  const handleDragLeave = (e: DragEvent, slotId: string) => {
    e.preventDefault()
    if (dragOverSlotId === slotId) setDragOverSlotId(null)
  }

  const handleDropOnSlot = (e: DragEvent, roundIdx: number, matchIdx: number, slotKey: 'slot1' | 'slot2') => {
    e.preventDefault()
    setDragOverSlotId(null)

    try {
      const dataStr = e.dataTransfer.getData('application/json')
      if (!dataStr) return
      const team: Team = JSON.parse(dataStr)
      placeTeamInSlot(team, roundIdx, matchIdx, slotKey)
    } catch {
      // Ignored
    }
  }

  const placeTeamInSlot = (team: Team, roundIdx: number, matchIdx: number, slotKey: 'slot1' | 'slot2') => {
    const updated: TournamentBracket = JSON.parse(JSON.stringify(bracket))
    const match = updated.rounds[roundIdx]?.matches[matchIdx]
    if (!match) return

    match[slotKey] = {
      slotId: match[slotKey].slotId,
      teamId: team.id,
      teamName: team.name,
      teamColor: team.color,
      teamLogo: team.logoUrl,
      teamCountryCode: team.countryCode,
    }

    // Re-seeding a slot invalidates any result recorded for that match, and
    // everything that followed from it.
    setBracket(recomputeProgression(updated))
    setSelectedTeamId(null)
  }

  const handleSlotClick = (roundIdx: number, matchIdx: number, slotKey: 'slot1' | 'slot2') => {
    if (selectedTeamId) {
      const selectedTeam = teams.find((t) => t.id === selectedTeamId)
      if (selectedTeam) {
        placeTeamInSlot(selectedTeam, roundIdx, matchIdx, slotKey)
      }
    }
  }

  const removeTeamFromSlot = (roundIdx: number, matchIdx: number, slotKey: 'slot1' | 'slot2', e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const updated: TournamentBracket = JSON.parse(JSON.stringify(bracket))
    const match = updated.rounds[roundIdx]?.matches[matchIdx]
    if (!match) return

    match[slotKey] = {
      slotId: match[slotKey].slotId,
      teamId: null,
    }
    setBracket(recomputeProgression(updated))
  }

  const handleSave = () => {
    onSave(bracket)
    onClose()
  }

  return (
    <Modal
      title={`🏆 ${seasonTitle || 'Tournament'} - Eleme Ağacı (Bracket Canvas)`}
      onClose={onClose}
      className={`bracket-canvas-modal-dialog ${isFullScreen ? 'is-fullscreen' : ''}`}
    >
      <div className="bracket-builder-shell">
        {/* TOP TOOLBAR */}
        <header className="bracket-builder-toolbar">
          <div className="toolbar-left">
            <span className="toolbar-label">Eleme Formatı:</span>
            <div className="team-count-pills">
              {[4, 8, 16].map((count) => (
                <button
                  key={count}
                  type="button"
                  className={`count-pill-btn ${teamCount === count ? 'active' : ''}`}
                  onClick={() => handleTeamCountChange(count)}
                >
                  {count} Takım ({count === 4 ? 'Yarı Final' : count === 8 ? 'Çeyrek Final' : 'Son 16'})
                </button>
              ))}
            </div>
          </div>

          <div className="toolbar-right">
            <button type="button" className="toolbar-btn" onClick={handleAutoSeed} title="Rastgele Eşleştir">
              <Dices size={16} /> Otomatik Kura / Doldur
            </button>
            <button type="button" className="toolbar-btn secondary" onClick={handleClearAll} title="Ağacı Temizle">
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
              <Check size={16} /> Ağacı Kaydet
            </button>
          </div>
        </header>

        {/* MAIN BUILDER WORKSPACE: SIDEBAR + BRACKET CANVAS */}
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
              <span>Yerleştirilen:</span>
              <strong>
                {placedTeamIds.size} / {teamCount} Takım
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
                      <span className="placed-indicator-badge" title="Ağaçta Yer Aldı">
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

          {/* BRACKET TREE CANVAS */}
          <main className="bracket-tree-canvas-container">
            <div className="bracket-tree-scroll-wrapper">
              <div className="bracket-rounds-flex">
                {bracket.rounds.map((round, rIdx) => (
                  <div key={round.roundIndex} className={`bracket-round-column round-${rIdx}`}>
                    <div className="round-header-banner">
                      <h4>{round.roundName}</h4>
                      <span>{round.matches.length} Eşleşme</span>
                    </div>

                    <div className="round-matches-stack">
                      {round.matches.map((match, mIdx) => (
                        <div key={match.matchId} className="bracket-matchup-node">
                          <div className="matchup-header">
                            <span>{match.label}</span>
                            {match.winnerSlotId ? <span className="matchup-decided">Decided</span> : null}
                          </div>

                          {/* SLOT 1 */}
                          <BracketSlotView
                            slot={match.slot1}
                            slotLabel="Takım 1"
                            isDragOver={dragOverSlotId === match.slot1.slotId}
                            onDragOver={(e) => handleDragOver(e, match.slot1.slotId)}
                            onDragLeave={(e) => handleDragLeave(e, match.slot1.slotId)}
                            onDrop={(e) => handleDropOnSlot(e, rIdx, mIdx, 'slot1')}
                            onClick={() => handleSlotClick(rIdx, mIdx, 'slot1')}
                            onRemove={(e) => removeTeamFromSlot(rIdx, mIdx, 'slot1', e)}
                          />

                          <div className="matchup-vs-divider">VS</div>

                          {/* SLOT 2 */}
                          <BracketSlotView
                            slot={match.slot2}
                            slotLabel="Takım 2"
                            isDragOver={dragOverSlotId === match.slot2.slotId}
                            onDragOver={(e) => handleDragOver(e, match.slot2.slotId)}
                            onDragLeave={(e) => handleDragLeave(e, match.slot2.slotId)}
                            onDrop={(e) => handleDropOnSlot(e, rIdx, mIdx, 'slot2')}
                            onClick={() => handleSlotClick(rIdx, mIdx, 'slot2')}
                            onRemove={(e) => removeTeamFromSlot(rIdx, mIdx, 'slot2', e)}
                          />

                          {/* Winner picker. Only offered once both sides are
                              filled — a tie cannot be resolved against a bye. */}
                          {match.slot1.teamId && match.slot2.teamId ? (
                            <div className="matchup-winner-picker">
                              <span>Winner</span>
                              <button
                                type="button"
                                className={match.winnerSlotId === match.slot1.slotId ? 'is-winner' : ''}
                                onClick={() => setBracket(setMatchWinner(bracket, match.matchId, match.slot1.slotId))}
                                title="Advance this club"
                              >
                                {match.slot1.teamName}
                              </button>
                              <button
                                type="button"
                                className={match.winnerSlotId === match.slot2.slotId ? 'is-winner' : ''}
                                onClick={() => setBracket(setMatchWinner(bracket, match.matchId, match.slot2.slotId))}
                                title="Advance this club"
                              >
                                {match.slot2.teamName}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {/* CHAMPION PODIUM */}
                <div className="bracket-round-column champion-column">
                  <div className="round-header-banner champion-header">
                    <h4>🏆 Şampiyon</h4>
                    <span>Final Kazananı</span>
                  </div>
                  <div className="champion-podium-box">
                    <Trophy size={48} className="trophy-gold" />
                    <div className="champion-slot-container">
                      <div className="champion-slot-target">
                        <strong>Final Şampiyonu</strong>
                        <span>Turnuva Kupası</span>
                      </div>
                    </div>
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

function BracketSlotView({
  slot,
  slotLabel,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
  onRemove,
}: {
  slot: BracketSlot
  slotLabel: string
  isDragOver: boolean
  onDragOver: (e: DragEvent) => void
  onDragLeave: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
  onClick: () => void
  onRemove: (e: React.MouseEvent) => void
}) {
  const country = slot.teamCountryCode ? getCountry(slot.teamCountryCode) : null

  if (slot.teamId && slot.teamName) {
    return (
      <div
        className="bracket-team-slot filled"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={onClick}
      >
        <div className="slot-color-bar" style={{ background: slot.teamColor || '#63e35b' }} />
        <TeamMark name={slot.teamName} color={slot.teamColor} logoUrl={slot.teamLogo} size="sm" />
        <div className="slot-team-info">
          <strong>{slot.teamName}</strong>
          {country && <small>{country.flag} {country.name}</small>}
        </div>
        <button
          type="button"
          className="btn-slot-remove"
          onClick={onRemove}
          title="Takımı Çıkar"
        >
          <X size={13} />
        </button>
      </div>
    )
  }

  return (
    <div
      className={`bracket-team-slot empty ${isDragOver ? 'drag-target-active' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onClick}
    >
      <Plus size={14} className="empty-plus-icon" />
      <span>{isDragOver ? 'Buraya Bırak' : `+ ${slotLabel}`}</span>
    </div>
  )
}

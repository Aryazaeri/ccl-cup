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
import {
  autoSeedBracket,
  clearBracketSlots,
  generateEmptyBracket,
  recomputeProgression,
  setMatchWinner,
} from '../lib/bracketUtils'
import type { BracketSlot, Match, Team, TournamentBracket } from '../types'
import { bracketWithResults, isByeTie } from '../lib/qualificationUtils'
import { Modal } from './Modal'
import { TeamMark } from './TeamMark'

type Props = {
  seasonTitle: string
  teams: Team[]
  initialBracket?: TournamentBracket
  matches?: Match[]
  onClose: () => void
  onSave: (bracket: TournamentBracket) => void | Promise<void>
}

export function BracketCanvasModal({
  seasonTitle,
  teams: allTeams,
  initialBracket,
  matches = [],
  onClose,
  onSave,
}: Props) {
  const { tr } = useAdminLanguage()
  const [teamCount, setTeamCount] = useState<number>(initialBracket?.teamCount ?? 8)
  const [storedBracket, setBracket] = useState<TournamentBracket>(
    initialBracket && initialBracket.rounds.length > 0
      ? initialBracket
      : generateEmptyBracket(initialBracket?.teamCount ?? 8)
  )
  const bracket = useMemo(() => bracketWithResults(storedBracket, matches), [storedBracket, matches])
  const qualifiedIds = useMemo(() => new Set(initialBracket?.rounds[0]?.matches.flatMap((m) => [m.slot1.teamId, m.slot2.teamId]).filter((id): id is number => id != null)), [initialBracket])
  const teams = bracket.qualification ? allTeams.filter((t) => qualifiedIds.has(t.id)) : allTeams
  const lockedSeeding = Boolean(bracket.qualification && matches.some((m) => !/^(group|grup)/i.test(m.stage)))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const savingRef = useRef(false)
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
    if (lockedSeeding || roundIdx !== 0) return
    const updated: TournamentBracket = JSON.parse(JSON.stringify(bracket))
    const match = updated.rounds[roundIdx]?.matches[matchIdx]
    if (!match) return

    for (const tie of updated.rounds[0].matches) for (const key of ['slot1', 'slot2'] as const) {
      if (tie[key].teamId === team.id) tie[key] = { slotId: tie[key].slotId }
    }

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
    if (lockedSeeding || roundIdx !== 0) return
    const updated: TournamentBracket = JSON.parse(JSON.stringify(bracket))
    const match = updated.rounds[roundIdx]?.matches[matchIdx]
    if (!match) return

    match[slotKey] = {
      slotId: match[slotKey].slotId,
      teamId: null,
    }
    setBracket(recomputeProgression(updated))
  }

  const handleSave = async () => {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setSaveError('')
    try {
      if (bracket.qualification) {
        const placed = bracket.rounds[0].matches.flatMap((m) => [m.slot1.teamId, m.slot2.teamId])
        if (placed.some((id) => id == null || !qualifiedIds.has(id)) || new Set(placed).size !== qualifiedIds.size) {
          throw new Error('Place each qualified club exactly once in the first round.')
        }
      }
      await onSave(bracket)
      onClose()
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : 'The bracket could not be saved.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <Modal
      title={tr("🏆 {value0} - Knockout bracket", { value0: seasonTitle || 'Tournament' })}
      onClose={onClose}
      className={`bracket-canvas-modal-dialog ${isFullScreen ? 'is-fullscreen' : ''}`}
    >
      <div className="bracket-builder-shell">
        {/* TOP TOOLBAR */}
        <header className="bracket-builder-toolbar">
          <div className="toolbar-left">
            <span className="toolbar-label">{tr("Format:")}</span>
            {bracket.qualification ? <strong>{teamCount} {tr(" qualified clubs · configure first-round pairings")}</strong> : <div className="team-count-pills">
              {[2, 4, 8, 16].map((count) => (
                <button
                  key={count}
                  type="button"
                  className={`count-pill-btn ${teamCount === count ? 'active' : ''}`}
                  onClick={() => handleTeamCountChange(count)}
                >
                  {count} {tr(" teams (")}{count === 2 ? tr("final") : count === 4 ? tr("semi-finals") : count === 8 ? tr("quarter-finals") : tr("round of 16")})
                </button>
              ))}
            </div>}
          </div>

          <div className="toolbar-right">
            {!lockedSeeding && <><button type="button" className="toolbar-btn" onClick={handleAutoSeed} title={tr("Random draw")}>
              <Dices size={16} /> {tr(" Auto draw")}</button>
            <button type="button" className="toolbar-btn secondary" onClick={handleClearAll} title={tr("Clear bracket")}>
              <RotateCcw size={16} /> {tr(" Clear")}</button></>}
            <button
              type="button"
              className="toolbar-btn icon-only"
              onClick={() => setIsFullScreen(!isFullScreen)}
              title={tr("Tam Ekran")}
            >
              {isFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button type="button" className="toolbar-btn primary" disabled={saving} onClick={() => void handleSave()}>
              <Check size={16} /> {saving ? tr("Saving…") : tr("Save bracket")}
            </button>
          </div>
        </header>

        {/* MAIN BUILDER WORKSPACE: SIDEBAR + BRACKET CANVAS */}
        {saveError ? <p className="form-error" role="alert">{tr(saveError)}</p> : null}
        {lockedSeeding ? <p className="qualification-message">{tr("Qualifiers are fixed by the saved draw. Match scores advance winners automatically; use the winner controls only for ties without a fixture.")}</p> : null}
        <div className={`bracket-workspace-grid${lockedSeeding ? ' qualified-workspace' : ''}`}>
          {/* AVAILABLE CLUBS SIDEBAR */}
          {!lockedSeeding && <aside className="bracket-teams-sidebar">
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
              <span>{tr("Placed:")}</span>
              <strong>
                {placedTeamIds.size} / {teamCount} {tr(" teams")}</strong>
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
                      <span className="placed-indicator-badge" title={tr("In the bracket")}>
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
          </aside>}

          {/* BRACKET TREE CANVAS */}
          <main className="bracket-tree-canvas-container">
            <div className="bracket-tree-scroll-wrapper">
              <div className="bracket-rounds-flex">
                {bracket.rounds.map((round, rIdx) => round.matches.every(isByeTie) ? null : (
                  <div key={round.roundIndex} className={`bracket-round-column round-${rIdx}`}>
                    <div className="round-header-banner">
                      <h4>{tr(round.roundName)}</h4>
                      <span>{round.matches.filter((tie) => !isByeTie(tie)).length} {tr(" matches")}</span>
                    </div>

                    <div className="round-matches-stack">
                      {round.matches.map((match, mIdx) => isByeTie(match) ? null : (
                        <div key={match.matchId} className="bracket-matchup-node">
                          <div className="matchup-header">
                            <span>{match.label}</span>
                            {match.winnerSlotId ? <span className="matchup-decided">{tr("Decided")}</span> : null}
                          </div>

                          {/* SLOT 1 */}
                          <BracketSlotView
                            slot={match.slot1}
                            editable={!lockedSeeding && rIdx === 0}
                            slotLabel="Team 1"
                            isDragOver={dragOverSlotId === match.slot1.slotId}
                            onDragOver={(e) => handleDragOver(e, match.slot1.slotId)}
                            onDragLeave={(e) => handleDragLeave(e, match.slot1.slotId)}
                            onDrop={(e) => handleDropOnSlot(e, rIdx, mIdx, 'slot1')}
                            onClick={() => handleSlotClick(rIdx, mIdx, 'slot1')}
                            onRemove={(e) => removeTeamFromSlot(rIdx, mIdx, 'slot1', e)}
                          />

                          <div className="matchup-vs-divider">{tr("VS")}</div>

                          {/* SLOT 2 */}
                          <BracketSlotView
                            slot={match.slot2}
                            editable={!lockedSeeding && rIdx === 0}
                            slotLabel="Team 2"
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
                              <span>{tr("Winner")}</span>
                              <button
                                type="button"
                                disabled={match.resultMatchId != null}
                                className={match.winnerSlotId === match.slot1.slotId ? 'is-winner' : ''}
                                onClick={() => setBracket(setMatchWinner(bracket, match.matchId, match.slot1.slotId))}
                                title={tr("Advance this club")}
                              >
                                {match.slot1.teamName}
                              </button>
                              <button
                                type="button"
                                disabled={match.resultMatchId != null}
                                className={match.winnerSlotId === match.slot2.slotId ? 'is-winner' : ''}
                                onClick={() => setBracket(setMatchWinner(bracket, match.matchId, match.slot2.slotId))}
                                title={tr("Advance this club")}
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
                    <h4>{tr("🏆 Champion")}</h4>
                    <span>{tr("Final winner")}</span>
                  </div>
                  <div className="champion-podium-box">
                    <Trophy size={48} className="trophy-gold" />
                    <div className="champion-slot-container">
                      <div className="champion-slot-target">
                        {bracket.championSlot?.teamName ? <><TeamMark name={bracket.championSlot.teamName} logoUrl={bracket.championSlot.teamLogo} color={bracket.championSlot.teamColor} /><strong>{bracket.championSlot.teamName}</strong></> : <><strong>{tr("Champion")}</strong><span>{tr("Awaiting the final result")}</span></>}
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
  editable,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
  onRemove,
}: {
  slot: BracketSlot
  slotLabel: string
  editable: boolean
  isDragOver: boolean
  onDragOver: (e: DragEvent) => void
  onDragLeave: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
  onClick: () => void
  onRemove: (e: React.MouseEvent) => void
}) {
  const { tr } = useAdminLanguage()
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
          {country && <small>{country.flag} {tr(country.name)}</small>}
        </div>
        {editable && <button
          type="button"
          className="btn-slot-remove"
          onClick={onRemove}
          title={tr("Remove team")}
        >
          <X size={13} />
        </button>}
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
      <span>{isDragOver ? tr("Drop here") : `+ ${slotLabel}`}</span>
    </div>
  )
}

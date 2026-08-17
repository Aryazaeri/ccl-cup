import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleUserRound,
  Clock,
  Cloud,
  Dices,
  Edit2,
  FileText,
  Filter,
  Flame,
  Globe,
  Grid,
  HardDrive,
  Home,
  Image,
  Info,
  LayoutDashboard,
  List,
  LogOut,
  MapPin,
  Menu,
  MoreVertical,
  Newspaper,
  Plus,
  Search,
  Settings,
  Shield,
  Sparkles,
  Trash2,
  Trophy,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { type FormEvent, useMemo, useState } from 'react'
import type { AuthProfile } from '../auth/AuthContext'
import { COUNTRIES, getCountry } from '../lib/countries'
import { generateEmptyBracket } from '../lib/bracketUtils'
import { generateEmptyLeague } from '../lib/leagueUtils'
import { generateEmptyGroupLeague } from '../lib/groupLeagueUtils'
import {
  AVAILABLE_SEASONS,
  HOST_CITIES,
  type AdminSection,
  type Match,
  type MatchEvent,
  type MatchEventType,
  type MatchStatus,
  type Player,
  type PlayerPosition,
  type Season,
  type SeasonGroupLeague,
  type SeasonLeague,
  type SeasonType,
  type Story,
  type StoryCategory,
  type StrongFoot,
  type Team,
  type TournamentBracket,
  type TournamentFormat,
} from '../types'
import { BracketCanvasModal } from './BracketCanvasModal'
import { LeagueCanvasModal } from './LeagueCanvasModal'
import { GroupLeagueCanvasModal } from './GroupLeagueCanvasModal'
import { SquadCanvasModal } from './SquadCanvasModal'
import { TeamLogoPicker } from './TeamLogoPicker'
import { Brand } from './Brand'
import { Modal } from './Modal'
import { TeamMark } from './TeamMark'

type Props = {
  seasons: Season[]
  teams: Team[]
  players: Player[]
  matches: Match[]
  stories: Story[]
  profile: AuthProfile
  backend: 'supabase' | 'local-demo'
  error: string
  onAddSeason: (season: Season) => Promise<void>
  onUpdateSeason: (season: Season) => Promise<void>
  onDeleteSeason: (id: number) => Promise<void>
  onAddTeam: (team: Team) => Promise<void>
  onUpdateTeam: (team: Team) => Promise<void>
  onDeleteTeam: (id: number) => Promise<void>
  onAddPlayer: (player: Player) => Promise<void>
  onUpdatePlayer: (player: Player) => Promise<void>
  onDeletePlayer: (id: number) => Promise<void>
  onAddMatch: (match: Match) => Promise<void>
  onUpdateMatch: (match: Match) => Promise<void>
  onDeleteMatch: (id: number) => Promise<void>
  onAddMatchEvent: (matchId: number, event: MatchEvent) => Promise<void>
  onDeleteMatchEvent: (matchId: number, eventId: number) => Promise<void>
  onAddStory: (story: Story) => Promise<void>
  onUpdateStory: (story: Story) => Promise<void>
  onDeleteStory: (id: number) => Promise<void>
  onToggleStory: (id: number) => Promise<void>
  onSignOut: () => Promise<void>
  onViewSite: () => void
}

const sections: { label: AdminSection; icon: typeof Home }[] = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Seasons', icon: Trophy },
  { label: 'Teams', icon: Shield },
  { label: 'Players', icon: CircleUserRound },
  { label: 'Matches', icon: CalendarDays },
  { label: 'Standings', icon: BarChart3 },
  { label: 'Content', icon: Newspaper },
  { label: 'Media', icon: Image },
  { label: 'Sponsors', icon: Sparkles },
  { label: 'Users', icon: Users },
]

export function AdminPanel({
  seasons,
  teams,
  players,
  matches,
  stories,
  profile,
  backend,
  error,
  onAddSeason,
  onUpdateSeason,
  onDeleteSeason,
  onAddTeam,
  onUpdateTeam,
  onDeleteTeam,
  onAddPlayer,
  onUpdatePlayer,
  onDeletePlayer,
  onAddMatch,
  onUpdateMatch,
  onDeleteMatch,
  onAddMatchEvent,
  onDeleteMatchEvent,
  onAddStory,
  onUpdateStory,
  onDeleteStory,
  onToggleStory,
  onSignOut,
  onViewSite,
}: Props) {
  const [section, setSection] = useState<AdminSection>('Overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [modal, setModal] = useState<'season' | 'match' | 'team' | 'player' | 'story' | null>(null)
  const [editingSeason, setEditingSeason] = useState<Season | null>(null)
  const [bracketSeason, setBracketSeason] = useState<Season | null>(null)
  const [leagueSeason, setLeagueSeason] = useState<Season | null>(null)
  const [groupLeagueSeason, setGroupLeagueSeason] = useState<Season | null>(null)
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null)
  const [editingTeam, setEditingTeam] = useState<Team | null>(null)
  const [squadTeam, setSquadTeam] = useState<Team | null>(null)
  const [canvasSquadTeam, setCanvasSquadTeam] = useState<Team | null>(null)
  const [editingMatch, setEditingMatch] = useState<Match | null>(null)
  const [eventMatch, setEventMatch] = useState<Match | null>(null)
  const [editingStory, setEditingStory] = useState<Story | null>(null)

  const published = stories.filter((story) => story.status === 'Published').length
  const draft = stories.filter((story) => story.status === 'Draft').length
  const scheduled = stories.filter((story) => story.status === 'Scheduled').length

  const chooseSection = (next: AdminSection) => {
    setSection(next)
    setSidebarOpen(false)
  }

  return (
    <div className="admin-shell">
      <aside className={sidebarOpen ? 'admin-sidebar is-open' : 'admin-sidebar'}>
        <div className="sidebar-top">
          <Brand admin />
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
            <X />
          </button>
        </div>
        <nav aria-label="Admin sections">
          {sections.map(({ label, icon: Icon }) => (
            <button className={section === label ? 'active' : ''} key={label} onClick={() => chooseSection(label)}>
              <Icon />
              {label}
            </button>
          ))}
        </nav>
        <div className="admin-user">
          <CircleUserRound />
          <div>
            <strong>{profile.fullName}</strong>
            <span>{profile.role.replace('_', ' ')}</span>
          </div>
          <button aria-label="Sign out" onClick={() => void onSignOut()}>
            <LogOut />
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <button className="admin-menu" onClick={() => setSidebarOpen(true)} aria-label="Open admin menu">
            <Menu />
          </button>
          <h1>{section}</h1>
          <div className="admin-top-actions">
            <button className="site-switch" onClick={onViewSite}>
              View site
            </button>
            {section !== 'Seasons' && (
              <button className="button button-admin" onClick={() => setModal('team')}>
                <Plus />
                Add Club
              </button>
            )}
          </div>
        </header>

        <div className="admin-content">
          {error ? (
            <div className="admin-error" role="alert">
              {error}
            </div>
          ) : null}

          {section === 'Overview' && (
            <Overview
              seasonsCount={seasons.length}
              teams={teams}
              players={players}
              matches={matches}
              published={published}
              draft={draft}
              scheduled={scheduled}
              onOpenModal={(m) => setModal(m)}
              onManageMatchScore={(match) => setEditingMatch(match)}
            />
          )}

          {section === 'Seasons' && (
            <SeasonsManager
              seasons={seasons}
              backend={backend}
              onDelete={onDeleteSeason}
              onEdit={(season) => {
                setEditingSeason(season)
                setModal('season')
              }}
              onOpenBracket={(season) => setBracketSeason(season)}
              onOpenLeague={(season) => setLeagueSeason(season)}
              onOpenGroupLeague={(season) => setGroupLeagueSeason(season)}
              onAdd={() => {
                setEditingSeason(null)
                setModal('season')
              }}
            />
          )}

          {section === 'Teams' && (
            <TeamsManager
              teams={teams}
              players={players}
              onDelete={onDeleteTeam}
              onEdit={(team) => {
                setEditingTeam(team)
                setModal('team')
              }}
              onManageSquad={(team) => setSquadTeam(team)}
              onOpenSquadCanvas={(team) => setCanvasSquadTeam(team)}
              onAdd={() => {
                setEditingTeam(null)
                setModal('team')
              }}
            />
          )}

          {section === 'Players' && (
            <PlayersManager
              players={players}
              teams={teams}
              onDelete={onDeletePlayer}
              onEdit={(player) => {
                setEditingPlayer(player)
                setModal('player')
              }}
              onAdd={() => {
                setEditingPlayer(null)
                setModal('player')
              }}
            />
          )}

          {section === 'Matches' && (
            <MatchesManager
              matches={matches}
              onDelete={onDeleteMatch}
              onEditMatch={(match) => setEditingMatch(match)}
              onManageEvents={(match) => setEventMatch(match)}
              onAdd={() => setModal('match')}
            />
          )}

          {section === 'Content' && (
            <ContentManager
              stories={stories}
              onToggle={onToggleStory}
              onDelete={onDeleteStory}
              onEdit={(story) => {
                setEditingStory(story)
                setModal('story')
              }}
              onAdd={() => {
                setEditingStory(null)
                setModal('story')
              }}
            />
          )}

          {!['Overview', 'Seasons', 'Teams', 'Players', 'Matches', 'Content'].includes(section) && (
            <ModulePlaceholder section={section} />
          )}
        </div>
      </div>

      {modal === 'season' && (
        <SeasonModal
          initial={editingSeason}
          teams={teams}
          onClose={() => {
            setModal(null)
            setEditingSeason(null)
          }}
          onSave={async (season) => {
            if (editingSeason) await onUpdateSeason(season)
            else await onAddSeason(season)
          }}
        />
      )}

      {bracketSeason && (
        <BracketCanvasModal
          seasonTitle={bracketSeason.fullName}
          teams={teams}
          initialBracket={bracketSeason.bracket ?? generateEmptyBracket(bracketSeason.teamCount ?? 8)}
          onClose={() => setBracketSeason(null)}
          onSave={async (bracket) => {
            await onUpdateSeason({
              ...bracketSeason,
              seasonType: 'tournament',
              teamCount: bracket.teamCount,
              bracket,
            })
            setBracketSeason(null)
          }}
        />
      )}

      {leagueSeason && (
        <LeagueCanvasModal
          seasonTitle={leagueSeason.fullName}
          teams={teams}
          initialLeague={leagueSeason.league ?? { teamCount: 0, slots: [] }}
          onClose={() => setLeagueSeason(null)}
          onSave={async (league) => {
            await onUpdateSeason({
              ...leagueSeason,
              seasonType: 'league',
              teamCount: league.teamCount,
              league,
            })
            setLeagueSeason(null)
          }}
        />
      )}

      {groupLeagueSeason && (
        <GroupLeagueCanvasModal
          seasonTitle={groupLeagueSeason.fullName}
          teams={teams}
          initialGroupLeague={
            groupLeagueSeason.groupLeague ?? generateEmptyGroupLeague(groupLeagueSeason.groupCount ?? 4)
          }
          initialGroupCount={groupLeagueSeason.groupCount ?? 4}
          onClose={() => setGroupLeagueSeason(null)}
          onSave={async (groupLeague) => {
            const totalPlaced = groupLeague.groups.reduce((acc, g) => acc + g.slots.length, 0)
            await onUpdateSeason({
              ...groupLeagueSeason,
              seasonType: 'group_league',
              groupCount: groupLeague.groupCount,
              teamCount: totalPlaced,
              groupLeague,
            })
            setGroupLeagueSeason(null)
          }}
        />
      )}

      {modal === 'match' && <MatchForm teams={teams} onClose={() => setModal(null)} onSave={onAddMatch} />}

      {editingMatch && (
        <MatchScoreModal
          match={editingMatch}
          teams={teams}
          onClose={() => setEditingMatch(null)}
          onSave={onUpdateMatch}
        />
      )}

      {eventMatch && (
        <MatchEventsModal
          match={eventMatch}
          players={players}
          onClose={() => setEventMatch(null)}
          onAddEvent={(event) => onAddMatchEvent(eventMatch.id, event)}
          onDeleteEvent={(eventId) => onDeleteMatchEvent(eventMatch.id, eventId)}
        />
      )}

      {modal === 'team' && (
        <TeamModal
          initial={editingTeam}
          seasons={seasons}
          allPlayers={players}
          players={editingTeam ? players.filter((p) => p.teamId === editingTeam.id || p.teamName === editingTeam.name) : []}
          onClose={() => {
            setModal(null)
            setEditingTeam(null)
          }}
          onSave={async (team) => {
            if (editingTeam) await onUpdateTeam(team)
            else await onAddTeam(team)
          }}
          onAddPlayer={onAddPlayer}
          onUpdatePlayer={onUpdatePlayer}
          onDeletePlayer={onDeletePlayer}
          onOpenSquadCanvas={(team) => setCanvasSquadTeam(team)}
        />
      )}

      {squadTeam && (
        <QuickSquadModal
          team={squadTeam}
          seasons={seasons}
          allPlayers={players}
          players={players.filter((p) => p.teamId === squadTeam.id || p.teamName === squadTeam.name)}
          onClose={() => setSquadTeam(null)}
          onAddPlayer={onAddPlayer}
          onUpdatePlayer={onUpdatePlayer}
          onDeletePlayer={onDeletePlayer}
          onOpenSquadCanvas={(team) => setCanvasSquadTeam(team)}
        />
      )}

      {canvasSquadTeam && (
        <SquadCanvasModal
          team={canvasSquadTeam}
          allPlayers={players}
          teamPlayers={players.filter((p) => p.teamId === canvasSquadTeam.id || p.teamName === canvasSquadTeam.name)}
          onClose={() => setCanvasSquadTeam(null)}
          onSaveSquad={async (assignedIds, unassignedIds) => {
            // Assign players to this team
            for (const id of assignedIds) {
              const p = players.find((item) => item.id === id)
              if (p && (p.teamId !== canvasSquadTeam.id || p.teamName !== canvasSquadTeam.name)) {
                await onUpdatePlayer({
                  ...p,
                  teamId: canvasSquadTeam.id,
                  teamName: canvasSquadTeam.name,
                })
              }
            }
            // Release unassigned players to pool
            for (const id of unassignedIds) {
              const p = players.find((item) => item.id === id)
              if (p && (p.teamId === canvasSquadTeam.id || p.teamName === canvasSquadTeam.name)) {
                await onUpdatePlayer({
                  ...p,
                  teamId: 0,
                  teamName: 'Free Agent',
                })
              }
            }
          }}
        />
      )}

      {modal === 'player' && (
        <PlayerForm
          initial={editingPlayer}
          teams={teams}
          seasons={seasons}
          onClose={() => {
            setModal(null)
            setEditingPlayer(null)
          }}
          onSave={async (player) => {
            if (editingPlayer) await onUpdatePlayer(player)
            else await onAddPlayer(player)
          }}
        />
      )}

      {modal === 'story' && (
        <StoryForm
          initial={editingStory}
          onClose={() => {
            setModal(null)
            setEditingStory(null)
          }}
          onSave={async (story) => {
            if (editingStory) await onUpdateStory(story)
            else await onAddStory(story)
          }}
        />
      )}
    </div>
  )
}

function Overview({
  seasonsCount,
  teams,
  players,
  matches,
  published,
  draft,
  scheduled,
  onOpenModal,
  onManageMatchScore,
}: {
  seasonsCount: number
  teams: Team[]
  players: Player[]
  matches: Match[]
  published: number
  draft: number
  scheduled: number
  onOpenModal: (value: 'season' | 'match' | 'team' | 'player' | 'story') => void
  onManageMatchScore: (match: Match) => void
}) {
  const metrics = [
    { icon: Trophy, value: seasonsCount, label: 'Seasons & Tournaments' },
    { icon: Shield, value: teams.length, label: 'Clubs & Teams' },
    { icon: Users, value: players.length, label: 'Registered Players' },
    { icon: CalendarDays, value: matches.length, label: 'Scheduled Matches' },
  ]

  return (
    <>
      <section className="metric-strip">
        {metrics.map(({ icon: Icon, value, label }) => (
          <div key={label}>
            <Icon />
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </section>

      <div className="overview-grid">
        <section className="admin-panel upcoming">
          <div className="panel-header-row">
            <h2>Recent & Upcoming matches</h2>
          </div>
          <MatchTable matches={matches.slice(0, 4)} onEdit={onManageMatchScore} />
        </section>

        <section className="admin-panel activity">
          <h2>Recent tournament activity</h2>
          {[
            ['Nova FC updated squad roster (5 players active for 2026)', 'by Arya Zaeri', '30m ago'],
            ['Match result: Marmara 2 - 1 Bosphorus recorded', 'by Arya Zaeri', '1h ago'],
            ['Squad updated: Atlas SK registered Volkan Karaca (#10)', 'by Maya Patel', '3h ago'],
            ['Quarter-final story published', 'by Liam O’Connor', '5h ago'],
          ].map(([title, by, ago]) => (
            <div className="activity-row" key={title}>
              <span className="activity-icon">
                <FileText />
              </span>
              <div>
                <strong>{title}</strong>
                <span>{by}</span>
              </div>
              <time>{ago}</time>
            </div>
          ))}
        </section>
      </div>

      <div className="overview-lower">
        <section className="admin-panel content-status">
          <h2>Article status pipeline</h2>
          <div className="pipeline-cards-row">
            <div className="pipeline-card published">
              <div className="pipeline-icon">
                <CheckCircle2 size={22} />
              </div>
              <div className="pipeline-info">
                <span>Published</span>
                <strong>{published}</strong>
              </div>
            </div>

            <div className="pipeline-card draft">
              <div className="pipeline-icon">
                <Clock size={22} />
              </div>
              <div className="pipeline-info">
                <span>Draft</span>
                <strong>{draft}</strong>
              </div>
            </div>

            <div className="pipeline-card scheduled">
              <div className="pipeline-icon">
                <CalendarDays size={22} />
              </div>
              <div className="pipeline-info">
                <span>Scheduled</span>
                <strong>{scheduled}</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="admin-panel quick-actions">
          <h2>Quick actions</h2>
          <div className="quick-actions-grid">
            <button onClick={() => onOpenModal('season')}>
              <Trophy size={18} />
              <span>Yeni Sezon Ekle</span>
            </button>
            <button onClick={() => onOpenModal('team')}>
              <Shield size={18} />
              <span>Register Club</span>
            </button>
            <button onClick={() => onOpenModal('player')}>
              <UserPlus size={18} />
              <span>Add Player</span>
            </button>
            <button onClick={() => onOpenModal('match')}>
              <CalendarDays size={18} />
              <span>Schedule Match</span>
            </button>
          </div>
        </section>
      </div>
    </>
  )
}

function SeasonsManager({
  seasons,
  backend,
  onDelete,
  onEdit,
  onOpenBracket,
  onOpenLeague,
  onOpenGroupLeague,
  onAdd,
}: {
  seasons: Season[]
  backend?: 'supabase' | 'local-demo'
  onDelete: (id: number) => Promise<void>
  onEdit: (season: Season) => void
  onOpenBracket: (season: Season) => void
  onOpenLeague: (season: Season) => void
  onOpenGroupLeague: (season: Season) => void
  onAdd: () => void
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedYearFilter, setSelectedYearFilter] = useState<number | 'all'>(2026)
  const [pageSize, setPageSize] = useState(20)
  const [currentPage, setCurrentPage] = useState(1)

  const availableYears = useMemo(() => {
    const years = Array.from(new Set(seasons.map((s) => s.year))).sort((a, b) => b - a)
    if (!years.includes(2026)) years.unshift(2026)
    return years
  }, [seasons])

  const filtered = useMemo(() => {
    return seasons.filter((s) => {
      if (selectedYearFilter !== 'all' && s.year !== selectedYearFilter) {
        return false
      }
      if (!searchTerm) return true
      const term = searchTerm.toLowerCase()
      return (
        s.fullName.toLowerCase().includes(term) ||
        s.city.toLowerCase().includes(term) ||
        s.year.toString().includes(term) ||
        s.name.toLowerCase().includes(term)
      )
    })
  }, [seasons, selectedYearFilter, searchTerm])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, currentPage, pageSize])

  return (
    <section className="manager-view seasons-management-view">
      <div className="seasons-page-header">
        <div>
          <div className="admin-breadcrumb">
            <span>Anasayfa</span>
            <i>/</i>
            <strong>İçerik Yönetimi | GERİ DÖN</strong>
          </div>
          <h2>
            İçerik Yönetimi / Sezonlar ({filtered.length}
            {selectedYearFilter !== 'all' ? ` / ${selectedYearFilter} Sezonu` : ''})
          </h2>
        </div>
      </div>

      <div className="seasons-table-card">
        <div className="seasons-controls-bar">
          <div className="seasons-left-actions">
            <button className="button-yeni-ekle" onClick={onAdd}>
              <Plus size={16} /> Yeni Ekle
            </button>

            <div className="season-year-dropdown-wrap">
              <CalendarDays size={16} className="dropdown-calendar-icon" />
              <select
                value={selectedYearFilter}
                onChange={(e) => {
                  const val = e.target.value
                  setSelectedYearFilter(val === 'all' ? 'all' : Number(val))
                  setCurrentPage(1)
                }}
                className="season-year-select"
                title="Sezon / Yıl Seçin"
              >
                <option value="all">Tüm Yıllar & Kupalar ({seasons.length})</option>
                {availableYears.map((yr) => {
                  const count = seasons.filter((s) => s.year === yr).length
                  return (
                    <option key={yr} value={yr}>
                      {yr} Season ({count} Kupa)
                    </option>
                  )
                })}
              </select>
              <ChevronDown size={14} className="dropdown-chevron-icon" />
            </div>

            <span className="data-source seasons-bar-source">
              {backend === 'supabase' ? <Cloud size={14} /> : <HardDrive size={14} />}
              {backend === 'supabase' ? 'Supabase' : 'Local persistent'}
            </span>
          </div>

          <div className="seasons-filter-right">
            <div className="gosterim-group">
              <label>Gösterim:</label>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setCurrentPage(1)
                }}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <div className="arama-group">
              <label>Arama:</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  setCurrentPage(1)
                }}
                placeholder="Sezon veya şehir ara..."
              />
            </div>
          </div>
        </div>

        <div className="seasons-table-wrap">
          <table className="seasons-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <span className="th-sort-icon">▼</span>
                </th>
                <th>BAŞLIK</th>
                <th>ŞEHİR</th>
                <th>YIL</th>
                <th>DURUM</th>
                <th style={{ width: '150px', textAlign: 'center' }}>SEÇENEKLER</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((season) => (
                <tr key={season.id}>
                  <td></td>
                  <td>
                    <strong className="season-title-text">{season.fullName}</strong>
                  </td>
                  <td>
                    <span className="season-city-badge">
                      <MapPin size={13} /> {season.city}
                    </span>
                  </td>
                  <td>
                    <span className="season-year-badge">{season.year}</span>
                  </td>
                  <td>
                    {season.isActive ? (
                      <span className="season-status-pill active">🟢 Aktif</span>
                    ) : (
                      <span className="season-status-pill archived">⚪ Arşiv</span>
                    )}
                  </td>
                  <td>
                    <div className="seasons-action-buttons">
                      {season.seasonType === 'group_league' ? (
                        <button
                          className="btn-season-action group-league"
                          onClick={() => onOpenGroupLeague(season)}
                          title="Grup Tablolarını (Group League Canvas) Aç / Düzenle"
                        >
                          <Grid size={15} />
                        </button>
                      ) : season.seasonType === 'league' ? (
                        <button
                          className="btn-season-action league"
                          onClick={() => onOpenLeague(season)}
                          title="Lig Tablosunu (Single-File Canvas) Aç / Düzenle"
                        >
                          <List size={15} />
                        </button>
                      ) : (
                        <button
                          className="btn-season-action bracket"
                          onClick={() => onOpenBracket(season)}
                          title="Eleme Ağacını (Bracket Canvas) Aç / Düzenle"
                        >
                          <Trophy size={15} />
                        </button>
                      )}
                      <button
                        className="btn-season-action settings"
                        onClick={() => onEdit(season)}
                        title="Sezonu Düzenle"
                      >
                        <Settings size={15} />
                      </button>
                      <button
                        className="btn-season-action delete"
                        onClick={() => void onDelete(season.id)}
                        title="Sezonu Sil"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: '#8c9bad' }}>
                    Kayıt bulunamadı. "Yeni Ekle" butonuna tıklayarak ilk sezonu ekleyebilirsiniz.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="seasons-table-footer">
          <span>
            Gösterilen Kayıt: {filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} -{' '}
            {Math.min(currentPage * pageSize, filtered.length)} / Toplam Kayıt: {filtered.length}
          </span>
          <div className="seasons-pagination-btns">
            <button
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              ← Geri
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
              <button
                key={pageNum}
                className={currentPage === pageNum ? 'active' : ''}
                onClick={() => setCurrentPage(pageNum)}
              >
                {pageNum}
              </button>
            ))}
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              İleri →
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

// SEASONS MODAL (Yeni Ekle / Sezon Düzenle)
function SeasonModal({
  initial,
  teams,
  onClose,
  onSave,
}: {
  initial: Season | null
  teams: Team[]
  onClose: () => void
  onSave: (season: Season) => Promise<void>
}) {
  const [city, setCity] = useState(initial?.city ?? 'Antalya')
  const [year, setYear] = useState(initial?.year ?? 2026)
  const [name, setName] = useState(initial?.name ?? '')
  const [seasonType, setSeasonType] = useState<SeasonType>(initial?.seasonType ?? 'tournament')
  const [teamCount, setTeamCount] = useState<number>(
    initial?.teamCount ??
      (initial?.seasonType === 'league'
        ? (initial.league?.slots.length ?? 0)
        : initial?.seasonType === 'group_league'
        ? (initial.groupLeague?.groups.reduce((acc, g) => acc + g.slots.length, 0) ?? 0)
        : 8)
  )
  const [groupCount, setGroupCount] = useState<number>(
    initial?.groupCount ?? initial?.groupLeague?.groupCount ?? 4
  )
  const [bracket, setBracket] = useState<TournamentBracket | undefined>(
    initial?.bracket ?? (initial?.seasonType === 'tournament' ? generateEmptyBracket(initial?.teamCount ?? 8) : undefined)
  )
  const [league, setLeague] = useState<SeasonLeague | undefined>(
    initial?.league ?? (initial?.seasonType === 'league' ? { teamCount: 0, slots: [] } : undefined)
  )
  const [groupLeague, setGroupLeague] = useState<SeasonGroupLeague | undefined>(
    initial?.groupLeague ?? (initial?.seasonType === 'group_league' ? generateEmptyGroupLeague(initial?.groupCount ?? 4) : undefined)
  )
  const [openBracketBuilder, setOpenBracketBuilder] = useState(false)
  const [openLeagueBuilder, setOpenLeagueBuilder] = useState(false)
  const [openGroupLeagueBuilder, setOpenGroupLeagueBuilder] = useState(false)
  const [isActive, setIsActive] = useState(initial?.isActive ?? true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const fullName = `${city} ${year} ${name}`.trim()

  const handleTournamentTeamCountChange = (count: number) => {
    setTeamCount(count)
    setBracket(generateEmptyBracket(count))
  }

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!name.trim()) {
      setSaveError('Lütfen sezon adını girin.')
      return
    }
    setSaving(true)
    setSaveError('')
    try {
      const finalTeamCount =
        seasonType === 'tournament'
          ? teamCount
          : seasonType === 'group_league'
          ? (groupLeague?.groups.reduce((acc, g) => acc + g.slots.length, 0) ?? 0)
          : (league?.slots.length ?? 0)

      await onSave({
        id: initial?.id ?? Date.now(),
        city,
        year: Number(year),
        name: name.trim(),
        fullName,
        seasonType,
        teamCount: finalTeamCount,
        groupCount: seasonType === 'group_league' ? groupCount : undefined,
        bracket: seasonType === 'tournament' ? (bracket ?? generateEmptyBracket(teamCount)) : undefined,
        league: seasonType === 'league' ? (league ?? { teamCount: 0, slots: [] }) : undefined,
        groupLeague: seasonType === 'group_league' ? (groupLeague ?? generateEmptyGroupLeague(groupCount)) : undefined,
        isActive,
      })
      onClose()
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : 'Sezon kaydedilemedi.')
    } finally {
      setSaving(false)
    }
  }

  const yearsList = [2028, 2027, 2026, 2025, 2024, 2023, 2022, 2021, 2020]
  const groupCountOptions = [2, 3, 4, 5, 6, 8]

  return (
    <>
      <Modal title={initial ? `Edit Season: ${initial.fullName}` : 'Yeni Ekle'} onClose={onClose}>
        <form className="admin-form" onSubmit={submit}>
          <label>
            Şehir *
            <select value={city} onChange={(e) => setCity(e.target.value)}>
              {HOST_CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label>
            Yıl *
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {yearsList.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>

          <label className="span-2">
            Sezon Adı *
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. INTERNATIONAL CORPORATE CUP Sezonu"
              required
            />
          </label>

          <label className={seasonType === 'league' ? 'span-2' : ''}>
            Sezon Formatı / Tipi *
            <select
              value={seasonType}
              onChange={(e) => {
                const nextType = e.target.value as SeasonType
                setSeasonType(nextType)
                if (nextType === 'tournament' && !bracket) {
                  setBracket(generateEmptyBracket(8))
                  setTeamCount(8)
                } else if (nextType === 'league' && !league) {
                  setLeague({ teamCount: 0, slots: [] })
                } else if (nextType === 'group_league' && !groupLeague) {
                  setGroupLeague(generateEmptyGroupLeague(groupCount))
                }
              }}
            >
              <option value="tournament">🏆 Tournament (Knockout Bracket / Eleme Ağacı)</option>
              <option value="league">⚽ League (Single Table / Tek Lig Formatı)</option>
              <option value="group_league">🗂️ Group League (Çoklu Grup Formatı)</option>
            </select>
          </label>

          {seasonType === 'tournament' && (
            <label>
              Takım Sayısı *
              <select
                value={teamCount}
                onChange={(e) => handleTournamentTeamCountChange(Number(e.target.value))}
              >
                <option value={4}>4 Takım (Yarı Final ➔ Final)</option>
                <option value={8}>8 Takım (Çeyrek Final ➔ Final)</option>
                <option value={16}>16 Takım (Son 16 ➔ Final)</option>
              </select>
            </label>
          )}

          {seasonType === 'group_league' && (
            <label>
              Grup Sayısı *
              <select
                value={groupCount}
                onChange={(e) => {
                  const count = Number(e.target.value)
                  setGroupCount(count)
                  setGroupLeague(generateEmptyGroupLeague(count))
                }}
              >
                {groupCountOptions.map((c) => (
                  <option key={c} value={c}>
                    {c} Gruplu ({c === 2 ? 'Grup A, B' : c === 4 ? 'Grup A, B, C, D' : `${c} Grup`})
                  </option>
                ))}
              </select>
            </label>
          )}

          {seasonType === 'tournament' && (
            <div className="span-2 season-bracket-launch-box">
              <div className="bracket-launch-info">
                <Trophy size={20} className="trophy-accent" />
                <div>
                  <strong>Eleme Ağacı & Eşleşmeler</strong>
                  <span>
                    {bracket
                      ? `${teamCount} Takımlı Ağaç Yapılandırıldı (Kura & Eşleşmeleri Düzenle)`
                      : `${teamCount} Takımlı Boş Eleme Ağacı`}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="button button-admin"
                onClick={() => setOpenBracketBuilder(true)}
              >
                <Trophy size={15} /> Eleme Ağacını Aç / Eşleştir
              </button>
            </div>
          )}

          {seasonType === 'league' && (
            <div className="span-2 season-bracket-launch-box">
              <div className="bracket-launch-info">
                <Trophy size={20} className="trophy-accent" />
                <div>
                  <strong>Lig Tablosu & Katılımcı Takımlar</strong>
                  <span>
                    {league && league.slots.length > 0
                      ? `${league.slots.length} Takım Tabloya Eklendi (Sıralamayı ve Takımları Düzenle)`
                      : 'Dinamik Lig Tablosu (Sürükleyip Takım Ekleyin)'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="button button-admin"
                onClick={() => setOpenLeagueBuilder(true)}
              >
                ⚽ Lig Tablosunu Aç / Takımları Ekle
              </button>
            </div>
          )}

          {seasonType === 'group_league' && (
            <div className="span-2 season-bracket-launch-box">
              <div className="bracket-launch-info">
                <Trophy size={20} className="trophy-accent" />
                <div>
                  <strong>Çoklu Grup Tabloları ({groupCount} Grup)</strong>
                  <span>
                    {groupLeague && groupLeague.groups.some((g) => g.slots.length > 0)
                      ? `${groupLeague.groups.reduce((acc, g) => acc + g.slots.length, 0)} Takım Gruplara Dağıtıldı`
                      : `${groupCount} Gruplu Boş Tablo (Sürükleyip Takımları Dağıtın)`}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="button button-admin"
                onClick={() => setOpenGroupLeagueBuilder(true)}
              >
                🗂️ Grup Tablolarını Aç / Takımları Dağıt
              </button>
            </div>
          )}

          <label className="checkbox-label span-2">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <span>Bu sezonu güncel/aktif sezon olarak işaretle</span>
          </label>

          {saveError ? <div className="form-error span-2">{saveError}</div> : null}

          <FormActions onClose={onClose} label={initial ? 'Save Changes' : 'Ekle'} saving={saving} />
        </form>
      </Modal>

      {openBracketBuilder && (
        <BracketCanvasModal
          seasonTitle={fullName || 'Turnuva'}
          teams={teams}
          initialBracket={bracket ?? generateEmptyBracket(teamCount)}
          onClose={() => setOpenBracketBuilder(false)}
          onSave={(newBracket) => {
            setBracket(newBracket)
            setTeamCount(newBracket.teamCount)
          }}
        />
      )}

      {openLeagueBuilder && (
        <LeagueCanvasModal
          seasonTitle={fullName || 'Lig'}
          teams={teams}
          initialLeague={league ?? { teamCount: 0, slots: [] }}
          onClose={() => setOpenLeagueBuilder(false)}
          onSave={(newLeague) => {
            setLeague(newLeague)
            setTeamCount(newLeague.teamCount)
          }}
        />
      )}

      {openGroupLeagueBuilder && (
        <GroupLeagueCanvasModal
          seasonTitle={fullName || 'Grup Ligi'}
          teams={teams}
          initialGroupLeague={groupLeague ?? generateEmptyGroupLeague(groupCount)}
          initialGroupCount={groupCount}
          onClose={() => setOpenGroupLeagueBuilder(false)}
          onSave={(newGroupLeague) => {
            setGroupLeague(newGroupLeague)
            setGroupCount(newGroupLeague.groupCount)
          }}
        />
      )}
    </>
  )
}

function TeamsManager({
  teams,
  players,
  onDelete,
  onEdit,
  onManageSquad,
  onOpenSquadCanvas,
  onAdd,
}: {
  teams: Team[]
  players: Player[]
  onDelete: (id: number) => Promise<void>
  onEdit: (team: Team) => void
  onManageSquad: (team: Team) => void
  onOpenSquadCanvas?: (team: Team) => void
  onAdd: () => void
}) {
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table')
  const [searchTerm, setSearchTerm] = useState('')
  const [countryFilter, setCountryFilter] = useState('All')
  const [formatFilter, setFormatFilter] = useState('All')

  const filteredTeams = useMemo(() => {
    return teams.filter((team) => {
      if (searchTerm && !team.name.toLowerCase().includes(searchTerm.toLowerCase())) return false
      if (countryFilter !== 'All' && team.countryCode !== countryFilter) return false
      if (formatFilter !== 'All' && team.tournamentFormat !== formatFilter) return false
      return true
    })
  }, [teams, searchTerm, countryFilter, formatFilter])

  return (
    <section className="manager-view">
      <div className="manager-head">
        <div>
          <h2>Teams & Participating Clubs ({teams.length})</h2>
          <p>The foundational data entry point: manage club branding, logos, country flags, and rosters.</p>
        </div>
        <button className="button button-admin" onClick={onAdd}>
          <Plus />
          Register New Club
        </button>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="filter-bar">
        <div className="filter-group search-group">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search by club name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filter-group">
          <Globe size={16} />
          <span>Country:</span>
          <select value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)}>
            <option value="All">All Countries</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <Trophy size={16} />
          <span>Tournament:</span>
          <select value={formatFilter} onChange={(e) => setFormatFilter(e.target.value)}>
            <option value="All">All Formats</option>
            <option value="Champions Cup">Champions Cup</option>
            <option value="Challenge Cup">Challenge Cup</option>
            <option value="Open League">Open League</option>
          </select>
        </div>

        <div className="view-mode-toggle">
          <button
            className={viewMode === 'table' ? 'active' : ''}
            onClick={() => setViewMode('table')}
            title="Table View"
          >
            <List size={16} />
          </button>
          <button
            className={viewMode === 'grid' ? 'active' : ''}
            onClick={() => setViewMode('grid')}
            title="Grid View"
          >
            <Grid size={16} />
          </button>
        </div>
      </div>

      {/* TABLE VIEW */}
      {viewMode === 'table' ? (
        <div className="admin-panel">
          <table className="admin-table">
            <thead>
              <tr>
                <th>CLUB & CREST</th>
                <th>COUNTRY</th>
                <th>TOURNAMENT & GROUP</th>
                <th>MANAGER / COACH</th>
                <th>SQUAD STATUS</th>
                <th>STANDINGS</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filteredTeams.map((team) => {
                const squad = players.filter((p) => p.teamId === team.id || p.teamName === team.name)
                const country = getCountry(team.countryCode)
                const isComplete = squad.length >= 5

                return (
                  <tr key={team.id}>
                    <td>
                      <span className="team-cell">
                        <TeamMark
                          name={team.name}
                          color={team.color}
                          secondaryColor={team.secondaryColor}
                          logoUrl={team.logoUrl}
                        />
                        <div className="team-cell-text">
                          <strong>{team.name}</strong>
                          {team.shortName && <span className="short-code">{team.shortName}</span>}
                        </div>
                      </span>
                    </td>
                    <td>
                      <span className="country-badge">
                        <span className="flag-emoji">{country.flag}</span>
                        <span>{country.name}</span>
                      </span>
                    </td>
                    <td>
                      <div className="tournament-tag-group">
                        <span className="tournament-pill">{team.tournamentFormat ?? 'Champions Cup'}</span>
                        <span className="group-pill">{team.groupName ?? 'Group A'}</span>
                      </div>
                    </td>
                    <td>
                      <div className="staff-info">
                        <strong>{team.managerName || '—'}</strong>
                        <span>Coach: {team.coachName || '—'}</span>
                      </div>
                    </td>
                    <td>
                      <div className="squad-indicator">
                        {isComplete ? (
                          <span className="squad-badge complete">
                            <CheckCircle2 size={13} /> {squad.length} Players (Ready)
                          </span>
                        ) : (
                          <span className="squad-badge incomplete" title="Minimum 5 squad members required for matchday">
                            <AlertCircle size={13} /> {squad.length}/5 (Needs {5 - squad.length} more)
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="standings-mini">
                        <strong>{team.points} pts</strong>
                        <span>({team.played}P / GD: {team.goalDifference > 0 ? `+${team.goalDifference}` : team.goalDifference})</span>
                      </div>
                    </td>
                    <td>
                      <div className="row-actions-group">
                        {onOpenSquadCanvas && (
                          <button
                            className="row-action"
                            style={{ color: '#0284c7', borderColor: '#bae6fd', background: '#f0f9ff' }}
                            onClick={() => onOpenSquadCanvas(team)}
                            title="Görsel Saha ve Kadro Tuvali (Tactical Formation & Pitch Canvas)"
                          >
                            <Sparkles size={14} /> Saha Tuvali
                          </button>
                        )}
                        <button
                          className="row-action secondary"
                          onClick={() => onManageSquad(team)}
                          title="Manage Squad Roster"
                        >
                          <Users size={14} /> Squad ({squad.length})
                        </button>
                        <button className="row-action" onClick={() => onEdit(team)} title="Edit Club Details">
                          <Edit2 size={14} /> Edit
                        </button>
                        <button className="row-action danger" onClick={() => void onDelete(team.id)} title="Delete Club">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filteredTeams.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: '#8c9bad' }}>
                    No clubs found matching your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* GRID CARDS VIEW */
        <div className="teams-grid-layout">
          {filteredTeams.map((team) => {
            const squad = players.filter((p) => p.teamId === team.id || p.teamName === team.name)
            const country = getCountry(team.countryCode)
            const isComplete = squad.length >= 5

            return (
              <div className="team-admin-card" key={team.id}>
                <div
                  className="team-card-banner"
                  style={{
                    background: `linear-gradient(135deg, ${team.color} 0%, ${team.secondaryColor || '#071525'} 100%)`,
                  }}
                >
                  <span className="card-flag-badge">
                    {country.flag} {country.name}
                  </span>
                  <span className="card-format-badge">{team.tournamentFormat ?? 'Champions Cup'}</span>
                </div>

                <div className="team-card-body">
                  <div className="team-card-header">
                    <TeamMark
                      name={team.name}
                      color={team.color}
                      secondaryColor={team.secondaryColor}
                      logoUrl={team.logoUrl}
                      size="lg"
                    />
                    <div>
                      <h3>{team.name}</h3>
                      <span className="card-group-label">{team.groupName ?? 'Group A'}</span>
                    </div>
                  </div>

                  <p className="team-card-bio">{team.bio || 'Participating member in the CCL Cup.'}</p>

                  <div className="team-card-meta">
                    <div>
                      <span>Manager</span>
                      <strong>{team.managerName || '—'}</strong>
                    </div>
                    <div>
                      <span>Coach</span>
                      <strong>{team.coachName || '—'}</strong>
                    </div>
                  </div>

                  <div className="team-card-squad-status">
                    {isComplete ? (
                      <span className="squad-badge complete">
                        <CheckCircle2 size={13} /> {squad.length} Players (Complete Squad)
                      </span>
                    ) : (
                      <span className="squad-badge incomplete">
                        <AlertCircle size={13} /> {squad.length}/5 Players (Minimum 5 required)
                      </span>
                    )}
                  </div>

                  <div className="team-card-actions">
                    {onOpenSquadCanvas && (
                      <button
                        className="button button-secondary"
                        style={{ color: '#0284c7', borderColor: '#bae6fd', background: '#f0f9ff' }}
                        onClick={() => onOpenSquadCanvas(team)}
                        title="Görsel Saha ve Kadro Tuvali"
                      >
                        <Sparkles size={14} /> Saha Tuvali
                      </button>
                    )}
                    <button className="button button-secondary" onClick={() => onManageSquad(team)}>
                      <Users size={14} /> Roster ({squad.length})
                    </button>
                    <button className="button button-admin" onClick={() => onEdit(team)}>
                      <Edit2 size={14} /> Edit Club
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function PlayersManager({
  players,
  teams,
  onDelete,
  onEdit,
  onAdd,
}: {
  players: Player[]
  teams: Team[]
  onDelete: (id: number) => Promise<void>
  onEdit: (player: Player) => void
  onAdd: () => void
}) {
  const [selectedTeam, setSelectedTeam] = useState<string>('All')
  const [selectedPos, setSelectedPos] = useState<string>('All')
  const [searchPlayer, setSearchPlayer] = useState('')

  const filtered = useMemo(() => {
    return players.filter((p) => {
      if (searchPlayer && !p.fullName.toLowerCase().includes(searchPlayer.toLowerCase())) return false
      if (selectedTeam === 'Free Agent') {
        if (p.teamId && p.teamId > 0 && p.teamName !== 'Free Agent') return false
      } else if (selectedTeam !== 'All' && p.teamName !== selectedTeam) {
        return false
      }
      if (selectedPos !== 'All' && p.position !== selectedPos.toLowerCase()) return false
      return true
    })
  }, [players, selectedTeam, selectedPos, searchPlayer])

  return (
    <section className="manager-view">
      <div className="manager-head">
        <div>
          <h2>Players & Rosters ({players.length})</h2>
          <p>Register squad members, assign shirt numbers, positions, and active seasons.</p>
        </div>
        <button className="button button-admin" onClick={onAdd}>
          <Plus />
          Register Player
        </button>
      </div>

      <div className="filter-bar">
        <div className="filter-group search-group">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search player name..."
            value={searchPlayer}
            onChange={(e) => setSearchPlayer(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="filter-group">
          <Filter size={16} />
          <span>Team:</span>
          <select value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)}>
            <option value="All">All Teams</option>
            <option value="Free Agent">🚫 Serbest / Kulüpsüz Oyuncular</option>
            {teams.map((t) => (
              <option key={t.id} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <span>Position:</span>
          <select value={selectedPos} onChange={(e) => setSelectedPos(e.target.value)}>
            <option value="All">All Positions</option>
            <option value="Goalkeeper">Goalkeeper</option>
            <option value="Defender">Defender</option>
            <option value="Midfielder">Midfielder</option>
            <option value="Forward">Forward</option>
          </select>
        </div>
      </div>

      <div className="admin-panel">
        <table className="admin-table">
          <thead>
            <tr>
              <th>#</th>
              <th>PLAYER</th>
              <th>TEAM</th>
              <th>POSITION</th>
              <th>PLAYED SEASONS</th>
              <th>STATS</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((player) => (
              <tr key={player.id}>
                <td>
                  <span className="shirt-badge">{player.shirtNumber ?? '-'}</span>
                </td>
                <td>
                  <div className="player-cell">
                    <strong>{player.fullName}</strong>
                    {player.isCaptain && <span className="captain-badge" title="Team Captain">C</span>}
                  </div>
                </td>
                <td>
                  {player.teamId && player.teamId > 0 && player.teamName !== 'Free Agent' ? (
                    <span className="team-cell-small">
                      <TeamMark name={player.teamName} />
                      <span>{player.teamName}</span>
                    </span>
                  ) : (
                    <span className="free-agent-badge">🚫 Serbest / Kulüpsüz</span>
                  )}
                </td>
                <td>
                  <span className={`position-tag ${player.position}`}>
                    {player.position.slice(0, 3).toUpperCase()}
                  </span>
                </td>
                <td>
                  <div className="season-tags-list">
                    {(player.activeSeasons && player.activeSeasons.length > 0
                      ? player.activeSeasons
                      : ['2026 - Summer League']
                    ).map((s) => (
                      <span key={s} className="season-pill">{s}</span>
                    ))}
                  </div>
                </td>
                <td>
                  <span className="player-stats-text">
                    ⚽ {player.goals ?? 0} &nbsp;·&nbsp; 🎯 {player.assists ?? 0}
                  </span>
                </td>
                <td>
                  <div className="row-actions-group">
                    <button className="row-action" onClick={() => onEdit(player)}>
                      <Edit2 size={14} /> Edit
                    </button>
                    <button className="row-action danger" onClick={() => void onDelete(player.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: '#8c9bad' }}>
                  No players found matching current filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function MatchesManager({
  matches,
  onDelete,
  onEditMatch,
  onManageEvents,
  onAdd,
}: {
  matches: Match[]
  onDelete: (id: number) => Promise<void>
  onEditMatch: (match: Match) => void
  onManageEvents: (match: Match) => void
  onAdd: () => void
}) {
  const [filterStatus, setFilterStatus] = useState<string>('All')

  const filtered = useMemo(() => {
    if (filterStatus === 'All') return matches
    return matches.filter((m) => m.matchStatus === filterStatus.toLowerCase())
  }, [matches, filterStatus])

  return (
    <section className="manager-view">
      <div className="manager-head">
        <div>
          <h2>Matches & Scorekeeping ({matches.length})</h2>
          <p>Schedule fixtures, record live match scores, and log event timelines.</p>
        </div>
        <button className="button button-admin" onClick={onAdd}>
          <Plus />
          Schedule Match
        </button>
      </div>

      <div className="filter-bar">
        <div className="filter-group">
          <span>Status:</span>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="All">All Matches</option>
            <option value="Scheduled">Scheduled</option>
            <option value="Live">Live</option>
            <option value="Completed">Completed</option>
            <option value="Postponed">Postponed</option>
          </select>
        </div>
      </div>

      <section className="admin-panel">
        <MatchTable
          matches={filtered}
          onEdit={onEditMatch}
          onManageEvents={onManageEvents}
          onDelete={onDelete}
        />
      </section>
    </section>
  )
}

function ContentManager({
  stories,
  onToggle,
  onDelete,
  onEdit,
  onAdd,
}: {
  stories: Story[]
  onToggle: (id: number) => Promise<void>
  onDelete: (id: number) => Promise<void>
  onEdit: (story: Story) => void
  onAdd: () => void
}) {
  return (
    <section className="manager-view">
      <div className="manager-head">
        <div>
          <h2>Editorial Content & Stories ({stories.length})</h2>
          <p>Write match reports, announcements, and headlines for the public portal.</p>
        </div>
        <button className="button button-admin" onClick={onAdd}>
          <Plus />
          New Story
        </button>
      </div>

      <section className="admin-panel">
        <table className="admin-table">
          <thead>
            <tr>
              <th>HEADLINE</th>
              <th>CATEGORY</th>
              <th>STATUS</th>
              <th>PUBLISHED DATE</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {stories.map((story) => (
              <tr key={story.id}>
                <td>
                  <strong>{story.title}</strong>
                </td>
                <td>
                  <span className="category-pill">{story.category?.replace('_', ' ') ?? 'news'}</span>
                </td>
                <td>
                  <span className={`status-dot ${story.status.toLowerCase()}`} />
                  {story.status}
                </td>
                <td>{story.publishedAt ?? '—'}</td>
                <td>
                  <div className="row-actions-group">
                    <button className="row-action" onClick={() => onEdit(story)}>
                      <Edit2 size={14} /> Edit
                    </button>
                    <button className="row-action secondary" onClick={() => void onToggle(story.id)}>
                      {story.status === 'Published' ? 'Unpublish' : 'Publish'}
                    </button>
                    <button className="row-action danger" onClick={() => void onDelete(story.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </section>
  )
}

function ModulePlaceholder({ section }: { section: AdminSection }) {
  return (
    <section className="module-placeholder">
      <div>
        <BarChart3 />
      </div>
      <h2>{section} module</h2>
      <p>This prototype includes the module shell. Its detailed forms can be connected in the production build.</p>
    </section>
  )
}

function MatchTable({
  matches,
  onEdit,
  onManageEvents,
  onDelete,
}: {
  matches: Match[]
  onEdit?: (match: Match) => void
  onManageEvents?: (match: Match) => void
  onDelete?: (id: number) => Promise<void>
}) {
  return (
    <div className="table-scroll">
      <table className="admin-table">
        <thead>
          <tr>
            <th>MATCH</th>
            <th>SCORE / STATUS</th>
            <th>STAGE</th>
            <th>DATE</th>
            <th>VENUE</th>
            <th>ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((match) => {
            const hasScore = match.homeScore != null && match.awayScore != null
            return (
              <tr key={match.id}>
                <td>
                  <strong>
                    {match.home} vs {match.away}
                  </strong>
                </td>
                <td>
                  <div className="match-status-cell">
                    {hasScore ? (
                      <span className="score-badge">
                        {match.homeScore} - {match.awayScore}
                      </span>
                    ) : (
                      <span className="score-badge empty">vs</span>
                    )}
                    <span className={`status-dot ${match.matchStatus}`}></span>
                    <span className="status-text">{match.matchStatus}</span>
                  </div>
                </td>
                <td>{match.stage}</td>
                <td>
                  {match.date} · {match.time}
                </td>
                <td>{match.venue}</td>
                <td>
                  <div className="row-actions-group">
                    {onEdit && (
                      <button className="row-action" onClick={() => onEdit(match)} title="Edit score & details">
                        <Edit2 size={14} /> Score / Edit
                      </button>
                    )}
                    {onManageEvents && (
                      <button className="row-action secondary" onClick={() => onManageEvents(match)} title="Manage events">
                        <Flame size={14} /> Events ({match.events?.length ?? 0})
                      </button>
                    )}
                    {onDelete && (
                      <button className="row-action danger" onClick={() => void onDelete(match.id)} title="Delete match">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// COMPREHENSIVE TEAM MODAL (Tabbed)
function TeamModal({
  initial,
  players,
  allPlayers = [],
  seasons,
  onClose,
  onSave,
  onAddPlayer,
  onUpdatePlayer,
  onDeletePlayer,
  onOpenSquadCanvas,
}: {
  initial: Team | null
  players: Player[]
  allPlayers?: Player[]
  seasons: Season[]
  onClose: () => void
  onSave: (team: Team) => Promise<void>
  onAddPlayer: (player: Player) => Promise<void>
  onUpdatePlayer?: (player: Player) => Promise<void>
  onDeletePlayer: (id: number) => Promise<void>
  onOpenSquadCanvas?: (team: Team) => void
}) {
  const [tab, setTab] = useState<'identity' | 'staff' | 'tournament' | 'squad'>('identity')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // Form State for Live Preview
  const [name, setName] = useState(initial?.name ?? '')
  const [shortName, setShortName] = useState(initial?.shortName ?? '')
  const [countryCode, setCountryCode] = useState(initial?.countryCode ?? 'TR')
  const [logoUrl, setLogoUrl] = useState(initial?.logoUrl ?? '')
  const [color, setColor] = useState(initial?.color ?? '#63e35b')
  const [secondaryColor, setSecondaryColor] = useState(initial?.secondaryColor ?? '#071525')

  // Real-time Season & Group Selection State
  const [selectedSeasonId, setSelectedSeasonId] = useState<number>(() => {
    if (initial?.seasonId) return initial.seasonId
    const active = seasons.find((s) => s.isActive)
    return active?.id ?? seasons[0]?.id ?? 1
  })

  const currentSelectedSeason = useMemo(() => {
    return seasons.find((s) => s.id === selectedSeasonId) ?? seasons[0]
  }, [seasons, selectedSeasonId])

  const availableSeasonNames = useMemo(() => {
    if (seasons.length === 0) return ['2026 - Summer League']
    return seasons.map((s) => `${s.year} - ${s.fullName || s.name || s.city}`)
  }, [seasons])

  // Get dynamic available groups for the selected season
  const availableGroups = useMemo(() => {
    if (!currentSelectedSeason) return ['Group A', 'Group B', 'Group C', 'Group D']
    if (currentSelectedSeason.seasonType === 'group_league' && currentSelectedSeason.groupLeague?.groups) {
      return currentSelectedSeason.groupLeague.groups.map((g) => g.name)
    }
    if (currentSelectedSeason.seasonType === 'league') {
      return ['Single League Table']
    }
    return ['Group A', 'Group B', 'Group C', 'Group D', 'Knockout Stage']
  }, [currentSelectedSeason])

  // Squad Pool & Inline Add State
  const [squadAddMode, setSquadAddMode] = useState<'pool' | 'new'>('pool')
  const [selectedPoolPlayerId, setSelectedPoolPlayerId] = useState<number | ''>('')
  const [poolPlayerSearch, setPoolPlayerSearch] = useState('')
  const [assigningPoolPlayer, setAssigningPoolPlayer] = useState(false)
  const [squadActionError, setSquadActionError] = useState('')

  // In-line Player Add State
  const [newPlayerName, setNewPlayerName] = useState('')
  const [newPlayerNumber, setNewPlayerNumber] = useState('')
  const [newPlayerPosition, setNewPlayerPosition] = useState<PlayerPosition>('forward')
  const [newPlayerSeason, setNewPlayerSeason] = useState<string>(() => {
    return availableSeasonNames[0] || '2026 - Summer League'
  })
  const [addingPlayer, setAddingPlayer] = useState(false)

  // Filter pool players: players that are NOT already in this team
  const availablePoolPlayers = useMemo(() => {
    if (!initial) return []
    return allPlayers.filter((p) => p.teamId !== initial.id && p.teamName !== initial.name)
  }, [allPlayers, initial])

  const filteredPoolPlayers = useMemo(() => {
    if (!poolPlayerSearch.trim()) return availablePoolPlayers
    const q = poolPlayerSearch.toLowerCase()
    return availablePoolPlayers.filter(
      (p) =>
        p.fullName.toLowerCase().includes(q) ||
        p.teamName.toLowerCase().includes(q) ||
        p.position.toLowerCase().includes(q)
    )
  }, [availablePoolPlayers, poolPlayerSearch])

  const selectedCountry = getCountry(countryCode)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setSaveError('')
    const data = new FormData(event.currentTarget)
    try {
      await onSave({
        id: initial?.id ?? Date.now(),
        seasonId: selectedSeasonId,
        name: String(data.get('name')).toUpperCase(),
        shortName: String(data.get('shortName')).toUpperCase() || undefined,
        countryCode,
        countryName: selectedCountry.name,
        logoUrl: String(data.get('logoUrl')) || undefined,
        color: String(data.get('color')),
        secondaryColor: String(data.get('secondaryColor')) || undefined,
        managerName: String(data.get('managerName')) || undefined,
        coachName: String(data.get('coachName')) || undefined,
        bio: String(data.get('bio')) || undefined,
        tournamentFormat: (currentSelectedSeason?.fullName || currentSelectedSeason?.name || 'Champions Cup') as TournamentFormat,
        groupName: String(data.get('groupName')) || availableGroups[0] || 'Group A',
        played: initial?.played ?? 0,
        goalDifference: initial?.goalDifference ?? 0,
        points: initial?.points ?? 0,
        isActive: data.get('isActive') === 'on',
      })
    } catch (reason: unknown) {
      console.error('Club save failed:', reason)
      let msg = 'Unable to save club.'
      if (reason instanceof Error) {
        msg = reason.message
      } else if (typeof reason === 'object' && reason !== null && 'message' in reason) {
        msg = String((reason as { message: unknown }).message)
      } else if (typeof reason === 'string') {
        msg = reason
      }
      setSaveError(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleAssignPoolPlayer = async () => {
    if (!selectedPoolPlayerId || !initial || !onUpdatePlayer) return
    const targetPlayer = allPlayers.find((p) => p.id === Number(selectedPoolPlayerId))
    if (!targetPlayer) return

    setAssigningPoolPlayer(true)
    setSquadActionError('')
    try {
      await onUpdatePlayer({
        ...targetPlayer,
        teamId: initial.id,
        teamName: initial.name,
      })
      setSelectedPoolPlayerId('')
      setPoolPlayerSearch('')
    } catch (err: unknown) {
      console.error('Assign player error:', err)
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Unable to add player to squad.'
      setSquadActionError(msg)
    } finally {
      setAssigningPoolPlayer(false)
    }
  }

  const handleInlineAddPlayer = async () => {
    if (!newPlayerName.trim()) return
    if (!initial) {
      setSaveError('Please save the club first before adding squad members.')
      return
    }
    setAddingPlayer(true)
    setSquadActionError('')
    try {
      await onAddPlayer({
        id: Date.now(),
        teamId: initial.id,
        teamName: initial.name,
        fullName: newPlayerName.trim(),
        shirtNumber: newPlayerNumber ? Number(newPlayerNumber) : undefined,
        position: newPlayerPosition,
        nationality: countryCode,
        activeSeasons: [newPlayerSeason],
      })
      setNewPlayerName('')
      setNewPlayerNumber('')
    } catch (err: unknown) {
      console.error('Inline add player error:', err)
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Unable to add player.'
      setSquadActionError(msg)
    } finally {
      setAddingPlayer(false)
    }
  }

  return (
    <Modal title={initial ? `Manage Club: ${initial.name}` : 'Register New Club'} onClose={onClose}>
      <div className="tabbed-modal-container">
        <div className="modal-tabs-header">
          <button
            type="button"
            className={tab === 'identity' ? 'active' : ''}
            onClick={() => setTab('identity')}
          >
            1. Identity & Crest
          </button>
          <button
            type="button"
            className={tab === 'staff' ? 'active' : ''}
            onClick={() => setTab('staff')}
          >
            2. Staff & Bio
          </button>
          <button
            type="button"
            className={tab === 'tournament' ? 'active' : ''}
            onClick={() => setTab('tournament')}
          >
            3. Tournament & Group
          </button>
          {initial && (
            <button
              type="button"
              className={tab === 'squad' ? 'active' : ''}
              onClick={() => setTab('squad')}
            >
              4. Squad Roster ({players.length})
            </button>
          )}
        </div>

        {/* LIVE CLUB BRANDING PREVIEW STRIP */}
        <div className="club-preview-banner">
          <div className="preview-crest">
            <TeamMark
              name={name || 'TEAM'}
              color={color}
              secondaryColor={secondaryColor}
              logoUrl={logoUrl}
              size="lg"
            />
          </div>
          <div className="preview-info">
            <div className="preview-name-row">
              <h3>{name || 'Club Name'}</h3>
              {shortName && <span className="short-pill">{shortName}</span>}
              <span className="preview-country-flag">{selectedCountry.flag} {selectedCountry.name}</span>
            </div>
            <span className="preview-colors-hint">
              Primary: <i style={{ background: color }} /> Secondary: <i style={{ background: secondaryColor }} />
            </span>
          </div>
          <div className="preview-squad-status">
            {players.length >= 5 ? (
              <span className="squad-badge complete">✅ Squad Complete ({players.length}/5 min)</span>
            ) : (
              <span className="squad-badge incomplete">⚠️ {players.length}/5 (Min 5 players needed)</span>
            )}
          </div>
        </div>

        <form className="admin-form" onSubmit={submit}>
          {tab === 'identity' && (
            <>
              <label>
                Club Full Name *
                <input
                  name="name"
                  value={name}
                  onChange={(e) => setName(e.target.value.toUpperCase())}
                  placeholder="e.g. NOVA FC"
                  required
                />
              </label>

              <label>
                Short Name / Code (3-4 chars)
                <input
                  name="shortName"
                  value={shortName}
                  onChange={(e) => setShortName(e.target.value.toUpperCase())}
                  placeholder="e.g. NOV"
                  maxLength={5}
                />
              </label>

              <label className="span-2">
                Country / Flag *
                <select value={countryCode} onChange={(e) => setCountryCode(e.target.value)}>
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </label>

              <TeamLogoPicker
                value={logoUrl}
                onChange={(val) => setLogoUrl(val)}
                teamName={name}
                teamColor={color}
              />

              <label>
                Primary Club Color *
                <div className="color-input-wrapper">
                  <input
                    name="color"
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                  />
                  <input
                    type="text"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="hex-text"
                  />
                </div>
              </label>

              <label>
                Secondary Accent Color
                <div className="color-input-wrapper">
                  <input
                    name="secondaryColor"
                    type="color"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                  />
                  <input
                    type="text"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="hex-text"
                  />
                </div>
              </label>
            </>
          )}

          {tab === 'staff' && (
            <>
              <label>
                Manager / Director Name
                <input
                  name="managerName"
                  defaultValue={initial?.managerName ?? ''}
                  placeholder="e.g. Ahmet Yılmaz"
                />
              </label>

              <label>
                Head Coach Name
                <input
                  name="coachName"
                  defaultValue={initial?.coachName ?? ''}
                  placeholder="e.g. Roberto Mancini"
                />
              </label>

              <label className="span-2">
                Club Biography & Background
                <textarea
                  name="bio"
                  rows={4}
                  defaultValue={initial?.bio ?? ''}
                  placeholder="Brief description of the club, corporate background, and history..."
                />
              </label>
            </>
          )}

          {tab === 'tournament' && (
            <>
              <label className="span-2">
                Turnuva / Sezon (Kayıtlı Sezon Seçin) *
                <select
                  name="seasonId"
                  value={selectedSeasonId}
                  onChange={(e) => setSelectedSeasonId(Number(e.target.value))}
                >
                  {seasons.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.year} - {s.fullName || s.name || s.city} (
                      {s.seasonType === 'tournament'
                        ? '🏆 Eleme Ağacı'
                        : s.seasonType === 'league'
                        ? '📋 Lig Sıralaması'
                        : '👥 Çoklu Grup'}
                      {s.isActive ? ' • Aktif' : ''})
                    </option>
                  ))}
                </select>
              </label>

              <label className="span-2 checkbox-label">
                <input
                  name="isActive"
                  type="checkbox"
                  defaultChecked={initial?.isActive !== false}
                />
                <span>
                  {currentSelectedSeason
                    ? `${currentSelectedSeason.year} (${currentSelectedSeason.name || currentSelectedSeason.city}) Sezonu İçin Aktif Olarak İşaretle`
                    : 'Aktif Sezon Olarak İşaretle'}
                </span>
              </label>
            </>
          )}

          {tab === 'squad' && initial && (
            <div className="span-2 in-modal-squad-container">
              {/* SQUAD ADD MODE SWITCHER */}
              <div className="squad-add-mode-toggle">
                {onOpenSquadCanvas && (
                  <button
                    type="button"
                    className="mode-btn"
                    style={{ background: '#0284c7', color: '#fff', border: '1px solid #0284c7' }}
                    onClick={() => {
                      onClose()
                      onOpenSquadCanvas(initial)
                    }}
                  >
                    <Sparkles size={14} /> 🎨 Görsel Saha Tuvali (Interactive Pitch)
                  </button>
                )}
                <button
                  type="button"
                  className={`mode-btn ${squadAddMode === 'pool' ? 'active' : ''}`}
                  onClick={() => setSquadAddMode('pool')}
                >
                  👥 Havuzdan Mevcut Oyuncu Ekle ({availablePoolPlayers.length})
                </button>
                <button
                  type="button"
                  className={`mode-btn ${squadAddMode === 'new' ? 'active' : ''}`}
                  onClick={() => setSquadAddMode('new')}
                >
                  ➕ Sıfırdan Yeni Oyuncu Oluştur
                </button>
              </div>

              {squadAddMode === 'pool' ? (
                <div className="inline-add-player-box">
                  <h4>Mevcut Oyuncu Havuzundan {initial.name} Kadrosuna Aktar</h4>
                  <div className="inline-player-fields">
                    <input
                      type="text"
                      placeholder="Oyuncu ara (isim, eski takım, mevki)..."
                      value={poolPlayerSearch}
                      onChange={(e) => setPoolPlayerSearch(e.target.value)}
                      style={{ flex: 1, minWidth: '180px' }}
                    />
                    <select
                      value={selectedPoolPlayerId}
                      onChange={(e) => setSelectedPoolPlayerId(e.target.value ? Number(e.target.value) : '')}
                      style={{ flex: 1.5, minWidth: '220px' }}
                    >
                      <option value="">
                        {filteredPoolPlayers.length === 0
                          ? 'Havuzda eklenebilir uygun oyuncu bulunamadı'
                          : `-- Kadroya Eklenecek Oyuncuyu Seçin (${filteredPoolPlayers.length}) --`}
                      </option>
                      {filteredPoolPlayers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.fullName} ({p.position.toUpperCase()}) · Şu anki takım: {p.teamName || 'Serbest'}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="button button-admin"
                      onClick={handleAssignPoolPlayer}
                      disabled={assigningPoolPlayer || !selectedPoolPlayerId}
                    >
                      {assigningPoolPlayer ? 'Ekleniyor…' : '+ Kadroya Dahil Et'}
                    </button>
                  </div>
                  {squadActionError ? <div className="form-error" style={{ marginTop: '8px' }}>{squadActionError}</div> : null}
                </div>
              ) : (
                <div className="inline-add-player-box">
                  <h4>{initial.name} İçin Yeni Oyuncu Kaydet</h4>
                  <div className="inline-player-fields">
                    <input
                      placeholder="Oyuncu Ad Soyad *"
                      value={newPlayerName}
                      onChange={(e) => setNewPlayerName(e.target.value)}
                    />
                    <input
                      type="number"
                      min={1}
                      max={99}
                      placeholder="Forma #"
                      value={newPlayerNumber}
                      onChange={(e) => setNewPlayerNumber(e.target.value)}
                      style={{ width: '85px' }}
                    />
                    <select
                      value={newPlayerPosition}
                      onChange={(e) => setNewPlayerPosition(e.target.value as PlayerPosition)}
                    >
                      <option value="goalkeeper">🧤 Goalkeeper</option>
                      <option value="defender">🛡️ Defender</option>
                      <option value="midfielder">⚙️ Midfielder</option>
                      <option value="forward">⚡ Forward</option>
                    </select>
                    <select
                      value={newPlayerSeason}
                      onChange={(e) => setNewPlayerSeason(e.target.value)}
                    >
                      {availableSeasonNames.map((s) => (
                        <option key={s} value={s}>
                          📅 {s}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="button button-admin"
                      onClick={handleInlineAddPlayer}
                      disabled={addingPlayer || !newPlayerName.trim()}
                    >
                      {addingPlayer ? 'Ekleniyor…' : '+ Kadroya Ekle'}
                    </button>
                  </div>
                  {squadActionError ? <div className="form-error" style={{ marginTop: '8px' }}>{squadActionError}</div> : null}
                </div>
              )}

              {/* SQUAD BY POSITION */}
              <div className="modal-squad-grouped">
                {(['goalkeeper', 'defender', 'midfielder', 'forward'] as PlayerPosition[]).map((pos) => {
                  const posPlayers = players.filter((p) => p.position === pos)
                  const posLabels = {
                    goalkeeper: '🧤 Goalkeepers',
                    defender: '🛡️ Defenders',
                    midfielder: '⚙️ Midfielders',
                    forward: '⚡ Forwards',
                  }

                  return (
                    <div key={pos} className="pos-group-section">
                      <h5>
                        {posLabels[pos]} ({posPlayers.length})
                      </h5>
                      {posPlayers.length === 0 ? (
                        <p className="no-pos-players">No {pos}s registered yet.</p>
                      ) : (
                        <div className="pos-players-list">
                          {posPlayers.map((p) => (
                            <div key={p.id} className="squad-player-item">
                              <span className="shirt-badge">{p.shirtNumber ?? '-'}</span>
                              <div className="squad-player-meta">
                                <strong>{p.fullName}</strong>
                                <span>Active Seasons: {(p.activeSeasons ?? ['2026 - Summer League']).join(', ')}</span>
                              </div>
                              <button
                                type="button"
                                className="delete-player-inline-btn"
                                onClick={() => {
                                  if (onUpdatePlayer) {
                                    void onUpdatePlayer({
                                      ...p,
                                      teamId: 0,
                                      teamName: 'Free Agent',
                                    })
                                  }
                                }}
                                title="Kadrodan Çıkar (Havuzda Bırak)"
                              >
                                <UserMinus size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {saveError ? <div className="form-error span-2">{saveError}</div> : null}

          <div className="form-actions span-2">
            <button type="button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button className="button button-admin" type="submit" disabled={saving}>
              {saving ? 'Saving…' : initial ? 'Save Club Changes' : 'Register Club'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  )
}

// QUICK SQUAD MODAL (Accessible directly from teams table)
function QuickSquadModal({
  team,
  players,
  allPlayers = [],
  seasons,
  onClose,
  onAddPlayer,
  onUpdatePlayer,
  onDeletePlayer,
  onOpenSquadCanvas,
}: {
  team: Team
  players: Player[]
  allPlayers?: Player[]
  seasons: Season[]
  onClose: () => void
  onAddPlayer: (player: Player) => Promise<void>
  onUpdatePlayer?: (player: Player) => Promise<void>
  onDeletePlayer: (id: number) => Promise<void>
  onOpenSquadCanvas?: (team: Team) => void
}) {
  const [squadMode, setSquadMode] = useState<'pool' | 'new'>('pool')
  const [name, setName] = useState('')
  const [number, setNumber] = useState('')
  const [pos, setPos] = useState<PlayerPosition>('forward')
  const [addError, setAddError] = useState('')

  // Pool state
  const [selectedPoolId, setSelectedPoolId] = useState<number | ''>('')
  const [poolSearch, setPoolSearch] = useState('')
  const [assigning, setAssigning] = useState(false)

  const availableSeasonNames = useMemo(() => {
    if (seasons.length === 0) return ['2026 - Summer League']
    return seasons.map((s) => `${s.year} - ${s.fullName || s.name || s.city}`)
  }, [seasons])

  const [selectedSeason, setSelectedSeason] = useState<string>(() => availableSeasonNames[0] || '2026 - Summer League')
  const [adding, setAdding] = useState(false)

  const availablePoolPlayers = useMemo(() => {
    return allPlayers.filter((p) => p.teamId !== team.id && p.teamName !== team.name)
  }, [allPlayers, team])

  const filteredPoolPlayers = useMemo(() => {
    if (!poolSearch.trim()) return availablePoolPlayers
    const q = poolSearch.toLowerCase()
    return availablePoolPlayers.filter(
      (p) =>
        p.fullName.toLowerCase().includes(q) ||
        p.teamName.toLowerCase().includes(q) ||
        p.position.toLowerCase().includes(q)
    )
  }, [availablePoolPlayers, poolSearch])

  const handleAssignPool = async () => {
    if (!selectedPoolId || !onUpdatePlayer) return
    const targetPlayer = allPlayers.find((p) => p.id === Number(selectedPoolId))
    if (!targetPlayer) return

    setAssigning(true)
    setAddError('')
    try {
      await onUpdatePlayer({
        ...targetPlayer,
        teamId: team.id,
        teamName: team.name,
      })
      setSelectedPoolId('')
      setPoolSearch('')
    } catch (err: unknown) {
      console.error('Assign player error:', err)
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Unable to assign player.'
      setAddError(msg)
    } finally {
      setAssigning(false)
    }
  }

  const handleAdd = async () => {
    if (!name.trim()) return
    setAdding(true)
    setAddError('')
    try {
      await onAddPlayer({
        id: Date.now(),
        teamId: team.id,
        teamName: team.name,
        fullName: name.trim(),
        shirtNumber: number ? Number(number) : undefined,
        position: pos,
        nationality: team.countryCode,
        activeSeasons: [selectedSeason],
      })
      setName('')
      setNumber('')
    } catch (err: unknown) {
      console.error('Add player error:', err)
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Unable to add player to squad.'
      setAddError(msg)
    } finally {
      setAdding(false)
    }
  }

  const country = getCountry(team.countryCode)

  return (
    <Modal title={`Squad Roster Hub: ${team.name}`} onClose={onClose}>
      <div className="quick-squad-modal-inner">
        <div className="quick-squad-header">
          <TeamMark
            name={team.name}
            color={team.color}
            secondaryColor={team.secondaryColor}
            logoUrl={team.logoUrl}
            size="lg"
          />
          <div>
            <h3>{team.name}</h3>
            <span>
              {country.flag} {country.name} · {team.tournamentFormat ?? 'Champions Cup'} ({team.groupName ?? 'Group A'})
            </span>
          </div>
          <div className="header-status">
            {players.length >= 5 ? (
              <span className="squad-badge complete">✅ {players.length} Players (Ready)</span>
            ) : (
              <span className="squad-badge incomplete">⚠️ {players.length}/5 (Min 5 required)</span>
            )}
          </div>
        </div>

        {/* SQUAD ADD MODE SWITCHER */}
        <div className="squad-add-mode-toggle">
          {onOpenSquadCanvas && (
            <button
              type="button"
              className="mode-btn"
              style={{ background: '#0284c7', color: '#fff', border: '1px solid #0284c7' }}
              onClick={() => {
                onClose()
                onOpenSquadCanvas(team)
              }}
            >
              <Sparkles size={14} /> 🎨 Görsel Saha Tuvali (Interactive Pitch)
            </button>
          )}
          <button
            type="button"
            className={`mode-btn ${squadMode === 'pool' ? 'active' : ''}`}
            onClick={() => setSquadMode('pool')}
          >
            👥 Havuzdan Mevcut Oyuncu Ekle ({availablePoolPlayers.length})
          </button>
          <button
            type="button"
            className={`mode-btn ${squadMode === 'new' ? 'active' : ''}`}
            onClick={() => setSquadMode('new')}
          >
            ➕ Sıfırdan Yeni Oyuncu Oluştur
          </button>
        </div>

        {squadMode === 'pool' ? (
          <div className="inline-add-player-box">
            <h4>Mevcut Oyuncu Havuzundan {team.name} Kadrosuna Aktar</h4>
            <div className="inline-player-fields">
              <input
                type="text"
                placeholder="Oyuncu ara (isim, eski takım, mevki)..."
                value={poolSearch}
                onChange={(e) => setPoolSearch(e.target.value)}
                style={{ flex: 1, minWidth: '180px' }}
              />
              <select
                value={selectedPoolId}
                onChange={(e) => setSelectedPoolId(e.target.value ? Number(e.target.value) : '')}
                style={{ flex: 1.5, minWidth: '220px' }}
              >
                <option value="">
                  {filteredPoolPlayers.length === 0
                    ? 'Havuzda uygun oyuncu bulunamadı'
                    : `-- Kadroya Eklenecek Oyuncuyu Seçin (${filteredPoolPlayers.length}) --`}
                </option>
                {filteredPoolPlayers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName} ({p.position.toUpperCase()}) · Şu anki takım: {p.teamName || 'Serbest'}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="button button-admin"
                onClick={handleAssignPool}
                disabled={assigning || !selectedPoolId}
              >
                {assigning ? 'Ekleniyor…' : '+ Kadroya Dahil Et'}
              </button>
            </div>
            {addError ? <div className="form-error" style={{ marginTop: '8px' }}>{addError}</div> : null}
          </div>
        ) : (
          <div className="inline-add-player-box">
            <h4>{team.name} İçin Yeni Oyuncu Kaydet</h4>
            <div className="inline-player-fields">
              <input
                placeholder="Player Full Name *"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <input
                type="number"
                min={1}
                max={99}
                placeholder="Shirt #"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                style={{ width: '85px' }}
              />
              <select value={pos} onChange={(e) => setPos(e.target.value as PlayerPosition)}>
                <option value="goalkeeper">🧤 Goalkeeper</option>
                <option value="defender">🛡️ Defender</option>
                <option value="midfielder">⚙️ Midfielder</option>
                <option value="forward">⚡ Forward</option>
              </select>
              <select value={selectedSeason} onChange={(e) => setSelectedSeason(e.target.value)}>
                {availableSeasonNames.map((s) => (
                  <option key={s} value={s}>
                    📅 {s}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="button button-admin"
                onClick={handleAdd}
                disabled={adding || !name.trim()}
              >
                {adding ? 'Adding…' : '+ Register'}
              </button>
            </div>
            {addError ? <div className="form-error" style={{ marginTop: '8px' }}>{addError}</div> : null}
          </div>
        )}

        {/* FULL SQUAD LIST */}
        <div className="quick-squad-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>#</th>
                <th>PLAYER</th>
                <th>POSITION</th>
                <th>PLAYED SEASONS</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.id}>
                  <td>
                    <span className="shirt-badge">{p.shirtNumber ?? '-'}</span>
                  </td>
                  <td>
                    <strong>{p.fullName}</strong>
                  </td>
                  <td>
                    <span className={`position-tag ${p.position}`}>
                      {p.position.slice(0, 3).toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <div className="season-tags-list">
                      {(p.activeSeasons && p.activeSeasons.length > 0 ? p.activeSeasons : ['2026 - Summer League']).map((s) => (
                        <span key={s} className="season-pill">{s}</span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <button
                      className="row-action danger"
                      onClick={() => {
                        if (onUpdatePlayer) {
                          void onUpdatePlayer({
                            ...p,
                            teamId: 0,
                            teamName: 'Free Agent',
                          })
                        }
                      }}
                      title="Kadrodan Çıkar (Havuzda Bırak)"
                    >
                      <UserMinus size={14} /> Kadrodan Çıkar
                    </button>
                  </td>
                </tr>
              ))}
              {players.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: '#8c9bad' }}>
                    No players registered in this squad yet. Use the form above to add the starting 5+ players.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  )
}

function MatchForm({
  teams,
  onClose,
  onSave,
}: {
  teams: Team[]
  onClose: () => void
  onSave: (match: Match) => Promise<void>
}) {
  const names = useMemo(() => teams.map((team) => team.name), [teams])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setSaveError('')
    const data = new FormData(event.currentTarget)
    const home = String(data.get('home'))
    const away = String(data.get('away'))
    if (home === away) {
      setSaveError('Home and Away teams must be different.')
      setSaving(false)
      return
    }
    try {
      await onSave({
        id: Date.now(),
        home,
        away,
        stage: String(data.get('stage')),
        date: String(data.get('date')),
        time: String(data.get('time')),
        venue: String(data.get('venue')),
        referee: String(data.get('referee')) || undefined,
        matchStatus: 'scheduled',
        status: String(data.get('status')) as Match['status'],
        events: [],
      })
      onClose()
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : 'Unable to create match.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Create match fixture" onClose={onClose}>
      <form className="admin-form" onSubmit={submit}>
        <label>
          Home team
          <select name="home" defaultValue={names[0]}>
            {names.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          Away team
          <select name="away" defaultValue={names[1] ?? names[0]}>
            {names.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          Stage
          <input name="stage" defaultValue="Group A" required />
        </label>
        <label>
          Venue
          <input name="venue" defaultValue="Central Arena" required />
        </label>
        <label>
          Date
          <input name="date" defaultValue="18 Aug" placeholder="e.g. 18 Aug" required />
        </label>
        <label>
          Kickoff Time
          <input name="time" type="time" defaultValue="20:30" required />
        </label>
        <label className="span-2">
          Referee Name
          <input name="referee" placeholder="e.g. Mehmet Ali Yılmaz" />
        </label>
        <label className="span-2">
          Publication Status
          <select name="status">
            <option>Scheduled</option>
            <option>Draft</option>
          </select>
        </label>
        {saveError ? <div className="form-error span-2">{saveError}</div> : null}
        <FormActions onClose={onClose} label="Create fixture" saving={saving} />
      </form>
    </Modal>
  )
}

function MatchScoreModal({
  match,
  teams,
  onClose,
  onSave,
}: {
  match: Match
  teams: Team[]
  onClose: () => void
  onSave: (match: Match) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setSaveError('')
    const data = new FormData(event.currentTarget)
    const homeScoreVal = data.get('homeScore')
    const awayScoreVal = data.get('awayScore')

    try {
      await onSave({
        ...match,
        stage: String(data.get('stage')),
        venue: String(data.get('venue')),
        date: String(data.get('date')),
        time: String(data.get('time')),
        referee: String(data.get('referee')) || undefined,
        matchStatus: String(data.get('matchStatus')) as MatchStatus,
        homeScore: homeScoreVal !== '' ? Number(homeScoreVal) : undefined,
        awayScore: awayScoreVal !== '' ? Number(awayScoreVal) : undefined,
        status: String(data.get('status')) as Match['status'],
      })
      onClose()
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : 'Unable to update match.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`Match Scorekeeper: ${match.home} vs ${match.away}`} onClose={onClose}>
      <form className="admin-form" onSubmit={submit}>
        <div className="scorekeeper-banner span-2">
          <div className="scorekeeper-team">
            <TeamMark name={match.home} />
            <strong>{match.home}</strong>
            <input
              type="number"
              name="homeScore"
              defaultValue={match.homeScore ?? ''}
              placeholder="0"
              min={0}
              className="score-input"
            />
          </div>
          <span className="score-divider">:</span>
          <div className="scorekeeper-team">
            <input
              type="number"
              name="awayScore"
              defaultValue={match.awayScore ?? ''}
              placeholder="0"
              min={0}
              className="score-input"
            />
            <strong>{match.away}</strong>
            <TeamMark name={match.away} />
          </div>
        </div>

        <label>
          Match Status
          <select name="matchStatus" defaultValue={match.matchStatus}>
            <option value="scheduled">Scheduled</option>
            <option value="live">Live (In Progress)</option>
            <option value="completed">Completed (Final)</option>
            <option value="postponed">Postponed</option>
          </select>
        </label>

        <label>
          Stage
          <input name="stage" defaultValue={match.stage} required />
        </label>

        <label>
          Date
          <input name="date" defaultValue={match.date} required />
        </label>

        <label>
          Time
          <input name="time" defaultValue={match.time} required />
        </label>

        <label>
          Venue
          <input name="venue" defaultValue={match.venue} required />
        </label>

        <label>
          Referee
          <input name="referee" defaultValue={match.referee ?? ''} placeholder="Referee Name" />
        </label>

        <label className="span-2">
          Public Visibility
          <select name="status" defaultValue={match.status}>
            <option value="Scheduled">Scheduled (Visible)</option>
            <option value="Draft">Draft (Hidden from public)</option>
          </select>
        </label>

        {saveError ? <div className="form-error span-2">{saveError}</div> : null}
        <FormActions onClose={onClose} label="Save match result" saving={saving} />
      </form>
    </Modal>
  )
}

function MatchEventsModal({
  match,
  players,
  onClose,
  onAddEvent,
  onDeleteEvent,
}: {
  match: Match
  players: Player[]
  onClose: () => void
  onAddEvent: (event: MatchEvent) => Promise<void>
  onDeleteEvent: (eventId: number) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [selectedTeam, setSelectedTeam] = useState<string>(match.home)

  const matchPlayers = useMemo(() => {
    return players.filter((p) => p.teamName === selectedTeam)
  }, [players, selectedTeam])

  const submitEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    const data = new FormData(event.currentTarget)
    try {
      await onAddEvent({
        id: Date.now(),
        matchId: match.id,
        teamName: selectedTeam,
        playerName: String(data.get('playerName')),
        eventType: String(data.get('eventType')) as MatchEventType,
        minute: Number(data.get('minute')),
        notes: String(data.get('notes')) || undefined,
      })
      event.currentTarget.reset()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`Match Events Timeline: ${match.home} vs ${match.away}`} onClose={onClose}>
      <div className="match-events-container">
        <div className="current-events-list">
          <h3>Logged Events ({(match.events ?? []).length})</h3>
          {(match.events ?? []).length === 0 ? (
            <p className="empty-text">No events logged yet for this match.</p>
          ) : (
            <div className="events-timeline">
              {match.events?.map((ev) => (
                <div className="event-item" key={ev.id}>
                  <span className="event-minute">{ev.minute}'</span>
                  <span className={`event-type-badge ${ev.eventType}`}>{ev.eventType.replace('_', ' ')}</span>
                  <div className="event-details">
                    <strong>{ev.playerName}</strong>
                    <span>({ev.teamName})</span>
                    {ev.notes && <small>— {ev.notes}</small>}
                  </div>
                  <button
                    className="delete-event-btn"
                    onClick={() => void onDeleteEvent(ev.id)}
                    title="Remove event"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="add-event-section">
          <h3>Log New Event</h3>
          <form className="admin-form" onSubmit={submitEvent}>
            <label>
              Team
              <select value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)}>
                <option value={match.home}>{match.home}</option>
                <option value={match.away}>{match.away}</option>
              </select>
            </label>

            <label>
              Player
              {matchPlayers.length > 0 ? (
                <select name="playerName" required>
                  {matchPlayers.map((p) => (
                    <option key={p.id} value={p.fullName}>
                      #{p.shirtNumber ?? '-'} {p.fullName}
                    </option>
                  ))}
                </select>
              ) : (
                <input name="playerName" placeholder="Player name" required />
              )}
            </label>

            <label>
              Event Type
              <select name="eventType">
                <option value="goal">⚽ Goal</option>
                <option value="penalty_scored">🎯 Penalty Scored</option>
                <option value="yellow_card">🟨 Yellow Card</option>
                <option value="red_card">🟥 Red Card</option>
                <option value="substitution">🔄 Substitution</option>
              </select>
            </label>

            <label>
              Minute (0 - 120)
              <input name="minute" type="number" min={1} max={120} defaultValue={45} required />
            </label>

            <label className="span-2">
              Notes (e.g. Header, Assist, Free kick)
              <input name="notes" placeholder="Optional notes" />
            </label>

            <div className="form-actions span-2">
              <button className="button button-admin" type="submit" disabled={saving}>
                {saving ? 'Adding…' : 'Add Event to Timeline'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Modal>
  )
}

function PlayerForm({
  initial,
  teams,
  seasons,
  onClose,
  onSave,
}: {
  initial: Player | null
  teams: Team[]
  seasons: Season[]
  onClose: () => void
  onSave: (player: Player) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const availableSeasonNames = useMemo(() => {
    if (seasons.length === 0) return ['2026 - Summer League']
    return seasons.map((s) => `${s.year} - ${s.fullName || s.name || s.city}`)
  }, [seasons])

  const [selectedSeasons, setSelectedSeasons] = useState<string[]>(() => {
    if (initial?.activeSeasons && initial.activeSeasons.length > 0) return initial.activeSeasons
    return [availableSeasonNames[0] || '2026 - Summer League']
  })

  const toggleSeason = (season: string) => {
    if (selectedSeasons.includes(season)) {
      if (selectedSeasons.length === 1) return
      setSelectedSeasons(selectedSeasons.filter((s) => s !== season))
    } else {
      setSelectedSeasons([...selectedSeasons, season])
    }
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setSaveError('')
    const data = new FormData(event.currentTarget)
    const teamIdVal = data.get('teamId')
    const teamId = teamIdVal && Number(teamIdVal) > 0 ? Number(teamIdVal) : 0
    const foundTeam = teamId > 0 ? teams.find((t) => t.id === teamId) : undefined

    try {
      await onSave({
        id: initial?.id ?? Date.now(),
        teamId: teamId > 0 ? teamId : 0,
        teamName: foundTeam ? foundTeam.name : 'Free Agent',
        fullName: String(data.get('fullName')),
        shirtNumber: data.get('shirtNumber') ? Number(data.get('shirtNumber')) : undefined,
        position: String(data.get('position')) as PlayerPosition,
        birthYear: data.get('birthYear') ? Number(data.get('birthYear')) : undefined,
        nationality: foundTeam?.countryCode ?? 'TR',
        isCaptain: data.get('isCaptain') === 'on',
        activeSeasons: selectedSeasons,
      })
      onClose()
    } catch (reason: unknown) {
      console.error('Player save failed:', reason)
      const msg =
        reason instanceof Error
          ? reason.message
          : typeof reason === 'object' && reason !== null && 'message' in reason
          ? String((reason as { message: unknown }).message)
          : 'Unable to save player.'
      setSaveError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={initial ? `Edit Player: ${initial.fullName}` : 'Register New Player'} onClose={onClose}>
      <form className="admin-form" onSubmit={submit}>
        <label className="span-2">
          Full Name *
          <input name="fullName" defaultValue={initial?.fullName ?? ''} placeholder="e.g. Emre Yılmaz" required />
        </label>

        <label>
          Assigned Club / Team
          <select name="teamId" defaultValue={initial?.teamId ? String(initial.teamId) : ''}>
            <option value="">🚫 Kulüpsüz / Serbest Oyuncu (No Club / Free Agent)</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({getCountry(t.countryCode).flag})
              </option>
            ))}
          </select>
        </label>

        <label>
          Shirt Number (1–99)
          <input
            name="shirtNumber"
            type="number"
            min={1}
            max={99}
            defaultValue={initial?.shirtNumber ?? ''}
            placeholder="10"
          />
        </label>

        <label>
          Position
          <select name="position" defaultValue={initial?.position ?? 'forward'}>
            <option value="goalkeeper">🧤 Goalkeeper (GK)</option>
            <option value="defender">🛡️ Defender (DEF)</option>
            <option value="midfielder">⚙️ Midfielder (MID)</option>
            <option value="forward">⚡ Forward (FWD)</option>
          </select>
        </label>

        <label>
          Birth Year
          <input
            name="birthYear"
            type="number"
            min={1960}
            max={2015}
            defaultValue={initial?.birthYear ?? 1996}
            placeholder="1996"
          />
        </label>

        {/* PLAYED SEASONS PICKER */}
        <div className="span-2 season-picker-field">
          <span className="field-label">Played Seasons of Year * (Select all that apply)</span>
          <div className="season-picker-chips">
            {availableSeasonNames.map((season) => {
              const isSelected = selectedSeasons.includes(season)
              return (
                <button
                  key={season}
                  type="button"
                  className={`season-chip-btn ${isSelected ? 'active' : ''}`}
                  onClick={() => toggleSeason(season)}
                >
                  {isSelected ? '✓ ' : '+ '} {season}
                </button>
              )
            })}
          </div>
        </div>

        <label className="checkbox-label span-2">
          <input
            name="isCaptain"
            type="checkbox"
            defaultChecked={initial?.isCaptain}
          />
          <span>Team Captain (C)</span>
        </label>

        {saveError ? <div className="form-error span-2">{saveError}</div> : null}
        <FormActions onClose={onClose} label={initial ? 'Save Changes' : 'Register Player'} saving={saving} />
      </form>
    </Modal>
  )
}

function StoryForm({
  initial,
  onClose,
  onSave,
}: {
  initial: Story | null
  onClose: () => void
  onSave: (story: Story) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setSaveError('')
    const data = new FormData(event.currentTarget)
    try {
      await onSave({
        id: initial?.id ?? Date.now(),
        title: String(data.get('title')),
        category: String(data.get('category')) as StoryCategory,
        summary: String(data.get('summary')) || undefined,
        body: String(data.get('body')) || undefined,
        coverImageUrl: String(data.get('coverImageUrl')) || undefined,
        status: String(data.get('status')) as Story['status'],
        publishedAt: initial?.publishedAt ?? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date()),
      })
      onClose()
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : 'Unable to save story.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={initial ? 'Edit Story Article' : 'Write New Story'} onClose={onClose}>
      <form className="admin-form" onSubmit={submit}>
        <label className="span-2">
          Headline / Title *
          <input name="title" defaultValue={initial?.title ?? ''} placeholder="Enter article headline" required />
        </label>

        <label>
          Category
          <select name="category" defaultValue={initial?.category ?? 'news'}>
            <option value="news">News</option>
            <option value="match_report">Match Report</option>
            <option value="announcement">Announcement</option>
            <option value="press">Press Conference</option>
            <option value="panorama">Weekly Panorama</option>
          </select>
        </label>

        <label>
          Publication Status
          <select name="status" defaultValue={initial?.status ?? 'Published'}>
            <option value="Published">Published</option>
            <option value="Draft">Draft</option>
            <option value="Scheduled">Scheduled</option>
          </select>
        </label>

        <label className="span-2">
          Cover Image URL (Optional)
          <input
            name="coverImageUrl"
            defaultValue={initial?.coverImageUrl ?? ''}
            placeholder="e.g. /assets/ccl-celebration.png"
          />
        </label>

        <label className="span-2">
          Summary (Brief teaser)
          <textarea
            name="summary"
            rows={2}
            defaultValue={initial?.summary ?? ''}
            placeholder="One or two sentences summarizing the story..."
          />
        </label>

        <label className="span-2">
          Full Article Body
          <textarea
            name="body"
            rows={6}
            defaultValue={initial?.body ?? ''}
            placeholder="Write the full match report or article here..."
          />
        </label>

        {saveError ? <div className="form-error span-2">{saveError}</div> : null}
        <FormActions onClose={onClose} label={initial ? 'Update Story' : 'Publish Story'} saving={saving} />
      </form>
    </Modal>
  )
}

function FormActions({ onClose, label, saving }: { onClose: () => void; label: string; saving: boolean }) {
  return (
    <div className="form-actions span-2">
      <button type="button" onClick={onClose} disabled={saving}>
        Cancel
      </button>
      <button className="button button-admin" type="submit" disabled={saving}>
        {saving ? 'Saving…' : label}
      </button>
    </div>
  )
}



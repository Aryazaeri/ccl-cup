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
  Ban,
  Check,
  ExternalLink,
  MessageSquare,
  Shield,
  ShieldCheck,
  Sparkles,
  Trash2,
  Trophy,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { can, type AuthProfile, type PermissionArea } from '../auth/AuthContext'
import { COUNTRIES, getCountry } from '../lib/countries'
import { generateEmptyBracket } from '../lib/bracketUtils'
import { generateEmptyLeague } from '../lib/leagueUtils'
import { generateEmptyGroupLeague } from '../lib/groupLeagueUtils'
import { computeGroupStandings, computeTopScorers, isCountableMatch } from '../lib/standingsUtils'
import {
  mediaRepository,
  moderationRepository,
  sponsorsRepository,
  usersRepository,
} from '../services/tournamentRepository'
import {
  AVAILABLE_SEASONS,
  HOST_CITIES,
  type AdminSection,
  type Match,
  type MatchEvent,
  type MatchEventType,
  type MatchStatus,
  type MediaAsset,
  type MediaKind,
  type Player,
  type PlayerPosition,
  type AdminUser,
  type Comment,
  type Season,
  type SeasonGroupLeague,
  type SeasonLeague,
  type SeasonType,
  type Sponsor,
  type Story,
  type StoryCategory,
  type StrongFoot,
  type Team,
  type TournamentBracket,
  type TournamentFormat,
} from '../types'
import { BracketCanvasModal } from './BracketCanvasModal'
import { useConfirm } from './ConfirmDialog'
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
  media: MediaAsset[]
  sponsors: Sponsor[]
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
  onRefresh: () => Promise<void>
  onSignOut: () => Promise<void>
  onViewSite: () => void
}

// `area` names the permission that governs each screen. Overview has none —
// it is read-only and safe for every staff role.
const sections: { label: AdminSection; icon: typeof Home; area?: PermissionArea }[] = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Seasons', icon: Trophy, area: 'seasons' },
  { label: 'Teams', icon: Shield, area: 'teams' },
  { label: 'Players', icon: CircleUserRound, area: 'players' },
  { label: 'Matches', icon: CalendarDays, area: 'matches' },
  { label: 'Standings', icon: BarChart3, area: 'standings' },
  { label: 'Content', icon: Newspaper, area: 'content' },
  { label: 'Comments', icon: MessageSquare, area: 'content' },
  { label: 'Media', icon: Image, area: 'media' },
  { label: 'Sponsors', icon: Sparkles, area: 'sponsors' },
  { label: 'Users', icon: Users, area: 'users' },
]

export function AdminPanel({
  seasons,
  teams,
  players,
  matches,
  stories,
  media,
  sponsors,
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
  onRefresh,
  onSignOut,
  onViewSite,
}: Props) {
  const [section, setSection] = useState<AdminSection>('Overview')

  // The database enforces this for real via RLS; hiding the screens keeps the
  // panel from offering actions that would only come back as an error.
  const visibleSections = useMemo(
    () => sections.filter(({ area }) => !area || can(profile.role, area)),
    [profile.role],
  )

  // A role change (or a deep link) must never strand someone on a screen they
  // are no longer allowed to see.
  const activeSection = visibleSections.some((entry) => entry.label === section) ? section : 'Overview'

  const allowed = (area: PermissionArea) => can(profile.role, area)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [modal, setModal] = useState<'season' | 'match' | 'team' | 'player' | 'story' | null>(null)
  const [editingSeason, setEditingSeason] = useState<Season | null>(null)
  const [bracketSeason, setBracketSeason] = useState<Season | null>(null)
  const [leagueSeason, setLeagueSeason] = useState<Season | null>(null)
  const [groupLeagueSeason, setGroupLeagueSeason] = useState<Season | null>(null)
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null)
  const [editingTeam, setEditingTeam] = useState<Team | null>(null)
  const [squadTeam, setSquadTeam] = useState<Team | null>(null)

  const { confirm, confirmDialog } = useConfirm()

  /* ---------------------------------------------------------------- *
   * Guarded deletes
   *
   * The raw onDelete* handlers are never passed to a screen. Each is wrapped
   * here so confirmation happens at one choke point, and the wording states
   * what the database will actually cascade — verified against the foreign
   * keys rather than assumed.
   * ---------------------------------------------------------------- */

  const confirmDeleteSeason = async (id: number) => {
    const season = seasons.find((item) => item.id === id)
    const label = season ? `${season.year} ${season.name}` : 'this season'
    const seasonTeams = teams.filter((team) => team.seasonId === id)
    const teamNames = new Set(seasonTeams.map((team) => team.name))
    const seasonPlayers = players.filter((player) => teamNames.has(player.teamName))

    // Only state counts when clubs actually carry a season. Browser-local data
    // has no seasonId, and reporting "0 clubs will be deleted" while clubs
    // exist would understate the damage — worse than giving no number at all.
    const countsAreKnown = teams.some((team) => team.seasonId != null)
    const cascadeLines = countsAreKnown
      ? [
          `${seasonTeams.length} club${seasonTeams.length === 1 ? '' : 's'} will be deleted`,
          `${seasonPlayers.length} player${seasonPlayers.length === 1 ? '' : 's'} will be deleted with those clubs`,
        ]
      : ['Every club in this season is deleted, and its players with it']

    const ok = await confirm({
      title: 'Delete season',
      body: (
        <>
          Delete <strong>{label}</strong> and everything recorded under it?
        </>
      ),
      consequences: [
        ...cascadeLines,
        'Every fixture in this season is deleted, along with its match events',
        'Groups and sponsors attached to this season are deleted',
      ],
      confirmLabel: 'Delete season',
      requireTyping: season?.name,
    })
    if (ok) await onDeleteSeason(id)
  }

  const confirmDeleteTeam = async (id: number) => {
    const team = teams.find((item) => item.id === id)
    const label = team?.name ?? 'this club'
    const squad = players.filter((player) => player.teamId === id || player.teamName === team?.name)
    const fixtures = matches.filter((match) => match.home === team?.name || match.away === team?.name)

    // matches.home_team_id / away_team_id are ON DELETE RESTRICT, so the
    // database refuses outright while fixtures exist. Say so up front rather
    // than letting the user hit a raw Postgres error.
    if (fixtures.length > 0) {
      await confirm({
        title: 'Club cannot be deleted',
        body: (
          <>
            <strong>{label}</strong> appears in {fixtures.length} fixture
            {fixtures.length === 1 ? '' : 's'}, and the database refuses to delete a club with a match
            history. Delete or reassign those fixtures first.
          </>
        ),
        confirmLabel: 'Close',
      })
      return
    }

    const ok = await confirm({
      title: 'Delete club',
      body: (
        <>
          Delete <strong>{label}</strong>?
        </>
      ),
      consequences: [
        `${squad.length} registered player${squad.length === 1 ? '' : 's'} will be deleted with the club`,
        'Squad and group assignments are removed',
      ],
      confirmLabel: 'Delete club',
    })
    if (ok) await onDeleteTeam(id)
  }

  const confirmDeletePlayer = async (id: number) => {
    const player = players.find((item) => item.id === id)
    const ok = await confirm({
      title: 'Delete player',
      body: (
        <>
          Delete <strong>{player?.fullName ?? 'this player'}</strong> from {player?.teamName ?? 'the roster'}?
        </>
      ),
      consequences: [
        'Goals and cards already logged stay on the match timeline, recorded under the player name',
        'The link between those events and this record is lost',
      ],
      confirmLabel: 'Delete player',
    })
    if (ok) await onDeletePlayer(id)
  }

  const confirmDeleteMatch = async (id: number) => {
    const match = matches.find((item) => item.id === id)
    const eventCount = match?.events?.length ?? 0
    const played = match?.matchStatus === 'completed'
    const ok = await confirm({
      title: 'Delete fixture',
      body: (
        <>
          Delete <strong>{match ? `${match.home} v ${match.away}` : 'this fixture'}</strong>
          {match?.date ? ` on ${match.date}` : ''}?
        </>
      ),
      consequences: [
        ...(eventCount > 0 ? [`${eventCount} match event${eventCount === 1 ? '' : 's'} will be deleted`] : []),
        ...(played
          ? ['This result counts towards the table — deleting it changes the standings and top scorers']
          : []),
        'Any comments attached to this fixture are deleted',
      ],
      confirmLabel: 'Delete fixture',
    })
    if (ok) await onDeleteMatch(id)
  }

  const confirmDeleteStory = async (id: number) => {
    const story = stories.find((item) => item.id === id)
    const ok = await confirm({
      title: 'Delete story',
      body: (
        <>
          Delete <strong>{story?.title ?? 'this story'}</strong>?
        </>
      ),
      confirmLabel: 'Delete story',
    })
    if (ok) await onDeleteStory(id)
  }

  const confirmDeleteMatchEvent = async (matchId: number, eventId: number) => {
    const match = matches.find((item) => item.id === matchId)
    const event = match?.events?.find((item) => item.id === eventId)
    const ok = await confirm({
      title: 'Delete match event',
      body: (
        <>
          Remove the {event?.eventType.replace('_', ' ') ?? 'event'} for{' '}
          <strong>{event?.playerName ?? 'this player'}</strong>
          {event?.minute ? ` at ${event.minute}'` : ''}?
        </>
      ),
      consequences: ['Top scorers and disciplinary totals are recalculated from the event log'],
      confirmLabel: 'Delete event',
    })
    if (ok) await onDeleteMatchEvent(matchId, eventId)
  }

  const [canvasSquadTeam, setCanvasSquadTeam] = useState<Team | null>(null)
  const [editingMatch, setEditingMatch] = useState<Match | null>(null)
  const [eventMatch, setEventMatch] = useState<Match | null>(null)
  const currentEventMatch = eventMatch
    ? matches.find((match) => match.id === eventMatch.id) ?? eventMatch
    : null
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
          {visibleSections.map(({ label, icon: Icon }) => (
            <button className={activeSection === label ? 'active' : ''} key={label} onClick={() => chooseSection(label)}>
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
          <h1>{activeSection}</h1>
          <div className="admin-top-actions">
            <button className="site-switch" onClick={onViewSite}>
              View site
            </button>
            {/* "Add Club" only belongs on screens where a club is the subject. */}
            {['Overview', 'Teams', 'Players'].includes(activeSection) && allowed('teams') && (
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

          {activeSection === 'Overview' && (
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

          {activeSection === 'Seasons' && (
            <SeasonsManager
              seasons={seasons}
              backend={backend}
              onDelete={confirmDeleteSeason}
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

          {activeSection === 'Teams' && (
            <TeamsManager
              teams={teams}
              players={players}
              onDelete={confirmDeleteTeam}
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

          {activeSection === 'Players' && (
            <PlayersManager
              players={players}
              teams={teams}
              onDelete={confirmDeletePlayer}
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

          {activeSection === 'Matches' && (
            <MatchesManager
              matches={matches}
              onDelete={confirmDeleteMatch}
              onEditMatch={(match) => setEditingMatch(match)}
              onManageEvents={(match) => setEventMatch(match)}
              onAdd={() => setModal('match')}
            />
          )}

          {activeSection === 'Content' && (
            <ContentManager
              stories={stories}
              onToggle={onToggleStory}
              onDelete={confirmDeleteStory}
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

          {activeSection === 'Standings' && (
            <StandingsManager seasons={seasons} teams={teams} players={players} matches={matches} />
          )}

          {activeSection === 'Comments' && <CommentsManager />}

          {activeSection === 'Media' && <MediaManager media={media} onRefresh={onRefresh} />}

          {activeSection === 'Sponsors' && <SponsorsManager sponsors={sponsors} onRefresh={onRefresh} />}

          {activeSection === 'Users' && <UsersManager currentRole={profile.role} />}
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

      {currentEventMatch && (
        <MatchEventsModal
          match={currentEventMatch}
          players={players}
          onClose={() => setEventMatch(null)}
          onAddEvent={(event) => onAddMatchEvent(currentEventMatch.id, event)}
          onDeleteEvent={(eventId) => confirmDeleteMatchEvent(currentEventMatch.id, eventId)}
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
          onDeletePlayer={confirmDeletePlayer}
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
          onDeletePlayer={confirmDeletePlayer}
          onOpenSquadCanvas={(team) => setCanvasSquadTeam(team)}
        />
      )}

      {canvasSquadTeam && (
        <SquadCanvasModal
          team={canvasSquadTeam}
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

      {confirmDialog}
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

function StandingsManager({
  seasons,
  teams,
  players,
  matches,
}: {
  seasons: Season[]
  teams: Team[]
  players: Player[]
  matches: Match[]
}) {
  const [seasonFilter, setSeasonFilter] = useState<number | 'all'>(() => {
    const active = seasons.find((season) => season.isActive)
    return active ? active.id : 'all'
  })

  const selectedSeason = useMemo(
    () => (seasonFilter === 'all' ? null : seasons.find((season) => season.id === seasonFilter) ?? null),
    [seasonFilter, seasons],
  )

  // Scope to the chosen season where clubs carry one. Clubs with no season are
  // kept visible so nothing silently disappears from the table.
  const scopedTeams = useMemo(() => {
    if (!selectedSeason) return teams
    return teams.filter((team) => team.seasonId === undefined || team.seasonId === selectedSeason.id)
  }, [teams, selectedSeason])

  const groups = useMemo(
    () => computeGroupStandings(scopedTeams, matches, selectedSeason),
    [scopedTeams, matches, selectedSeason],
  )

  const topScorers = useMemo(() => computeTopScorers(players, matches, 10), [players, matches])
  const resultsEntered = useMemo(() => matches.filter(isCountableMatch).length, [matches])
  const awaitingResult = Math.max(0, matches.length - resultsEntered)
  const goalsLogged = topScorers.reduce((total, scorer) => total + scorer.goals, 0)

  const metrics = [
    { icon: CheckCircle2, value: resultsEntered, label: 'Results entered' },
    { icon: Clock, value: awaitingResult, label: 'Awaiting result' },
    { icon: BarChart3, value: groups.length, label: groups.length === 1 ? 'Table' : 'Tables' },
    { icon: Flame, value: goalsLogged, label: 'Goals logged' },
  ]

  return (
    <section className="manager-view">
      <div className="manager-head">
        <div>
          <h2>Standings & Statistics</h2>
          <p>
            Calculated automatically from completed results. Tie-breaks: Points → Goal Difference → Goals Scored
            → Head-to-Head.
          </p>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-group">
          <Filter size={16} />
          <span>Season:</span>
          <select
            value={seasonFilter}
            onChange={(e) => setSeasonFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          >
            <option value="all">All seasons</option>
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {season.fullName}
              </option>
            ))}
          </select>
        </div>
      </div>

      <section className="metric-strip">
        {metrics.map(({ icon: Icon, value, label }) => (
          <div key={label}>
            <Icon />
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </section>

      {resultsEntered === 0 ? (
        <section className="admin-panel standings-hint">
          <Info size={16} />
          <span>
            No completed matches yet. Enter a score on the Matches screen and every table below updates
            immediately.
          </span>
        </section>
      ) : null}

      {groups.map((group) => (
        <section className="admin-panel" key={group.groupId}>
          <div className="admin-panel-head">
            <h3>{group.groupName}</h3>
          </div>
          <div className="table-scroll">
            <table className="admin-table standings-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>CLUB</th>
                  <th>P</th>
                  <th>W</th>
                  <th>D</th>
                  <th>L</th>
                  <th>GF</th>
                  <th>GA</th>
                  <th>GD</th>
                  <th>PTS</th>
                  <th>FORM</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.length === 0 ? (
                  <tr>
                    <td colSpan={11}>No clubs assigned to this group yet.</td>
                  </tr>
                ) : (
                  group.rows.map((row) => {
                    const country = getCountry(row.countryCode ?? 'TR')
                    return (
                      <tr key={row.teamId}>
                        <td>{row.position}</td>
                        <td>
                          <span className="team-cell">
                            <TeamMark
                              name={row.teamName}
                              color={row.color}
                              logoUrl={row.logoUrl}
                              countryCode={row.countryCode}
                            />
                            <div className="team-name-cell">
                              <strong>{row.teamName}</strong>
                              <span className="team-flag-country" title={country.name}>
                                {country.flag}
                              </span>
                            </div>
                          </span>
                        </td>
                        <td>{row.played}</td>
                        <td>{row.won}</td>
                        <td>{row.drawn}</td>
                        <td>{row.lost}</td>
                        <td>{row.goalsFor}</td>
                        <td>{row.goalsAgainst}</td>
                        <td>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td>
                        <td>
                          <strong>{row.points}</strong>
                        </td>
                        <td>
                          {row.form.length === 0 ? (
                            <span className="form-empty">—</span>
                          ) : (
                            <span className="form-guide">
                              {row.form.map((result, index) => (
                                <span key={index} className={`form-pip form-pip-${result.toLowerCase()}`}>
                                  {result}
                                </span>
                              ))}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section className="admin-panel">
        <div className="admin-panel-head">
          <h3>Top scorers</h3>
        </div>
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>#</th>
                <th>PLAYER</th>
                <th>CLUB</th>
                <th>GOALS</th>
                <th>YELLOW</th>
                <th>RED</th>
              </tr>
            </thead>
            <tbody>
              {topScorers.length === 0 ? (
                <tr>
                  <td colSpan={6}>No goals logged yet. Add goal events to a completed match to build this list.</td>
                </tr>
              ) : (
                topScorers.map((scorer, index) => (
                  <tr key={`${scorer.playerName}-${scorer.teamName}`}>
                    <td>{index + 1}</td>
                    <td>
                      <strong>{scorer.playerName}</strong>
                      {scorer.playerId === undefined ? (
                        <span className="category-pill" title="No matching player on any roster">
                          unlinked
                        </span>
                      ) : null}
                    </td>
                    <td>{scorer.teamName}</td>
                    <td>
                      <strong>{scorer.goals}</strong>
                    </td>
                    <td>{scorer.yellowCards}</td>
                    <td>{scorer.redCards}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}


/* ------------------------------------------------------------------ *
 * Comment moderation
 *
 * Nothing a visitor submits is public until it is approved here — the read
 * policy on `comments` only returns approved rows, so this screen is the only
 * thing standing between a submission and the site.
 * ------------------------------------------------------------------ */

const COMMENT_FILTERS: { key: Comment['status'] | 'all'; label: string }[] = [
  { key: 'pending', label: 'Awaiting review' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
]

function CommentsManager() {
  const { confirm, confirmDialog } = useConfirm()
  const [comments, setComments] = useState<Comment[]>([])
  const [filter, setFilter] = useState<Comment['status'] | 'all'>('pending')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setComments(await moderationRepository.listAll())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load comments.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const act = async (id: number, action: () => Promise<void>) => {
    setBusyId(id)
    setError('')
    try {
      await action()
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'That change could not be saved.')
    } finally {
      setBusyId(null)
    }
  }

  const visible = comments.filter((comment) => filter === 'all' || comment.status === filter)
  const pendingCount = comments.filter((comment) => comment.status === 'pending').length

  return (
    <section className="module-section">
      <div className="module-head">
        <div>
          <h2>Comment moderation</h2>
          <p className="module-sub">
            {pendingCount === 0
              ? 'Nothing is waiting for review.'
              : `${pendingCount} comment${pendingCount === 1 ? '' : 's'} awaiting review.`}
          </p>
        </div>
      </div>

      <div className="filter-chips">
        {COMMENT_FILTERS.map((option) => {
          const count =
            option.key === 'all'
              ? comments.length
              : comments.filter((comment) => comment.status === option.key).length
          return (
            <button
              key={option.key}
              className={filter === option.key ? 'chip is-active' : 'chip'}
              onClick={() => setFilter(option.key)}
            >
              {option.label} <span>{count}</span>
            </button>
          )
        })}
      </div>

      {error ? <div className="form-error">{error}</div> : null}

      {loading ? (
        <p className="empty-text">Loading comments…</p>
      ) : visible.length === 0 ? (
        <p className="empty-text">No comments in this view.</p>
      ) : (
        <div className="moderation-list">
          {visible.map((comment) => (
            <article className="moderation-card" key={comment.id}>
              <header>
                <div>
                  <strong>{comment.authorName}</strong>
                  {comment.createdAt ? <time>{comment.createdAt}</time> : null}
                </div>
                <span className={`status-chip status-${comment.status}`}>{comment.status}</span>
              </header>
              <p>{comment.body}</p>
              <footer>
                {comment.status !== 'approved' && (
                  <button
                    className="mini-button approve"
                    disabled={busyId === comment.id}
                    onClick={() => void act(comment.id, () => moderationRepository.setStatus(comment.id, 'approved'))}
                  >
                    <Check size={14} /> Approve
                  </button>
                )}
                {comment.status !== 'rejected' && (
                  <button
                    className="mini-button reject"
                    disabled={busyId === comment.id}
                    onClick={() => void act(comment.id, () => moderationRepository.setStatus(comment.id, 'rejected'))}
                  >
                    <Ban size={14} /> Reject
                  </button>
                )}
                <button
                  className="mini-button danger"
                  disabled={busyId === comment.id}
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Delete comment',
                      body: (
                        <>
                          Delete this comment from <strong>{comment.authorName}</strong>?
                        </>
                      ),
                      consequences: ['Rejecting instead keeps the comment on record without publishing it'],
                      confirmLabel: 'Delete comment',
                    })
                    if (ok) await act(comment.id, () => moderationRepository.remove(comment.id))
                  }}
                >
                  <Trash2 size={14} /> Delete
                </button>
              </footer>
            </article>
          ))}
        </div>
      )}
      {confirmDialog}
    </section>
  )
}

/* ------------------------------------------------------------------ *
 * Media
 *
 * Assets are referenced by URL rather than uploaded: no storage bucket is
 * configured on the project, and a link-based library is the honest version of
 * that until one is.
 * ------------------------------------------------------------------ */

// These must stay in step with media_assets_kind_check; the database rejects
// anything else outright.
const MEDIA_KIND_LABELS: Record<MediaKind, string> = {
  video: 'Video',
  highlight: 'Highlight reel',
  press_conference: 'Press conference',
  photo: 'Photo',
  panorama: 'Panorama',
  document: 'Document',
}
const MEDIA_KINDS = Object.keys(MEDIA_KIND_LABELS) as MediaKind[]

const emptyMedia = (): MediaAsset => ({
  id: 0,
  title: '',
  kind: 'video',
  externalUrl: '',
  thumbnailUrl: '',
  isPublished: false,
})

function MediaManager({ media, onRefresh }: { media: MediaAsset[]; onRefresh: () => Promise<void> }) {
  const { confirm, confirmDialog } = useConfirm()
  const [editing, setEditing] = useState<MediaAsset | null>(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)

  const act = async (id: number, action: () => Promise<void>) => {
    setBusyId(id)
    setError('')
    try {
      await action()
      await onRefresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'That change could not be saved.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="module-section">
      <div className="module-head">
        <div>
          <h2>Media library</h2>
          <p className="module-sub">
            {media.length} asset{media.length === 1 ? '' : 's'} · published items appear on the public site
          </p>
        </div>
        <button className="primary-button" onClick={() => setEditing(emptyMedia())}>
          <Plus size={16} /> Add asset
        </button>
      </div>

      {error ? <div className="form-error">{error}</div> : null}

      {media.length === 0 ? (
        <p className="empty-text">
          No media yet. Add a highlight video or photo and publish it to replace the placeholder cards on the public site.
        </p>
      ) : (
        <div className="media-admin-grid">
          {media.map((asset) => (
            <article className="media-admin-card" key={asset.id}>
              <div className="media-admin-thumb">
                {asset.thumbnailUrl ? (
                  <img src={asset.thumbnailUrl} alt="" />
                ) : (
                  <span className="media-admin-kind">{MEDIA_KIND_LABELS[asset.kind] ?? asset.kind}</span>
                )}
              </div>
              <div className="media-admin-body">
                <strong>{asset.title}</strong>
                <span className={`status-chip ${asset.isPublished ? 'status-approved' : 'status-pending'}`}>
                  {asset.isPublished ? 'Published' : 'Draft'}
                </span>
                {asset.externalUrl ? (
                  <a href={asset.externalUrl} target="_blank" rel="noopener noreferrer" className="media-admin-link">
                    <ExternalLink size={13} /> Open
                  </a>
                ) : null}
              </div>
              <footer>
                <button
                  className="mini-button"
                  disabled={busyId === asset.id}
                  onClick={() => void act(asset.id, () => mediaRepository.togglePublished(asset.id, !asset.isPublished))}
                >
                  {asset.isPublished ? 'Unpublish' : 'Publish'}
                </button>
                <button className="mini-button" onClick={() => setEditing(asset)}>
                  <Edit2 size={13} /> Edit
                </button>
                <button
                  className="mini-button danger"
                  disabled={busyId === asset.id}
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Delete media asset',
                      body: (
                        <>
                          Delete <strong>{asset.title}</strong>?
                        </>
                      ),
                      consequences: asset.isPublished ? ['It is published, so it will disappear from the public site'] : [],
                      confirmLabel: 'Delete asset',
                    })
                    if (ok) await act(asset.id, () => mediaRepository.remove(asset.id))
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </footer>
            </article>
          ))}
        </div>
      )}

      {editing ? (
        <MediaModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await onRefresh()
          }}
        />
      ) : null}
      {confirmDialog}
    </section>
  )
}

function MediaModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: MediaAsset
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setSaveError('')
    const data = new FormData(event.currentTarget)
    try {
      await mediaRepository.save({
        id: initial.id,
        title: String(data.get('title')).trim(),
        kind: String(data.get('kind')) as MediaKind,
        externalUrl: String(data.get('externalUrl')).trim() || undefined,
        thumbnailUrl: String(data.get('thumbnailUrl')).trim() || undefined,
        durationSeconds: data.get('duration') ? Number(data.get('duration')) : undefined,
        isPublished: data.get('isPublished') === 'on',
      })
      await onSaved()
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : 'Unable to save this asset.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={initial.id ? 'Edit media asset' : 'Add media asset'} onClose={onClose}>
      <form className="admin-form" onSubmit={submit}>
        <label className="span-2">
          Title *
          <input name="title" defaultValue={initial.title} placeholder="e.g. Matchday 3 highlights" required />
        </label>
        <label>
          Type
          <select name="kind" defaultValue={initial.kind}>
            {MEDIA_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {MEDIA_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Duration (seconds)
          <input name="duration" type="number" min={0} defaultValue={initial.durationSeconds ?? ''} placeholder="e.g. 180" />
        </label>
        <label className="span-2">
          Link URL *
          <input
            name="externalUrl"
            type="url"
            defaultValue={initial.externalUrl ?? ''}
            placeholder="https://youtube.com/watch?v=…"
            required
          />
          <small className="field-hint">
            Required — the database rejects an asset with neither an uploaded file nor a link, and there is no
            storage bucket configured yet.
          </small>
        </label>
        <label className="span-2">
          Thumbnail image URL
          <input name="thumbnailUrl" type="url" defaultValue={initial.thumbnailUrl ?? ''} placeholder="https://…/thumb.jpg" />
          <small className="field-hint">Shown as the card image on the public site.</small>
        </label>
        <label className="checkbox-label span-2">
          <input type="checkbox" name="isPublished" defaultChecked={initial.isPublished} />
          Publish to the public site
        </label>
        {saveError ? <div className="form-error span-2">{saveError}</div> : null}
        <FormActions onClose={onClose} label="Save asset" saving={saving} />
      </form>
    </Modal>
  )
}

/* ------------------------------------------------------------------ *
 * Sponsors
 * ------------------------------------------------------------------ */

const emptySponsor = (order: number): Sponsor => ({
  id: 0,
  name: '',
  logoUrl: '',
  websiteUrl: '',
  displayOrder: order,
  isActive: true,
})

function SponsorsManager({ sponsors, onRefresh }: { sponsors: Sponsor[]; onRefresh: () => Promise<void> }) {
  const { confirm, confirmDialog } = useConfirm()
  const [editing, setEditing] = useState<Sponsor | null>(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)

  const act = async (id: number, action: () => Promise<void>) => {
    setBusyId(id)
    setError('')
    try {
      await action()
      await onRefresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'That change could not be saved.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="module-section">
      <div className="module-head">
        <div>
          <h2>Sponsors</h2>
          <p className="module-sub">
            {sponsors.length} partner{sponsors.length === 1 ? '' : 's'} · active ones appear in the public footer rail
          </p>
        </div>
        <button
          className="primary-button"
          onClick={() => setEditing(emptySponsor(sponsors.length))}
        >
          <Plus size={16} /> Add sponsor
        </button>
      </div>

      {error ? <div className="form-error">{error}</div> : null}

      {sponsors.length === 0 ? (
        <p className="empty-text">No sponsors yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ORDER</th>
                <th>LOGO</th>
                <th>NAME</th>
                <th>WEBSITE</th>
                <th>STATUS</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sponsors.map((sponsor) => (
                <tr key={sponsor.id}>
                  <td>{sponsor.displayOrder}</td>
                  <td>
                    {sponsor.logoUrl ? (
                      <img className="sponsor-logo-thumb" src={sponsor.logoUrl} alt="" />
                    ) : (
                      <span className="empty-text">—</span>
                    )}
                  </td>
                  <td>
                    <strong>{sponsor.name}</strong>
                  </td>
                  <td>
                    {sponsor.websiteUrl ? (
                      <a href={sponsor.websiteUrl} target="_blank" rel="noopener noreferrer" className="media-admin-link">
                        <ExternalLink size={13} /> Visit
                      </a>
                    ) : (
                      <span className="empty-text">—</span>
                    )}
                  </td>
                  <td>
                    <span className={`status-chip ${sponsor.isActive ? 'status-approved' : 'status-pending'}`}>
                      {sponsor.isActive ? 'Active' : 'Hidden'}
                    </span>
                  </td>
                  <td className="row-actions">
                    <button
                      className="mini-button"
                      disabled={busyId === sponsor.id}
                      onClick={() => void act(sponsor.id, () => sponsorsRepository.toggleActive(sponsor.id, !sponsor.isActive))}
                    >
                      {sponsor.isActive ? 'Hide' : 'Show'}
                    </button>
                    <button className="mini-button" onClick={() => setEditing(sponsor)}>
                      <Edit2 size={13} />
                    </button>
                    <button
                      className="mini-button danger"
                      disabled={busyId === sponsor.id}
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'Delete sponsor',
                          body: (
                            <>
                              Delete <strong>{sponsor.name}</strong>?
                            </>
                          ),
                          consequences: sponsor.isActive ? ['It is active, so it will disappear from the public partner rail'] : [],
                          confirmLabel: 'Delete sponsor',
                        })
                        if (ok) await act(sponsor.id, () => sponsorsRepository.remove(sponsor.id))
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing ? (
        <SponsorModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await onRefresh()
          }}
        />
      ) : null}
      {confirmDialog}
    </section>
  )
}

function SponsorModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: Sponsor
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setSaveError('')
    const data = new FormData(event.currentTarget)
    try {
      await sponsorsRepository.save({
        id: initial.id,
        name: String(data.get('name')).trim(),
        logoUrl: String(data.get('logoUrl')).trim() || undefined,
        websiteUrl: String(data.get('websiteUrl')).trim() || undefined,
        displayOrder: Number(data.get('displayOrder') || 0),
        isActive: data.get('isActive') === 'on',
      })
      await onSaved()
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : 'Unable to save this sponsor.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={initial.id ? 'Edit sponsor' : 'Add sponsor'} onClose={onClose}>
      <form className="admin-form" onSubmit={submit}>
        <label className="span-2">
          Sponsor name *
          <input name="name" defaultValue={initial.name} placeholder="e.g. Anadolu Enerji" required />
        </label>
        <label className="span-2">
          Logo URL
          <input name="logoUrl" type="url" defaultValue={initial.logoUrl ?? ''} placeholder="https://…/logo.svg" />
        </label>
        <label>
          Website
          <input name="websiteUrl" type="url" defaultValue={initial.websiteUrl ?? ''} placeholder="https://example.com" />
        </label>
        <label>
          Display order
          <input name="displayOrder" type="number" min={0} defaultValue={initial.displayOrder} />
          <small className="field-hint">Lower numbers appear first.</small>
        </label>
        <label className="checkbox-label span-2">
          <input type="checkbox" name="isActive" defaultChecked={initial.isActive} />
          Show on the public site
        </label>
        {saveError ? <div className="form-error span-2">{saveError}</div> : null}
        <FormActions onClose={onClose} label="Save sponsor" saving={saving} />
      </form>
    </Modal>
  )
}

/* ------------------------------------------------------------------ *
 * Users
 *
 * Role changes go through the `set_user_role` function, which refuses
 * non-admin callers and lets only a super_admin grant super_admin. The select
 * below hides that option for a plain admin so the panel does not offer an
 * action the database will reject.
 * ------------------------------------------------------------------ */

const ASSIGNABLE_ROLES: AdminUser['role'][] = ['viewer', 'match_operator', 'editor', 'admin', 'super_admin']

const ROLE_LABELS: Record<AdminUser['role'], string> = {
  super_admin: 'Super admin',
  admin: 'Admin',
  editor: 'Editor',
  match_operator: 'Match operator',
  viewer: 'Viewer',
}

function UsersManager({ currentRole }: { currentRole: AuthProfile['role'] }) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setUsers(await usersRepository.list())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load staff accounts.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const changeRole = async (user: AdminUser, role: AdminUser['role']) => {
    if (role === user.role) return
    setBusyId(user.id)
    setError('')
    try {
      await usersRepository.setRole(user.id, role)
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The role could not be changed.')
      await load()
    } finally {
      setBusyId(null)
    }
  }

  const canGrantSuper = currentRole === 'super_admin'

  return (
    <section className="module-section">
      <div className="module-head">
        <div>
          <h2>Staff &amp; roles</h2>
          <p className="module-sub">
            {users.length} account{users.length === 1 ? '' : 's'} · roles take effect immediately
          </p>
        </div>
      </div>

      <p className="module-note">
        <ShieldCheck size={15} />
        Accounts are created by signing up through the staff login. Email addresses live in Supabase Auth and
        are not readable from here, so accounts are listed by profile name.
      </p>

      {error ? <div className="form-error">{error}</div> : null}

      {loading ? (
        <p className="empty-text">Loading accounts…</p>
      ) : users.length === 0 ? (
        <p className="empty-text">No staff accounts found.</p>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>NAME</th>
                <th>ROLE</th>
                <th>CREATED</th>
                <th>CHANGE ROLE</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.fullName}</strong>
                  </td>
                  <td>
                    <span className={`role-chip role-${user.role}`}>{ROLE_LABELS[user.role]}</span>
                  </td>
                  <td>{user.createdAt ?? '—'}</td>
                  <td>
                    <select
                      value={user.role}
                      disabled={busyId === user.id}
                      onChange={(event) => void changeRole(user, event.target.value as AdminUser['role'])}
                    >
                      {ASSIGNABLE_ROLES.filter((role) => role !== 'super_admin' || canGrantSuper).map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
        streamUrl: String(data.get('streamUrl')).trim() || undefined,
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
          Live Stream URL
          <input name="streamUrl" type="url" placeholder="https://youtube.com/watch?v=…" />
          <small className="field-hint">
            Optional. While the match is Live, the public site turns the LIVE badge into a link to this address.
          </small>
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
        streamUrl: String(data.get('streamUrl')).trim() || undefined,
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
          Live Stream URL
          <input
            name="streamUrl"
            type="url"
            defaultValue={match.streamUrl ?? ''}
            placeholder="https://youtube.com/watch?v=…"
          />
          <small className="field-hint">
            Set this while the match status is Live to turn the public LIVE badge into a link out.
          </small>
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
    const form = event.currentTarget
    setSaving(true)
    const data = new FormData(form)
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
      form.reset()
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
        nationality: String(data.get('nationality')) || foundTeam?.countryCode || 'TR',
        photoUrl: String(data.get('photoUrl')).trim() || undefined,
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

        <label>
          Nationality
          <select name="nationality" defaultValue={initial?.nationality ?? 'TR'}>
            {COUNTRIES.map((country) => (
              <option key={country.code} value={country.code}>
                {country.flag} {country.name}
              </option>
            ))}
          </select>
          <small className="field-hint">Drives the flag behind this player's roster card.</small>
        </label>

        <label className="span-2">
          Cutout Photo URL
          <input
            name="photoUrl"
            type="url"
            defaultValue={initial?.photoUrl ?? ''}
            placeholder="https://…/player-cutout.png"
          />
          <small className="field-hint">
            A background-free PNG works best — it is layered over the player's flag on roster cards.
          </small>
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


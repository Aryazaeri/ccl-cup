import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleUserRound,
  Clock,
  Cloud,
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
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { can, type AuthProfile, type PermissionArea } from '../auth/AuthContext'
import { ImageUploadField } from './ImageUploadField'
import { COUNTRIES, getCountry } from '../lib/countries'
import { generateEmptyBracket } from '../lib/bracketUtils'
import { assignedGroupName, generateEmptyGroupLeague } from '../lib/groupLeagueUtils'
import { qualificationOptions, tableStageMatches } from '../lib/qualificationUtils'
import type { FixtureOptions } from '../lib/fixtureUtils'
import { FixtureGenerator } from './FixtureGenerator'
import { QualificationPanel } from './QualificationPanel'
import { computeGroupStandings, computeTopScorers, isCountableMatch } from '../lib/standingsUtils'
import { defaultSeasonId, seasonBadgesForIds, seasonLabel, seasonLabelsForIds } from '../lib/seasonLabels'
import {
  mediaRepository,
  moderationRepository,
  siteSettingsRepository,
  sponsorsRepository,
  usersRepository,
} from '../services/tournamentRepository'
import { DEFAULT_SITE_SETTINGS, type SiteSettings } from '../lib/siteSettings'
import {
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
  type SeasonStatus,
  type SeasonType,
  type Sponsor,
  type Story,
  type StoryCategory,
  type Team,
  type TournamentBracket,
  type TournamentFormat,
} from '../types'

/** Standard football abbreviations — slicing the word gave "GOA" and "FOR". */
const POSITION_SHORT: Record<PlayerPosition, string> = {
  goalkeeper: 'GK',
  defender: 'DEF',
  midfielder: 'MID',
  forward: 'FWD',
}
import { BracketCanvasModal } from './BracketCanvasModal'
import { useConfirm } from './ConfirmDialog'
import { LeagueCanvasModal } from './LeagueCanvasModal'
import { GroupLeagueCanvasModal } from './GroupLeagueCanvasModal'
import { SquadCanvasModal } from './SquadCanvasModal'
import { TeamLogoPicker } from './TeamLogoPicker'
import { Brand } from './Brand'
import { Modal } from './Modal'
import { TeamMark } from './TeamMark'
import { MIN_SQUAD, clubsToEnter, isInTeam, latestSquad, playerTeamId, shrinkError, squadOf } from '../lib/squadUtils'
import type { EntryRoster, NewSquadPlayer } from '../services/tournamentRepository'

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
  onAddTeam: (team: Team, roster: EntryRoster) => Promise<void>
  onUpdateTeam: (team: Team) => Promise<void>
  onDeleteTeam: (id: number) => Promise<void>
  onAddPlayer: (player: Player) => Promise<void>
  onUpdatePlayer: (player: Player) => Promise<void>
  onDeletePlayer: (id: number) => Promise<void>
  /** Join `teamId`'s squad for the season (transferring if needed), or leave the season when null. */
  onSetSquad: (playerId: number, seasonId: number, teamId: number | null) => Promise<void>
  onGenerateFixtures: (seasonId: number, options: FixtureOptions) => Promise<void>
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
  { label: 'Settings', icon: Settings, area: 'settings' },
]

function sectionFromHash(): AdminSection {
  const slug = window.location.hash.split('/')[1]?.toLowerCase()
  return sections.find((entry) => entry.label.toLowerCase() === slug)?.label ?? 'Overview'
}

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
  onSetSquad,
  onGenerateFixtures,
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
  const [section, setSection] = useState<AdminSection>(sectionFromHash)
  useEffect(() => {
    const onHash = () => setSection(sectionFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

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
  // A club just created from the "new club" modal. The modal stays open on it
  // so players can be added straight away; without this it kept treating the
  // club as unsaved, and saving again created a duplicate.
  const [createdClub, setCreatedClub] = useState<{ name: string; seasonId?: number } | null>(null)
  const createdTeam = createdClub
    ? teams.find((t) => t.name === createdClub.name && (createdClub.seasonId == null || t.seasonId === createdClub.seasonId)) ?? null
    : null
  const teamInModal = editingTeam ?? createdTeam
  // Registering a club that already exists for another season, from its latest entry.
  const [enteringClub, setEnteringClub] = useState<{ team: Team; squadIds: number[] } | null>(null)
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
    const seasonPlayers = players.filter((player) => player.squads.some((entry) => entry.seasonId === id))

    // Only state counts when clubs actually carry a season. Browser-local data
    // has no seasonId, and reporting "0 clubs will be deleted" while clubs
    // exist would understate the damage — worse than giving no number at all.
    const countsAreKnown = teams.some((team) => team.seasonId != null)
    const cascadeLines = countsAreKnown
      ? [
          `${seasonTeams.length} club${seasonTeams.length === 1 ? '' : 's'} will be deleted`,
          `${seasonPlayers.length} player${seasonPlayers.length === 1 ? '' : 's'} leave this season's squads; their profiles and other seasons stay`,
        ]
      : ['Every club entry in this season is deleted; players keep their profiles']
    // The database unpublishes these before the delete, so they do not turn into content shown in every season.
    const seasonStories = stories.filter((story) => story.seasonId === id).length
    const seasonMedia = media.filter((asset) => asset.seasonId === id).length
    if (seasonStories + seasonMedia > 0) {
      cascadeLines.push(
        `${seasonStories} article${seasonStories === 1 ? '' : 's'} and ${seasonMedia} media item${seasonMedia === 1 ? '' : 's'} are kept as unpublished drafts with no season`,
      )
    }

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
    const squad = squadOf(players, id)
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
        `${squad.length} player${squad.length === 1 ? '' : 's'} leave${squad.length === 1 ? 's' : ''} this season's squad; their profiles and other seasons stay`,
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
          Delete <strong>{player?.fullName ?? 'this player'}</strong> and their squad places in every season?
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
    window.location.assign(next === 'Overview' ? '#admin' : `#admin/${next.toLowerCase()}`)
    setSection(next)
    setSidebarOpen(false)
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="admin-shell">
      {sidebarOpen ? <button className="admin-sidebar-scrim" aria-label="Close admin menu" onClick={() => setSidebarOpen(false)} /> : null}
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
          <button className="admin-menu" onClick={() => setSidebarOpen(true)} aria-label="Open admin menu" aria-expanded={sidebarOpen}>
            <Menu />
          </button>
          <h1>{activeSection}</h1>
          <div className="admin-top-actions">
            <button className="site-switch" onClick={onViewSite}>
              View site
            </button>
            {/* A shortcut from the dashboard only. Teams has its own "Register New
                Club" button, and on Players it read as the wrong action. */}
            {activeSection === 'Overview' && allowed('teams') && (
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
              seasons={seasons}
              players={players}
              onEnterClub={(team, seasonId) => {
                setEditingTeam(null)
                setEnteringClub({ team: { ...team, seasonId }, squadIds: squadOf(players, team.id).map((p) => p.id) })
                setModal('team')
              }}
              onDelete={confirmDeleteTeam}
              onEdit={(team) => {
                setEditingTeam(team)
                setModal('team')
              }}
              onManageSquad={(team) => setSquadTeam(team)}
              onOpenSquadCanvas={(team) => setCanvasSquadTeam(team)}
              onAdd={() => {
                setEditingTeam(null)
                setEnteringClub(null)
                setModal('team')
              }}
            />
          )}

          {activeSection === 'Players' && (
            <PlayersManager
              players={players}
              teams={teams}
              seasons={seasons}
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
            <>
            <FixtureGenerator seasons={seasons} teams={teams} matches={matches} onGenerate={onGenerateFixtures} />
            <MatchesManager
              matches={matches}
              seasons={seasons}
              onDelete={confirmDeleteMatch}
              onEditMatch={(match) => setEditingMatch(match)}
              onManageEvents={(match) => setEventMatch(match)}
              onAdd={() => setModal('match')}
            />
            </>
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
            <StandingsManager seasons={seasons} teams={teams} players={players} matches={matches}
              canManage={can(profile.role, 'seasons')} onUpdateSeason={onUpdateSeason} onOpenBracket={setBracketSeason} />
          )}

          {activeSection === 'Comments' && <CommentsManager seasons={seasons} />}

          {activeSection === 'Media' && <MediaManager media={media} seasons={seasons} sponsors={sponsors} onRefresh={onRefresh} />}

          {activeSection === 'Sponsors' && <SponsorsManager sponsors={sponsors} seasons={seasons} onRefresh={onRefresh} />}

          {activeSection === 'Users' && <UsersManager currentRole={profile.role} />}

          {activeSection === 'Settings' && <SettingsManager />}
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
          teams={teams.filter((team) => team.seasonId == null || team.seasonId === bracketSeason.id)}
          initialBracket={bracketSeason.bracket ?? generateEmptyBracket(bracketSeason.teamCount ?? 8)}
          matches={matches.filter((match) => match.seasonId === bracketSeason.id || match.seasonId == null)}
          onClose={() => setBracketSeason(null)}
          onSave={async (bracket) => {
            await onUpdateSeason({
              ...bracketSeason,
              seasonType: bracketSeason.seasonType ?? 'tournament',
              teamCount: bracketSeason.bracket?.qualification ? bracketSeason.teamCount : bracket.teamCount,
              bracket,
            })
            setBracketSeason(null)
          }}
        />
      )}

      {leagueSeason && (
        <LeagueCanvasModal
          seasonTitle={leagueSeason.fullName}
          teams={teams.filter((team) => team.seasonId == null || team.seasonId === leagueSeason.id)}
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
          teams={teams.filter((team) => team.seasonId == null || team.seasonId === groupLeagueSeason.id)}
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

      {modal === 'match' && (
        <MatchForm teams={teams} seasons={seasons} onClose={() => setModal(null)} onSave={onAddMatch} />
      )}

      {editingMatch && (
        <MatchScoreModal
          match={editingMatch}
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
          key={teamInModal?.id ?? enteringClub?.team.id ?? 'new'}
          initial={teamInModal}
          template={teamInModal ? undefined : enteringClub ?? undefined}
          seasons={seasons}
          teams={teams}
          allPlayers={players}
          players={teamInModal ? squadOf(players, teamInModal.id) : []}
          onClose={() => {
            setModal(null)
            setEditingTeam(null)
            setCreatedClub(null)
            setEnteringClub(null)
          }}
          onSave={async (team, roster) => {
            if (teamInModal) {
              await onUpdateTeam({ ...team, id: teamInModal.id })
            } else {
              await onAddTeam(team, roster ?? { playerIds: [], newPlayers: [] })
              setCreatedClub({ name: team.name, seasonId: team.seasonId })
            }
          }}
          onAddPlayer={onAddPlayer}
          onSetSquad={onSetSquad}
          onOpenSquadCanvas={(team) => setCanvasSquadTeam(team)}
        />
      )}

      {squadTeam && (
        <QuickSquadModal
          team={squadTeam}
          seasons={seasons}
          teams={teams}
          allPlayers={players}
          players={squadOf(players, squadTeam.id)}
          onClose={() => setSquadTeam(null)}
          onAddPlayer={onAddPlayer}
          onSetSquad={onSetSquad}
          onOpenSquadCanvas={(team) => setCanvasSquadTeam(team)}
        />
      )}

      {canvasSquadTeam && (
        <SquadCanvasModal
          team={canvasSquadTeam}
          teamPlayers={squadOf(players, canvasSquadTeam.id)}
          onClose={() => setCanvasSquadTeam(null)}
          onSaveSquad={async (assignedIds, unassignedIds) => {
            const seasonId = canvasSquadTeam.seasonId
            if (seasonId == null) return
            // Joins first, so the squad never dips below the minimum mid-save.
            for (const id of assignedIds) {
              const p = players.find((item) => item.id === id)
              if (p && !isInTeam(p, canvasSquadTeam.id)) await onSetSquad(id, seasonId, canvasSquadTeam.id)
            }
            for (const id of unassignedIds) {
              const p = players.find((item) => item.id === id)
              if (p && isInTeam(p, canvasSquadTeam.id)) await onSetSquad(id, seasonId, null)
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
          onSetSquad={onSetSquad}
        />
      )}

      {modal === 'story' && (
        <StoryForm
          initial={editingStory}
          seasons={seasons}
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
  // Completed fixtures, most recent first. `matches` arrives ordered by
  // kickoff ascending, so the tail is the newest.
  const recentResults = useMemo(
    () => matches.filter((m) => m.matchStatus === 'completed' && m.homeScore != null).slice(-4).reverse(),
    [matches],
  )

  const metrics = [
    { icon: Trophy, value: seasonsCount, label: 'Seasons & Tournaments' },
    { icon: Shield, value: teams.length, label: 'Clubs & Teams' },
    { icon: Users, value: players.length, label: 'Registered Players' },
    { icon: CalendarDays, value: matches.filter((match) => match.matchStatus === 'scheduled').length, label: 'Scheduled Matches' },
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
            <h2>Live & Upcoming matches</h2>
          </div>
          <MatchTable matches={matches.filter((match) => match.matchStatus === 'live' || match.matchStatus === 'scheduled').slice(0, 4)} onEdit={onManageMatchScore} />
        </section>

        <section className="admin-panel activity">
          <h2>Latest results</h2>
          {/*
            This panel used to be four hardcoded rows with invented staff names
            and fabricated timestamps. There is no audit trail to build a real
            activity feed from — audit_logs exists but nothing writes to it — so
            it now shows the most recent actual results instead of inventing
            history. Attribution returns when audit logging does.
          */}
          {recentResults.length === 0 ? (
            <p className="empty-text">
              No results recorded yet. Completed fixtures appear here as scores are entered.
            </p>
          ) : (
            recentResults.map((match) => (
              <div className="activity-row" key={match.id}>
                <span className="activity-icon">
                  <FileText />
                </span>
                <div>
                  <strong>
                    {match.home} {match.homeScore} &ndash; {match.awayScore} {match.away}
                  </strong>
                  <span>
                    {match.stage}
                    {match.venue && match.venue !== '—' ? ` · ${match.venue}` : ''}
                  </span>
                </div>
                <time>{match.date}</time>
              </div>
            ))
          )}
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
              <span>New season</span>
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

const SEASON_STATUS_LABEL: Record<SeasonStatus, string> = { draft: 'Draft', published: 'Published', archived: 'Archived' }

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
            <span>Admin</span>
            <i>/</i>
            <strong>Seasons</strong>
          </div>
          <h2>
            Seasons & Tournaments ({filtered.length}
            {selectedYearFilter !== 'all' ? ` · ${selectedYearFilter}` : ''})
          </h2>
        </div>
      </div>

      <div className="seasons-table-card">
        <div className="seasons-controls-bar">
          <div className="seasons-left-actions">
            <button className="button-yeni-ekle" onClick={onAdd}>
              <Plus size={16} /> New Season
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
                title="Filter by year"
              >
                <option value="all">All years ({seasons.length})</option>
                {availableYears.map((yr) => {
                  const count = seasons.filter((s) => s.year === yr).length
                  return (
                    <option key={yr} value={yr}>
                      {yr} ({count} {count === 1 ? 'competition' : 'competitions'})
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
              <label>Show:</label>
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
              <label>Search:</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  setCurrentPage(1)
                }}
                placeholder="Search seasons or cities…"
              />
            </div>
          </div>
        </div>

        <div className="seasons-table-wrap">
          <table className="seasons-table">
            <thead>
              <tr>
                <th scope="col" style={{ width: '40px' }} aria-label="Sort">
                  <span className="th-sort-icon">▼</span>
                </th>
                <th scope="col">Title</th>
                <th scope="col">City</th>
                <th scope="col">Year</th>
                <th scope="col">Status</th>
                <th scope="col" style={{ width: '150px', textAlign: 'center' }}>Actions</th>
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
                      <MapPin size={13} aria-hidden="true" /> {season.city}
                    </span>
                  </td>
                  <td>
                    <span className="season-year-badge">{season.year}</span>
                  </td>
                  <td>
                    {/* Publication and "current" are separate: a current season can still be a draft. */}
                    <span className={`season-status-pill ${(season.status ?? 'published') === 'published' ? 'active' : 'archived'}`}>
                      {SEASON_STATUS_LABEL[season.status ?? 'published']}
                    </span>
                    {season.isActive ? <span className="season-status-pill active">Current</span> : null}
                  </td>
                  <td>
                    <div className="seasons-action-buttons">
                      {season.seasonType === 'group_league' ? (
                        <button
                          className="btn-season-action group-league"
                          onClick={() => onOpenGroupLeague(season)}
                          title="Open group tables"
                          aria-label={`Open group tables for ${season.fullName}`}
                        >
                          <Grid size={15} aria-hidden="true" />
                        </button>
                      ) : season.seasonType === 'league' ? (
                        <button
                          className="btn-season-action league"
                          onClick={() => onOpenLeague(season)}
                          title="Open league table"
                          aria-label={`Open league table for ${season.fullName}`}
                        >
                          <List size={15} aria-hidden="true" />
                        </button>
                      ) : (
                        <button
                          className="btn-season-action bracket"
                          onClick={() => onOpenBracket(season)}
                          title="Open knockout bracket"
                          aria-label={`Open knockout bracket for ${season.fullName}`}
                        >
                          <Trophy size={15} aria-hidden="true" />
                        </button>
                      )}
                      {season.bracket?.qualification ? <button
                        className="btn-season-action bracket"
                        onClick={() => onOpenBracket(season)}
                        title="Open knockout bracket"
                        aria-label={`Open knockout bracket for ${season.fullName}`}
                      ><Trophy size={15} aria-hidden="true" /></button> : null}
                      <button
                        className="btn-season-action settings"
                        onClick={() => onEdit(season)}
                        title="Edit season"
                        aria-label={`Edit season ${season.fullName}`}
                      >
                        <Settings size={15} aria-hidden="true" />
                      </button>
                      <button
                        className="btn-season-action delete"
                        onClick={() => void onDelete(season.id)}
                        title="Delete season"
                        aria-label={`Delete season ${season.fullName}`}
                      >
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: '#8c9bad' }}>
                    No seasons yet. Use "New Season" to add the first one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="seasons-table-footer">
          <span>
            Showing {filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} -{' '}
            {Math.min(currentPage * pageSize, filtered.length)} of {filtered.length}
          </span>
          <div className="seasons-pagination-btns">
            <button
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              ← Previous
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
              Next →
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

// SEASONS MODAL (new / edit season)
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
  const [knockout, setKnockout] = useState(Boolean(initial?.bracket?.qualification))
  const [qualifiersPerTable, setQualifiersPerTable] = useState(initial?.bracket?.qualification?.qualifiersPerTable ?? 2)
  const { confirm, confirmDialog } = useConfirm()
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
  // New seasons start as drafts so they stay off the public site until ready.
  const [status, setStatus] = useState<SeasonStatus>(initial?.status ?? (initial ? 'published' : 'draft'))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const fullName = `${city} ${year} ${name}`.trim()

  const handleTournamentTeamCountChange = (count: number) => {
    setTeamCount(count)
    setBracket(generateEmptyBracket(count))
  }

  const guard = useSingleFlight()
  const submit = (e: FormEvent<HTMLFormElement>) =>
    guard(e, async () => {
    e.preventDefault()
    if (!name.trim()) {
      setSaveError('Please enter a season name.')
      return
    }
    const tableCount = seasonType === 'group_league' ? groupCount : 1
    if (knockout && seasonType !== 'tournament' && !qualificationOptions(tableCount).includes(qualifiersPerTable)) {
      setSaveError('The knockout stage needs 2, 4, 8 or 16 qualifiers. Choose 2, 4 or 8 groups and a supported number per table.')
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

      const qualificationChanged = initial?.seasonType !== seasonType ||
        initial?.bracket?.qualification?.qualifiersPerTable !== qualifiersPerTable ||
        (seasonType === 'group_league' && initial?.groupCount !== groupCount) || !knockout
      if (initial?.bracket?.qualification?.seededAt && qualificationChanged && !(await confirm({
        title: 'Change knockout format?',
        body: 'Changing qualification settings will reset the saved knockout draw.',
        consequences: ['Bracket pairings and saved winners will be cleared.', 'Matches and their scores will remain.'],
        confirmLabel: 'Change format',
      }))) return
      const finalBracket = seasonType === 'tournament'
        ? { ...(bracket ?? generateEmptyBracket(teamCount)), qualification: undefined }
        : knockout
        ? !qualificationChanged && bracket?.qualification
          ? bracket
          : { ...generateEmptyBracket(tableCount * qualifiersPerTable), qualification: { qualifiersPerTable } }
        : undefined

      await onSave({
        ...initial,
        id: initial?.id ?? Date.now(),
        city,
        year: Number(year),
        name: name.trim(),
        fullName,
        seasonType,
        teamCount: finalTeamCount,
        groupCount: seasonType === 'group_league' ? groupCount : undefined,
        bracket: finalBracket,
        league: seasonType === 'league' ? (league ?? { teamCount: 0, slots: [] }) : undefined,
        groupLeague: seasonType === 'group_league' ? (groupLeague ?? generateEmptyGroupLeague(groupCount)) : undefined,
        isActive,
        status,
      })
      onClose()
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : 'The season could not be saved.')
    } finally {
      setSaving(false)
    }
  })

  const yearsList = [2028, 2027, 2026, 2025, 2024, 2023, 2022, 2021, 2020]
  const groupCountOptions = [2, 3, 4, 5, 6, 8]

  return (
    <>
      <Modal title={initial ? `Edit Season: ${initial.fullName}` : 'New Season'} onClose={onClose}>
        <form className="admin-form" onSubmit={submit}>
          <label>
            City *
            <select value={city} onChange={(e) => setCity(e.target.value)}>
              {HOST_CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label>
            Year *
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {yearsList.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>

          <label className="span-2">
            Season name *
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. International Corporate Cup"
              required
            />
          </label>

          <label className={seasonType === 'league' ? 'span-2' : ''}>
            Format *
            <select
              value={knockout && seasonType !== 'tournament' ? `${seasonType}_knockout` : seasonType}
              onChange={(e) => {
                const hasKnockout = e.target.value.endsWith('_knockout')
                const nextType = e.target.value.replace('_knockout', '') as SeasonType
                setKnockout(hasKnockout)
                setSeasonType(nextType)
                const qualifierOptions = qualificationOptions(nextType === 'group_league' ? groupCount : 1)
                if (!qualifierOptions.includes(qualifiersPerTable) && qualifierOptions.length) setQualifiersPerTable(qualifierOptions[0])
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
              <option value="tournament">🏆 Tournament (knockout bracket)</option>
              <option value="league">⚽ League (single table)</option>
              <option value="group_league">🗂️ Group league (multiple groups)</option>
              <option value="league_knockout">⚽ League → Knockout (single table, then elimination)</option>
              <option value="group_league_knockout">🗂️ Groups → Knockout (group tables, then elimination)</option>
            </select>
          </label>

          {seasonType === 'tournament' && (
            <label>
              Number of teams *
              <select
                value={teamCount}
                onChange={(e) => handleTournamentTeamCountChange(Number(e.target.value))}
              >
                <option value={4}>4 teams (semi-finals → final)</option>
                <option value={8}>8 teams (quarter-finals → final)</option>
                <option value={16}>16 teams (round of 16 → final)</option>
              </select>
            </label>
          )}

          {seasonType === 'group_league' && (
            <label>
              Number of groups *
              <select
                value={groupCount}
                onChange={(e) => {
                  const count = Number(e.target.value)
                  setGroupCount(count)
                  setGroupLeague(generateEmptyGroupLeague(count))
                  const options = qualificationOptions(count)
                  if (!options.includes(qualifiersPerTable) && options.length) setQualifiersPerTable(options[0])
                }}
              >
                {groupCountOptions.map((c) => (
                  <option key={c} value={c}>
                    {c} groups ({c === 2 ? 'A, B' : c === 4 ? 'A, B, C, D' : `${c} groups`})
                  </option>
                ))}
              </select>
            </label>
          )}

          {knockout && seasonType !== 'tournament' ? <div className="span-2 qualification-settings">
            <label>
              {seasonType === 'group_league' ? 'Qualifiers per group' : 'Qualifiers from the table'}
              <select value={qualifiersPerTable} onChange={(event) => setQualifiersPerTable(Number(event.target.value))}>
                {qualificationOptions(seasonType === 'group_league' ? groupCount : 1).map((count) => <option key={count} value={count}>Top {count}</option>)}
              </select>
            </label>
            <p>{qualificationOptions(seasonType === 'group_league' ? groupCount : 1).length
              ? `${qualifiersPerTable * (seasonType === 'group_league' ? groupCount : 1)} clubs enter the knockout stage. Assign clubs to the table(s), enter results in Matches, then generate the draw from Standings.`
              : 'Choose 2, 4 or 8 groups for a knockout stage.'}</p>
          </div> : null}

          {seasonType === 'tournament' && (
            <div className="span-2 season-bracket-launch-box">
              <div className="bracket-launch-info">
                <Trophy size={20} className="trophy-accent" />
                <div>
                  <strong>Knockout bracket</strong>
                  <span>
                    {bracket
                      ? `${teamCount}-team bracket set up (edit the draw and pairings)`
                      : `Empty ${teamCount}-team bracket`}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="button button-admin"
                onClick={() => setOpenBracketBuilder(true)}
              >
                <Trophy size={15} /> Open bracket
              </button>
            </div>
          )}

          {seasonType === 'league' && (
            <div className="span-2 season-bracket-launch-box">
              <div className="bracket-launch-info">
                <Trophy size={20} className="trophy-accent" />
                <div>
                  <strong>League table</strong>
                  <span>
                    {league && league.slots.length > 0
                      ? `${league.slots.length} teams in the table (edit order and teams)`
                      : 'Empty league table (drag clubs in)'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="button button-admin"
                onClick={() => setOpenLeagueBuilder(true)}
              >
                ⚽ Open league table
              </button>
            </div>
          )}

          {seasonType === 'group_league' && (
            <div className="span-2 season-bracket-launch-box">
              <div className="bracket-launch-info">
                <Trophy size={20} className="trophy-accent" />
                <div>
                  <strong>Group tables ({groupCount} groups)</strong>
                  <span>
                    {groupLeague && groupLeague.groups.some((g) => g.slots.length > 0)
                      ? `${groupLeague.groups.reduce((acc, g) => acc + g.slots.length, 0)} teams assigned to groups`
                      : `${groupCount} empty groups (drag clubs in)`}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="button button-admin"
                onClick={() => setOpenGroupLeagueBuilder(true)}
              >
                🗂️ Open group tables
              </button>
            </div>
          )}

          <label className="span-2">
            Visibility
            <select value={status} onChange={(e) => setStatus(e.target.value as SeasonStatus)}>
              <option value="draft">Draft — hidden from the public site</option>
              <option value="published">Published — shown on the public site</option>
              <option value="archived">Archived — hidden from the public site</option>
            </select>
          </label>

          <label className="checkbox-label span-2">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <span>Mark as the current season (the public site opens on it when it is published)</span>
          </label>

          {saveError ? <div className="form-error span-2">{saveError}</div> : null}

          <FormActions onClose={onClose} label={initial ? 'Save Changes' : 'Add season'} saving={saving} />
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
          seasonTitle={fullName || 'League'}
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
          seasonTitle={fullName || 'Group league'}
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
      {confirmDialog}
    </>
  )
}

function TeamsManager({
  teams: allTeams,
  seasons,
  players,
  onEnterClub,
  onDelete,
  onEdit,
  onManageSquad,
  onOpenSquadCanvas,
  onAdd,
}: {
  teams: Team[]
  seasons: Season[]
  players: Player[]
  /** Register a club from another season (its latest entry) in `seasonId`. */
  onEnterClub: (latestEntry: Team, seasonId: number) => void
  onDelete: (id: number) => Promise<void>
  onEdit: (team: Team) => void
  onManageSquad: (team: Team) => void
  onOpenSquadCanvas?: (team: Team) => void
  onAdd: () => void
}) {
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table')
  // Each season has its own club entries; the same club can appear once per season.
  const [seasonFilter, setSeasonFilter] = useState<number | 'all'>(() => defaultSeasonId(seasons) ?? 'all')
  const teams = seasonFilter === 'all' ? allTeams : allTeams.filter((team) => team.seasonId === seasonFilter)
  const enterable = seasonFilter === 'all' ? [] : clubsToEnter(allTeams, seasonFilter, seasons.map((season) => season.id))
  const seasonName = (id?: number) => {
    const season = seasons.find((item) => item.id === id)
    return season ? seasonLabel(season) : ''
  }
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
        <div className="manager-head-actions">
          {enterable.length > 0 && seasonFilter !== 'all' ? (
            <select
              aria-label="Enter a club from another season"
              value=""
              onChange={(e) => {
                const team = enterable.find((item) => item.id === Number(e.target.value))
                if (team) onEnterClub(team, seasonFilter)
              }}
            >
              <option value="">Enter an existing club in this season…</option>
              {enterable.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name} · last in {seasonName(team.seasonId)}
                </option>
              ))}
            </select>
          ) : null}
          <button className="button button-admin" onClick={onAdd}>
            <Plus />
            Register New Club
          </button>
        </div>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="filter-bar">
        <div className="filter-group">
          <CalendarDays size={16} />
          <span>Season:</span>
          <select
            value={seasonFilter}
            onChange={(e) => setSeasonFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          >
            <option value="all">All seasons</option>
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {seasonLabel(season)}
              </option>
            ))}
          </select>
        </div>

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
          <table className="admin-table teams-table">
            <thead>
              <tr>
                <th scope="col">CLUB & CREST</th>
                <th scope="col">COUNTRY</th>
                <th scope="col">TOURNAMENT & GROUP</th>
                <th scope="col">MANAGER / COACH</th>
                <th scope="col">SQUAD STATUS</th>
                <th scope="col">STANDINGS</th>
                <th scope="col">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filteredTeams.map((team) => {
                const squad = squadOf(players, team.id)
                const country = getCountry(team.countryCode)
                const isComplete = squad.length >= MIN_SQUAD

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
                          {seasonFilter === 'all' && team.seasonId != null ? (
                            <span className="short-code">{seasonName(team.seasonId)}</span>
                          ) : null}
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
                        <span className="group-pill">{assignedGroupName(seasons.find((season) => season.id === team.seasonId), team.id) ?? 'Not drawn'}</span>
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
                            <CheckCircle2 size={13} aria-hidden="true" /> {squad.length} Players (Ready)
                          </span>
                        ) : (
                          <span className="squad-badge incomplete" title="Minimum 5 squad members required for matchday">
                            <AlertCircle size={13} aria-hidden="true" /> {squad.length}/5 (Needs {5 - squad.length} more)
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
                            title="Formation & pitch canvas"
                            aria-label={`Formation and pitch canvas for ${team.name}`}
                          >
                            <Sparkles size={14} aria-hidden="true" /> <span className="row-action-label">Pitch</span>
                          </button>
                        )}
                        <button
                          className="row-action secondary"
                          onClick={() => onManageSquad(team)}
                          title="Manage Squad Roster"
                          aria-label={`Manage squad roster for ${team.name}`}
                        >
                          <Users size={14} aria-hidden="true" /> <span className="row-action-label">Squad</span> ({squad.length})
                        </button>
                        <button
                          className="row-action"
                          onClick={() => onEdit(team)}
                          title="Edit Club Details"
                          aria-label={`Edit ${team.name} details`}
                        >
                          <Edit2 size={14} aria-hidden="true" /> <span className="row-action-label">Edit</span>
                        </button>
                        <button
                          className="row-action danger"
                          onClick={() => void onDelete(team.id)}
                          title="Delete Club"
                          aria-label={`Delete club ${team.name}`}
                        >
                          <Trash2 size={14} aria-hidden="true" />
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
            const squad = squadOf(players, team.id)
            const country = getCountry(team.countryCode)
            const isComplete = squad.length >= MIN_SQUAD

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
                      <span className="card-group-label">{assignedGroupName(seasons.find((season) => season.id === team.seasonId), team.id) ?? 'Not drawn'}</span>
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
                        title="Formation & pitch canvas"
                      >
                        <Sparkles size={14} /> Pitch
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
  seasons,
  onDelete,
  onEdit,
  onAdd,
}: {
  players: Player[]
  teams: Team[]
  seasons: Season[]
  onDelete: (id: number) => Promise<void>
  onEdit: (player: Player) => void
  onAdd: () => void
}) {
  const [selectedTeam, setSelectedTeam] = useState<string>('All')
  const [selectedPos, setSelectedPos] = useState<string>('All')
  const [searchPlayer, setSearchPlayer] = useState('')
  // A season-less list shows each player's most recent club (seasons are newest first).
  const seasonOrder = useMemo(() => seasons.map((season) => season.id), [seasons])
  const currentClub = (p: Player) => {
    const entry = latestSquad(p, seasonOrder)
    return entry ? teams.find((team) => team.id === entry.teamId) : undefined
  }
  const clubNames = [...new Set(teams.map((team) => team.name))].sort((a, b) => a.localeCompare(b, 'tr'))

  const filtered = useMemo(() => {
    return players.filter((p) => {
      if (searchPlayer && !p.fullName.toLowerCase().includes(searchPlayer.toLowerCase())) return false
      if (selectedTeam === 'Free Agent') {
        if (p.squads.length > 0) return false
      } else if (selectedTeam !== 'All' && !p.squads.some((entry) => teams.find((team) => team.id === entry.teamId)?.name === selectedTeam)) {
        return false
      }
      if (selectedPos !== 'All' && p.position !== selectedPos.toLowerCase()) return false
      return true
    })
  }, [players, teams, selectedTeam, selectedPos, searchPlayer])

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
            <option value="Free Agent">Free agents</option>
            {clubNames.map((clubName) => (
              <option key={clubName} value={clubName}>
                {clubName}
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
              <th scope="col">#</th>
              <th scope="col">PLAYER</th>
              <th scope="col">TEAM</th>
              <th scope="col">POSITION</th>
              <th scope="col">PLAYED SEASONS</th>
              <th scope="col">STATS</th>
              <th scope="col">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((player) => (
              <tr key={player.id}>
                <td>
                  <span className="shirt-badge">{player.shirtNumber ?? '—'}</span>
                </td>
                <td>
                  <div className="player-cell">
                    <strong>{player.fullName}</strong>
                    {player.isCaptain && <span className="captain-badge" title="Team Captain" aria-label="Team Captain">C</span>}
                  </div>
                </td>
                <td>
                  {currentClub(player) ? (
                    <span className="team-cell-small">
                      <TeamMark
                        name={currentClub(player)!.name}
                        logoUrl={currentClub(player)!.logoUrl}
                        color={currentClub(player)!.color}
                      />
                      <span>{currentClub(player)!.name}</span>
                    </span>
                  ) : (
                    <span className="free-agent-badge">Free agent</span>
                  )}
                </td>
                <td>
                  <span className={`position-tag ${player.position}`}>{POSITION_SHORT[player.position]}</span>
                </td>
                <td>
                  <div className="season-tags-list">
                    {seasonBadgesForIds(player.activeSeasonIds, seasons).map((badge) => (
                      <span key={badge.key} className="season-pill" title={badge.full}>
                        {badge.short}
                      </span>
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
                    <button
                      className="row-action"
                      onClick={() => onEdit(player)}
                      title="Edit player"
                      aria-label={`Edit player ${player.fullName}`}
                    >
                      <Edit2 size={14} aria-hidden="true" /> <span className="row-action-label">Edit</span>
                    </button>
                    <button
                      className="row-action danger"
                      onClick={() => void onDelete(player.id)}
                      title="Delete player"
                      aria-label={`Delete player ${player.fullName}`}
                    >
                      <Trash2 size={14} aria-hidden="true" />
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
  seasons,
  onDelete,
  onEditMatch,
  onManageEvents,
  onAdd,
}: {
  matches: Match[]
  seasons: Season[]
  onDelete: (id: number) => Promise<void>
  onEditMatch: (match: Match) => void
  onManageEvents: (match: Match) => void
  onAdd: () => void
}) {
  const [filterStatus, setFilterStatus] = useState<string>('All')
  const [filterSeason, setFilterSeason] = useState<string>('All')

  const filtered = useMemo(() => {
    return matches.filter((m) => {
      if (filterStatus !== 'All' && m.matchStatus !== filterStatus.toLowerCase()) return false
      if (filterSeason !== 'All' && String(m.seasonId ?? '') !== filterSeason) return false
      return true
    })
  }, [matches, filterStatus, filterSeason])

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
        <div className="filter-group">
          <span>Season:</span>
          <select value={filterSeason} onChange={(e) => setFilterSeason(e.target.value)}>
            <option value="All">All Seasons</option>
            {seasons.map((season) => (
              <option key={season.id} value={String(season.id)}>
                {seasonLabel(season)}
              </option>
            ))}
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
                  <span className="status-label">
                    <span className={`status-dot ${story.status.toLowerCase()}`} />
                    {story.status}
                  </span>
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
                    <button className="row-action danger" onClick={() => void onDelete(story.id)} aria-label={`Delete ${story.title}`} title="Delete article">
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
  canManage,
  onUpdateSeason,
  onOpenBracket,
}: {
  seasons: Season[]
  teams: Team[]
  players: Player[]
  matches: Match[]
  canManage: boolean
  onUpdateSeason: (season: Season) => Promise<void>
  onOpenBracket: (season: Season) => void
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

  const scopedMatches = useMemo(() => {
    if (!selectedSeason) return matches
    const names = new Set(scopedTeams.map((team) => team.name))
    return matches.filter((match) => match.seasonId != null ? match.seasonId === selectedSeason.id : names.has(match.home) || names.has(match.away))
  }, [matches, selectedSeason, scopedTeams])
  const groups = useMemo(() => computeGroupStandings(scopedTeams, tableStageMatches(selectedSeason, scopedMatches), selectedSeason), [scopedTeams, scopedMatches, selectedSeason])

  const topScorers = useMemo(() => computeTopScorers(players, scopedMatches, 10), [players, scopedMatches])
  const resultsEntered = useMemo(() => scopedMatches.filter(isCountableMatch).length, [scopedMatches])
  const awaitingResult = Math.max(0, scopedMatches.length - resultsEntered)
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

      {selectedSeason?.bracket?.qualification ? <QualificationPanel key={selectedSeason.id} season={selectedSeason} teams={scopedTeams} matches={scopedMatches} canManage={canManage} onUpdateSeason={onUpdateSeason} onOpenBracket={onOpenBracket} /> : null}

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
 * Nothing a visitor submits is public until it is approved — the read policy
 * on `comments` only returns approved rows. The submit-comment Edge Function
 * screens each submission with TypeSafe (Jev) and approves or rejects the
 * clear-cut ones itself; everything else waits here, with Jev's reasons shown
 * alongside. A moderator's decision always overrides the screening.
 * ------------------------------------------------------------------ */

const SCREENING_REASON_LABELS: Record<string, string> = {
  spam: 'Spam',
  abuse: 'Abusive',
  hate: 'Hateful',
  personal_info: 'Personal info',
  off_topic: 'Off-topic',
  severity: 'Harmful to publish',
  uncertain: 'Not clearly clean',
}

const SCREENING_ACTION_LABELS: Record<NonNullable<Comment['screening']>['action'], string> = {
  approve: 'Jev: approved',
  review: 'Jev: needs a human',
  reject: 'Jev: rejected',
}

function ScreeningNote({ screening }: { screening: Comment['screening'] }) {
  if (!screening) return <p className="screening-note is-empty">Not screened by Jev.</p>
  return (
    <div className={`screening-note screening-${screening.action}`}>
      <strong>
        <Sparkles size={13} /> {SCREENING_ACTION_LABELS[screening.action]}
      </strong>
      {screening.reasons.map((reason) => (
        <span key={reason} className="screening-reason">
          {SCREENING_REASON_LABELS[reason] ?? reason}
          {reason in screening.hazards ? ` ${Math.round(screening.hazards[reason] * 100)}%` : ''}
        </span>
      ))}
      <span className="screening-meta" title={`Model ${screening.model}, policy ${screening.policy}`}>
        severity {screening.severity.toFixed(1)}/3
      </span>
    </div>
  )
}

const COMMENT_FILTERS: { key: Comment['status'] | 'all'; label: string }[] = [
  { key: 'pending', label: 'Awaiting review' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
]

function CommentsManager({ seasons }: { seasons: Season[] }) {
  const { confirm, confirmDialog } = useConfirm()
  const [comments, setComments] = useState<Comment[]>([])
  const [filter, setFilter] = useState<Comment['status'] | 'all'>('pending')
  // Feedback is moderated per season; 'none' holds comments from before seasons were tracked.
  const [seasonFilter, setSeasonFilter] = useState<number | 'all' | 'none'>(() => defaultSeasonId(seasons) ?? 'all')
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

  const scoped = comments.filter((comment) =>
    seasonFilter === 'all' ? true : seasonFilter === 'none' ? comment.seasonId == null : comment.seasonId === seasonFilter,
  )
  const visible = scoped.filter((comment) => filter === 'all' || comment.status === filter)
  const pendingCount = scoped.filter((comment) => comment.status === 'pending').length
  const seasonName = (id?: number | null) => {
    const season = seasons.find((item) => item.id === id)
    return season ? seasonLabel(season) : 'No season'
  }

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

      <div className="filter-bar">
        <div className="filter-group">
          <span>Season:</span>
          <select
            value={seasonFilter}
            onChange={(e) => setSeasonFilter(e.target.value === 'all' || e.target.value === 'none' ? e.target.value : Number(e.target.value))}
          >
            <option value="all">All seasons</option>
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {seasonLabel(season)}
              </option>
            ))}
            <option value="none">No season</option>
          </select>
        </div>
      </div>

      <div className="filter-chips">
        {COMMENT_FILTERS.map((option) => {
          const count =
            option.key === 'all'
              ? scoped.length
              : scoped.filter((comment) => comment.status === option.key).length
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
                  {seasonFilter === 'all' ? <small>{seasonName(comment.seasonId)}</small> : null}
                </div>
                <span className={`status-chip status-${comment.status}`}>{comment.status}</span>
              </header>
              <p>{comment.body}</p>
              <ScreeningNote screening={comment.screening} />
              <footer>
                {comment.status === 'pending' && (
                  <button
                    className="mini-button"
                    disabled={busyId === comment.id}
                    title="Ask TypeSafe (Jev) to screen this comment again"
                    onClick={() => void act(comment.id, () => moderationRepository.rescreen(comment.id))}
                  >
                    <Sparkles size={14} /> {comment.screening ? 'Re-screen' : 'Screen with Jev'}
                  </button>
                )}
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
 * Assets are referenced by URL rather than uploaded. Only thumbnails go to the
 * club-assets bucket (images only); direct video/document upload is an open
 * product decision.
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

function MediaManager({
  media,
  seasons,
  sponsors,
  onRefresh,
}: {
  media: MediaAsset[]
  seasons: Season[]
  sponsors: Sponsor[]
  onRefresh: () => Promise<void>
}) {
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
            {media.length} asset{media.length === 1 ? '' : 's'} · publish an item to show it in Highlights for its season
          </p>
        </div>
        <button className="button button-admin" onClick={() => setEditing(emptyMedia())}>
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
                <small className="field-hint">
                  {asset.seasonId == null ? 'All seasons' : seasonLabelsForIds([asset.seasonId], seasons).join(', ')}
                </small>
                {asset.sponsorId ? (
                  <small className="field-hint">
                    Presented by {sponsors.find((s) => s.id === asset.sponsorId)?.name ?? 'a sponsor'}
                  </small>
                ) : null}
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
                  aria-label={`Delete media ${asset.title}`}
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
          seasons={seasons}
          sponsors={sponsors}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            await onRefresh()
            setEditing(null)
          }}
        />
      ) : null}
      {confirmDialog}
    </section>
  )
}

function MediaModal({
  initial,
  seasons,
  sponsors,
  onClose,
  onSaved,
}: {
  initial: MediaAsset
  seasons: Season[]
  sponsors: Sponsor[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [seasonId, setSeasonId] = useState(initial.seasonId ? String(initial.seasonId) : '')
  // A season-wide asset can carry any sponsor; a season asset only that season's or season-wide ones.
  const sponsorOptions = sponsors.filter((s) => !seasonId || !s.seasonId || String(s.seasonId) === seasonId)
  const [saveError, setSaveError] = useState('')

  const guard = useSingleFlight()
  const submit = (event: FormEvent<HTMLFormElement>) =>
    guard(event, async () => {
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
        seasonId: Number(data.get('seasonId')) || undefined,
        sponsorId: Number(data.get('sponsorId')) || undefined,
      })
      await onSaved()
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : 'Unable to save this asset.')
    } finally {
      setSaving(false)
    }
  })

  return (
    <Modal title={initial.id ? 'Edit media asset' : 'Add media asset'} onClose={onClose}>
      <form className="admin-form" onSubmit={submit}>
        <label className="span-2">
          Title *
          <input name="title" defaultValue={initial.title} placeholder="e.g. Matchday 3 highlights" required />
        </label>
        <label className="span-2">
          Season
          <select name="seasonId" value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
            <option value="">All seasons</option>
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {seasonLabel(season)}
              </option>
            ))}
          </select>
          <small className="field-hint">Shown in the public media rail only while this season is selected.</small>
        </label>
        <label className="span-2">
          Presented by
          <select
            name="sponsorId"
            key={seasonId}
            defaultValue={sponsorOptions.some((s) => s.id === initial.sponsorId) ? initial.sponsorId : ''}
          >
            <option value="">No sponsor</option>
            {sponsorOptions.map((sponsor) => (
              <option key={sponsor.id} value={sponsor.id}>
                {sponsor.name}
              </option>
            ))}
          </select>
          <small className="field-hint">Optional. Shows a “Presented by” badge with the sponsor’s logo on the public card.</small>
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
            Required — media are shared as links (YouTube, Instagram, a hosted file). Only the thumbnail
            below is uploaded.
          </small>
        </label>
        <ImageUploadField
          name="thumbnailUrl"
          label="Thumbnail image"
          folder="media"
          defaultValue={initial.thumbnailUrl ?? ''}
          hint="Shown as the card image on the public site."
        />
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

function SponsorsManager({ sponsors, seasons, onRefresh }: { sponsors: Sponsor[]; seasons: Season[]; onRefresh: () => Promise<void> }) {
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
            {sponsors.length} partner{sponsors.length === 1 ? '' : 's'} · active partners appear in Sponsors for their season
          </p>
        </div>
        <button
          className="button button-admin"
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
                    <div className="field-hint">
                      {sponsor.seasonId == null ? 'All seasons' : seasonLabelsForIds([sponsor.seasonId], seasons).join(', ')}
                    </div>
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
                    <button className="mini-button" onClick={() => setEditing(sponsor)} aria-label={`Edit sponsor ${sponsor.name}`}>
                      <Edit2 size={13} />
                    </button>
                    <button
                      className="mini-button danger"
                      aria-label={`Delete sponsor ${sponsor.name}`}
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
          seasons={seasons}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            await onRefresh()
            setEditing(null)
          }}
        />
      ) : null}
      {confirmDialog}
    </section>
  )
}

function SponsorModal({
  initial,
  seasons,
  onClose,
  onSaved,
}: {
  initial: Sponsor
  seasons: Season[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const guard = useSingleFlight()
  const submit = (event: FormEvent<HTMLFormElement>) =>
    guard(event, async () => {
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
        seasonId: Number(data.get('seasonId')) || undefined,
      })
      await onSaved()
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : 'Unable to save this sponsor.')
    } finally {
      setSaving(false)
    }
  })

  return (
    <Modal title={initial.id ? 'Edit sponsor' : 'Add sponsor'} onClose={onClose}>
      <form className="admin-form" onSubmit={submit}>
        <label className="span-2">
          Sponsor name *
          <input name="name" defaultValue={initial.name} placeholder="e.g. Anadolu Enerji" required />
        </label>

        <label className="span-2">
          Season
          <select name="seasonId" defaultValue={initial.seasonId ?? ''}>
            <option value="">All seasons</option>
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {seasonLabel(season)}
              </option>
            ))}
          </select>
          <small className="field-hint">
            Shown in the public sponsor rail only while this season is selected. Leave on
            &ldquo;All seasons&rdquo; for a partner backing the whole competition.
          </small>
        </label>
        <ImageUploadField
          name="logoUrl"
          label="Logo"
          folder="sponsors"
          defaultValue={initial.logoUrl ?? ''}
          hint="Shown in the public sponsor rail."
        />
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

/** About copy, competition rules and contact links shown on the public site. */
function SettingsManager() {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    void siteSettingsRepository.get().then((value) => {
      if (cancelled) return
      setSettings(value)
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const field = (key: keyof SiteSettings) => ({
    value: key === 'rules' ? settings.rules.join('\n') : settings[key],
    onChange: (event: { target: { value: string } }) => {
      setSaved(false)
      const value = event.target.value
      setSettings((current) => ({ ...current, [key]: key === 'rules' ? value.split('\n') : value }))
    },
  })

  const guard = useSingleFlight()
  const submit = (event: FormEvent<HTMLFormElement>) =>
    guard(event, async () => {
      event.preventDefault()
      setSaving(true)
      setError('')
      try {
        setSettings(await siteSettingsRepository.save(settings))
        setSaved(true)
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'The settings could not be saved.')
      } finally {
        setSaving(false)
      }
    })

  return (
    <section className="module-section">
      <div className="module-head">
        <div>
          <h2>Site settings</h2>
          <p className="module-sub">The About section, competition rules and contact links on the public site.</p>
        </div>
      </div>

      {!loaded ? (
        <p className="empty-text">Loading settings…</p>
      ) : (
        <form className="admin-form" onSubmit={submit}>
          <label className="span-2">
            About — introduction
            <textarea rows={3} {...field('aboutIntro')} />
          </label>
          <label className="span-2">
            About — history
            <textarea rows={3} {...field('aboutHistory')} />
          </label>
          <label className="span-2">
            About — vision
            <textarea rows={3} {...field('aboutVision')} />
          </label>
          <label className="span-2">
            Competition rules (one per line)
            <textarea rows={6} {...field('rules')} />
          </label>
          <label className="span-2">
            Venue note
            <input {...field('venueNote')} />
          </label>
          <label>
            Instagram link
            <input type="url" placeholder="https://instagram.com/…" {...field('instagramUrl')} />
          </label>
          <label>
            YouTube link
            <input type="url" placeholder="https://youtube.com/@…" {...field('youtubeUrl')} />
          </label>
          <label>
            LinkedIn link
            <input type="url" placeholder="https://linkedin.com/company/…" {...field('linkedinUrl')} />
          </label>
          <label>
            WhatsApp number
            <input inputMode="tel" placeholder="Country code first, digits only" {...field('whatsappNumber')} />
          </label>
          <label className="span-2">
            WhatsApp greeting
            <input {...field('whatsappMessage')} />
          </label>
          <small className="field-hint span-2">Empty links and an empty WhatsApp number are hidden on the public site.</small>

          {error ? <div className="form-error span-2">{error}</div> : null}
          {saved ? <p className="span-2" role="status">Saved. The public site shows the new settings on its next load.</p> : null}

          <div className="form-actions span-2">
            <button className="button button-admin" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </form>
      )}
    </section>
  )
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
        Accounts are created in the Supabase dashboard (Authentication → Users); the staff login only signs in. Email addresses live in Supabase Auth and
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
                        {match.homePenalties != null && match.awayPenalties != null && (
                          <small className="admin-pen-tag"> ({match.homePenalties}–{match.awayPenalties}p)</small>
                        )}
                      </span>
                    ) : (
                      <span className="score-badge empty">vs</span>
                    )}
                    <span className={`status-dot ${match.matchStatus}`}></span>
                    <span className="status-text">{match.matchStatus}</span>
                    {match.status === 'Draft' ? (
                      <span className="status-chip status-pending" title="Not shown on the public site until published">
                        Draft
                      </span>
                    ) : null}
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
                        <Edit2 size={14} /> <span className="row-action-label">Score / Edit</span>
                      </button>
                    )}
                    {onManageEvents && (
                      <button className="row-action secondary" onClick={() => onManageEvents(match)} title="Manage events">
                        <Flame size={14} /> <span className="row-action-label">Events</span> (
                        {match.events?.length ?? 0})
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
  template,
  players,
  allPlayers = [],
  teams,
  seasons,
  onClose,
  onSave,
  onAddPlayer,
  onSetSquad,
  onOpenSquadCanvas,
}: {
  /** The season entry being edited; null when registering. */
  initial: Team | null
  /** When registering an existing club for another season: its latest entry, copied as the starting point. */
  template?: { team: Team; squadIds: number[] }
  players: Player[]
  allPlayers?: Player[]
  teams: Team[]
  seasons: Season[]
  onClose: () => void
  onSave: (team: Team, roster?: EntryRoster) => Promise<void>
  onAddPlayer: (player: Player) => Promise<void>
  onSetSquad: (playerId: number, seasonId: number, teamId: number | null) => Promise<void>
  onOpenSquadCanvas?: (team: Team) => void
}) {
  const base = initial ?? template?.team ?? null
  const [tab, setTab] = useState<'identity' | 'staff' | 'tournament' | 'squad'>('identity')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // Form State for Live Preview
  const [name, setName] = useState(base?.name ?? '')
  const [shortName, setShortName] = useState(base?.shortName ?? '')
  const [countryCode, setCountryCode] = useState(base?.countryCode ?? '')
  const [logoUrl, setLogoUrl] = useState(base?.logoUrl ?? '')
  const [color, setColor] = useState(base?.color ?? '#63e35b')
  const [secondaryColor, setSecondaryColor] = useState(base?.secondaryColor ?? '#071525')

  // Real-time Season & Group Selection State
  const [selectedSeasonId, setSelectedSeasonId] = useState<number>(() => {
    if (initial?.seasonId) return initial.seasonId
    // A club entering again starts on the season the caller chose for it.
    if (template?.team.seasonId) return template.team.seasonId
    const active = seasons.find((s) => s.isActive)
    return active?.id ?? seasons[0]?.id ?? 1
  })

  const currentSelectedSeason = useMemo(() => {
    return seasons.find((s) => s.id === selectedSeasonId) ?? seasons[0]
  }, [seasons, selectedSeasonId])

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
  const [addingPlayer, setAddingPlayer] = useState(false)

  // A new entry's squad is staged here and saved with the club in one step,
  // so it never exists below the minimum.
  const [stagedIds, setStagedIds] = useState<number[]>(() => template?.squadIds ?? [])
  const [stagedNew, setStagedNew] = useState<NewSquadPlayer[]>([])
  const squadSize = initial ? players.length : stagedIds.length + stagedNew.length
  const squadPlayers = initial ? players : allPlayers.filter((p) => stagedIds.includes(p.id))

  // Anyone not already in this squad. Joining moves them from another club this season.
  const availablePoolPlayers = useMemo(() => {
    if (initial) return allPlayers.filter((p) => !isInTeam(p, initial.id))
    return allPlayers.filter((p) => !stagedIds.includes(p.id))
  }, [allPlayers, initial, stagedIds])
  const clubThisSeason = (p: Player) =>
    teams.find((team) => team.id === playerTeamId(p, initial?.seasonId ?? selectedSeasonId))?.name

  // A plain filter: cheap, and it reads the current season's club names.
  const filteredPoolPlayers = (() => {
    if (!poolPlayerSearch.trim()) return availablePoolPlayers
    const q = poolPlayerSearch.toLowerCase()
    return availablePoolPlayers.filter(
      (p) =>
        p.fullName.toLowerCase().includes(q) ||
        (clubThisSeason(p) ?? '').toLowerCase().includes(q) ||
        p.position.toLowerCase().includes(q)
    )
  })()

  const selectedCountry = getCountry(countryCode)

  const guard = useSingleFlight()
  const submit = (event: FormEvent<HTMLFormElement>) =>
    guard(event, async () => {
    event.preventDefault()
    setSaving(true)
    setSaveError('')
    const data = new FormData(event.currentTarget)
    // String(null) is "null"; a missing or blank field must stay empty instead.
    const text = (key: string) => {
      const value = data.get(key)
      return typeof value === 'string' && value.trim() ? value.trim() : undefined
    }
    try {
      // "Takım crud logo bayrak must" — the brief requires both, and neither
      // was enforced. The country select cannot be left empty, and a club
      // cannot be saved without a crest.
      if (!countryCode) {
        setSaveError('Choose the club\u2019s country — the flag is required.')
        setSaving(false)
        return
      }
      if (!String(data.get('logoUrl')).trim()) {
        setSaveError('Add a club crest — upload one or pick from the preset gallery.')
        setSaving(false)
        return
      }

      if (!initial && squadSize < MIN_SQUAD) {
        setSaveError(`Add at least ${MIN_SQUAD} players in the Squad tab before registering (${squadSize} so far).`)
        setTab('squad')
        setSaving(false)
        return
      }

      // The repository uploads the crest and cleans it up if the row is rejected.
      await onSave({
        id: initial?.id ?? Date.now(),
        seasonId: initial?.seasonId ?? selectedSeasonId,
        clubId: base?.clubId,
        name: String(data.get('name')).toUpperCase(),
        shortName: text('shortName')?.toUpperCase(),
        countryCode,
        countryName: selectedCountry.name,
        logoUrl: String(data.get('logoUrl')) || undefined,
        color: String(data.get('color')),
        secondaryColor: text('secondaryColor'),
        managerName: text('managerName'),
        coachName: text('coachName'),
        bio: text('bio'),
        tournamentFormat: (currentSelectedSeason?.fullName || currentSelectedSeason?.name || 'Champions Cup') as TournamentFormat,
        groupName: text('groupName') || availableGroups[0] || 'Group A',
        played: initial?.played ?? 0,
        goalDifference: initial?.goalDifference ?? 0,
        points: initial?.points ?? 0,
        isActive: data.get('isActive') === 'on',
      }, initial ? undefined : { playerIds: stagedIds, newPlayers: stagedNew })
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
  })

  const handleAssignPoolPlayer = () =>
    guard(undefined, async () => {
    if (!selectedPoolPlayerId) return
    const targetPlayer = allPlayers.find((p) => p.id === Number(selectedPoolPlayerId))
    if (!targetPlayer) return
    if (!initial) {
      setStagedIds((ids) => [...ids, targetPlayer.id])
      setSelectedPoolPlayerId('')
      return
    }

    setAssigningPoolPlayer(true)
    setSquadActionError('')
    try {
      await onSetSquad(targetPlayer.id, initial.seasonId ?? selectedSeasonId, initial.id)
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
  })

  const handleInlineAddPlayer = () =>
    guard(undefined, async () => {
    if (!newPlayerName.trim()) return
    if (newPlayerNumber && !validShirtNumber(newPlayerNumber)) {
      setSquadActionError('Shirt numbers run from 1 to 99.')
      return
    }
    if (!initial) {
      setStagedNew((list) => [...list, {
        fullName: newPlayerName.trim(),
        shirtNumber: newPlayerNumber ? Number(newPlayerNumber) : undefined,
        position: newPlayerPosition,
        nationality: countryCode || 'TR',
      }])
      setNewPlayerName('')
      setNewPlayerNumber('')
      return
    }
    setAddingPlayer(true)
    setSquadActionError('')
    try {
      // A player created here joins this entry, so their season is the club's.
      await onAddPlayer({
        id: Date.now(),
        squads: [{ seasonId: initial.seasonId ?? selectedSeasonId, teamId: initial.id }],
        fullName: newPlayerName.trim(),
        shirtNumber: newPlayerNumber ? Number(newPlayerNumber) : undefined,
        position: newPlayerPosition,
        nationality: countryCode,
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
  })

  return (
    <Modal title={initial ? `Manage Club: ${initial.name}` : template ? `Enter ${template.team.name} in a season` : 'Register New Club'} onClose={onClose}>
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
          <button
            type="button"
            className={tab === 'squad' ? 'active' : ''}
            onClick={() => setTab('squad')}
          >
            4. Squad Roster ({squadSize}{initial ? '' : `/${MIN_SQUAD}+`})
          </button>
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
            {squadSize >= MIN_SQUAD ? (
              <span className="squad-badge complete">✅ Squad Complete ({squadSize}/{MIN_SQUAD} min)</span>
            ) : (
              <span className="squad-badge incomplete">⚠️ {squadSize}/{MIN_SQUAD} (Min {MIN_SQUAD} players needed)</span>
            )}
          </div>
        </div>

        <form className="admin-form" onSubmit={submit}>
          {/* Every form tab stays mounted (just hidden) so saving from any tab sends
              all fields; rendering only the open tab saved "null" for the rest. */}
          <div className="tab-panel" style={{ display: tab === 'identity' ? 'contents' : 'none' }}>
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
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  required
                >
                  <option value="" disabled>
                    Select a country…
                  </option>
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
          </div>

          <div className="tab-panel" style={{ display: tab === 'staff' ? 'contents' : 'none' }}>
              <label>
                Manager / Director Name
                <input
                  name="managerName"
                  defaultValue={base?.managerName ?? ''}
                  placeholder="e.g. Ahmet Yılmaz"
                />
              </label>

              <label>
                Head Coach Name
                <input
                  name="coachName"
                  defaultValue={base?.coachName ?? ''}
                  placeholder="e.g. Roberto Mancini"
                />
              </label>

              <label className="span-2">
                Club Biography & Background
                <textarea
                  name="bio"
                  rows={4}
                  defaultValue={base?.bio ?? ''}
                  placeholder="Brief description of the club, corporate background, and history..."
                />
              </label>
          </div>

          <div className="tab-panel" style={{ display: tab === 'tournament' ? 'contents' : 'none' }}>
              <label className="span-2">
                Season *
                <select
                  name="seasonId"
                  value={initial?.seasonId ?? selectedSeasonId}
                  onChange={(e) => setSelectedSeasonId(Number(e.target.value))}
                  // An entry's squad and results belong to its season; enter the club again for another season.
                  disabled={!!initial}
                >
                  {seasons.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.year} - {s.fullName || s.name || s.city} (
                      {s.seasonType === 'tournament'
                        ? '🏆 Knockout'
                        : s.seasonType === 'league'
                        ? '📋 League'
                        : '👥 Groups'}
                      {s.isActive ? ' • Active' : ''})
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
                    ? `Active in ${currentSelectedSeason.year} (${currentSelectedSeason.name || currentSelectedSeason.city})`
                    : 'Active this season'}
                </span>
              </label>
          </div>

          {tab === 'squad' && (
            <div className="span-2 in-modal-squad-container">
              {/* SQUAD ADD MODE SWITCHER */}
              <div className="squad-add-mode-toggle">
                {initial && onOpenSquadCanvas && (
                  <button
                    type="button"
                    className="mode-btn"
                    style={{ background: '#0284c7', color: '#fff', border: '1px solid #0284c7' }}
                    onClick={() => {
                      onClose()
                      onOpenSquadCanvas(initial)
                    }}
                  >
                    <Sparkles size={14} /> Formation & pitch canvas
                  </button>
                )}
                <button
                  type="button"
                  className={`mode-btn ${squadAddMode === 'pool' ? 'active' : ''}`}
                  onClick={() => setSquadAddMode('pool')}
                >
                  👥 Add an existing player ({availablePoolPlayers.length})
                </button>
                <button
                  type="button"
                  className={`mode-btn ${squadAddMode === 'new' ? 'active' : ''}`}
                  onClick={() => setSquadAddMode('new')}
                >
                  ➕ Create a new player
                </button>
              </div>

              {squadAddMode === 'pool' ? (
                <div className="inline-add-player-box">
                  <h4>Add an existing player to {initial?.name ?? (name || 'this club')}</h4>
                  <div className="inline-player-fields">
                    <input
                      type="text"
                      placeholder="Search players (name, club, position)…"
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
                          ? 'No available players found'
                          : `-- Choose a player to add (${filteredPoolPlayers.length}) --`}
                      </option>
                      {filteredPoolPlayers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.fullName} ({p.position.toUpperCase()}) · This season: {clubThisSeason(p) ?? 'free agent'}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="button button-admin"
                      onClick={handleAssignPoolPlayer}
                      disabled={assigningPoolPlayer || !selectedPoolPlayerId}
                    >
                      {assigningPoolPlayer ? 'Adding…' : '+ Add to squad'}
                    </button>
                  </div>
                  {squadActionError ? <div className="form-error" style={{ marginTop: '8px' }}>{squadActionError}</div> : null}
                </div>
              ) : (
                <div className="inline-add-player-box">
                  <h4>Register a new player for {initial?.name ?? (name || 'this club')}</h4>
                  <div className="inline-player-fields">
                    <input
                      placeholder="Player full name *"
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
                    <button
                      type="button"
                      className="button button-admin"
                      onClick={handleInlineAddPlayer}
                      disabled={addingPlayer || !newPlayerName.trim()}
                    >
                      {addingPlayer ? 'Adding…' : '+ Add to squad'}
                    </button>
                  </div>
                  {squadActionError ? <div className="form-error" style={{ marginTop: '8px' }}>{squadActionError}</div> : null}
                </div>
              )}

              {/* SQUAD BY POSITION */}
              <div className="modal-squad-grouped">
                {(['goalkeeper', 'defender', 'midfielder', 'forward'] as PlayerPosition[]).map((pos) => {
                  const posPlayers = squadPlayers.filter((p) => p.position === pos)
                  const posNew = initial ? [] : stagedNew.filter((p) => p.position === pos)
                  const posLabels = {
                    goalkeeper: '🧤 Goalkeepers',
                    defender: '🛡️ Defenders',
                    midfielder: '⚙️ Midfielders',
                    forward: '⚡ Forwards',
                  }

                  return (
                    <div key={pos} className="pos-group-section">
                      <h5>
                        {posLabels[pos]} ({posPlayers.length + posNew.length})
                      </h5>
                      {posPlayers.length + posNew.length === 0 ? (
                        <p className="no-pos-players">No {pos}s registered yet.</p>
                      ) : (
                        <div className="pos-players-list">
                          {posPlayers.map((p) => (
                            <div key={p.id} className="squad-player-item">
                              <span className="shirt-badge">{p.shirtNumber ?? '-'}</span>
                              <div className="squad-player-meta">
                                <strong>{p.fullName}</strong>
                                <span>
                                  Active Seasons:{' '}
                                  {seasonLabelsForIds(p.activeSeasonIds, seasons).join(', ') || '—'}
                                </span>
                              </div>
                              <button
                                type="button"
                                className="delete-player-inline-btn"
                                disabled={!!initial && squadSize <= MIN_SQUAD}
                                aria-label={`Remove ${p.fullName} from the squad`}
                                onClick={() => {
                                  if (!initial) {
                                    setStagedIds((ids) => ids.filter((id) => id !== p.id))
                                    return
                                  }
                                  setSquadActionError('')
                                  onSetSquad(p.id, initial.seasonId ?? selectedSeasonId, null).catch((reason: unknown) =>
                                    setSquadActionError(reason instanceof Error ? reason.message : 'Unable to remove this player.'),
                                  )
                                }}
                                title={
                                  initial && squadSize <= MIN_SQUAD
                                    ? shrinkError(initial, squadSize)
                                    : 'Remove from squad (keeps the player in the pool)'
                                }
                              >
                                <UserMinus size={14} />
                              </button>
                            </div>
                          ))}
                          {posNew.map((p) => (
                            <div key={`new-${p.fullName}-${p.shirtNumber ?? ''}`} className="squad-player-item">
                              <span className="shirt-badge">{p.shirtNumber ?? '-'}</span>
                              <div className="squad-player-meta">
                                <strong>{p.fullName}</strong>
                                <span>New player · saved with the club</span>
                              </div>
                              <button
                                type="button"
                                className="delete-player-inline-btn"
                                aria-label={`Remove ${p.fullName}`}
                                onClick={() => setStagedNew((list) => list.filter((item) => item !== p))}
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
  teams,
  seasons,
  onClose,
  onAddPlayer,
  onSetSquad,
  onOpenSquadCanvas,
}: {
  team: Team
  players: Player[]
  allPlayers?: Player[]
  teams: Team[]
  seasons: Season[]
  onClose: () => void
  onAddPlayer: (player: Player) => Promise<void>
  onSetSquad: (playerId: number, seasonId: number, teamId: number | null) => Promise<void>
  onOpenSquadCanvas?: (team: Team) => void
}) {
  const seasonId = team.seasonId ?? defaultSeasonId(seasons) ?? 1
  const [squadMode, setSquadMode] = useState<'pool' | 'new'>('pool')
  const [name, setName] = useState('')
  const [number, setNumber] = useState('')
  const [pos, setPos] = useState<PlayerPosition>('forward')
  const [addError, setAddError] = useState('')

  // Pool state
  const [selectedPoolId, setSelectedPoolId] = useState<number | ''>('')
  const [poolSearch, setPoolSearch] = useState('')
  const [assigning, setAssigning] = useState(false)

  const [adding, setAdding] = useState(false)

  const availablePoolPlayers = useMemo(() => allPlayers.filter((p) => !isInTeam(p, team.id)), [allPlayers, team])
  const clubThisSeason = (p: Player) => teams.find((entry) => entry.id === playerTeamId(p, seasonId))?.name

  // A plain filter: cheap, and it reads the current season's club names.
  const filteredPoolPlayers = (() => {
    if (!poolSearch.trim()) return availablePoolPlayers
    const q = poolSearch.toLowerCase()
    return availablePoolPlayers.filter(
      (p) =>
        p.fullName.toLowerCase().includes(q) ||
        (clubThisSeason(p) ?? '').toLowerCase().includes(q) ||
        p.position.toLowerCase().includes(q)
    )
  })()

  const guard = useSingleFlight()
  const handleAssignPool = () =>
    guard(undefined, async () => {
    if (!selectedPoolId) return
    const targetPlayer = allPlayers.find((p) => p.id === Number(selectedPoolId))
    if (!targetPlayer) return

    setAssigning(true)
    setAddError('')
    try {
      await onSetSquad(targetPlayer.id, seasonId, team.id)
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
  })

  const handleAdd = () =>
    guard(undefined, async () => {
    if (!name.trim()) return
    if (number && !validShirtNumber(number)) {
      setAddError('Shirt numbers run from 1 to 99.')
      return
    }
    setAdding(true)
    setAddError('')
    try {
      await onAddPlayer({
        id: Date.now(),
        squads: [{ seasonId, teamId: team.id }],
        fullName: name.trim(),
        shirtNumber: number ? Number(number) : undefined,
        position: pos,
        nationality: team.countryCode,
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
  })

  const country = getCountry(team.countryCode)
  const groupName = assignedGroupName(seasons.find((season) => season.id === team.seasonId), team.id)

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
              {country.flag} {country.name} · {team.tournamentFormat ?? 'Champions Cup'}
              {groupName ? ` (${groupName})` : ''}
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
              <Sparkles size={14} /> Formation & pitch canvas
            </button>
          )}
          <button
            type="button"
            className={`mode-btn ${squadMode === 'pool' ? 'active' : ''}`}
            onClick={() => setSquadMode('pool')}
          >
            👥 Add an existing player ({availablePoolPlayers.length})
          </button>
          <button
            type="button"
            className={`mode-btn ${squadMode === 'new' ? 'active' : ''}`}
            onClick={() => setSquadMode('new')}
          >
            ➕ Create a new player
          </button>
        </div>

        {squadMode === 'pool' ? (
          <div className="inline-add-player-box">
            <h4>Move an existing player to {team.name}</h4>
            <div className="inline-player-fields">
              <input
                type="text"
                placeholder="Search players (name, club, position)…"
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
                    ? 'No available players found'
                    : `-- Choose a player to add (${filteredPoolPlayers.length}) --`}
                </option>
                {filteredPoolPlayers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName} ({p.position.toUpperCase()}) · This season: {clubThisSeason(p) ?? 'free agent'}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="button button-admin"
                onClick={handleAssignPool}
                disabled={assigning || !selectedPoolId}
              >
                {assigning ? 'Adding…' : '+ Add to squad'}
              </button>
            </div>
            {addError ? <div className="form-error" style={{ marginTop: '8px' }}>{addError}</div> : null}
          </div>
        ) : (
          <div className="inline-add-player-box">
            <h4>Register a new player for {team.name}</h4>
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
                      {seasonBadgesForIds(p.activeSeasonIds, seasons).map((badge) => (
                        <span key={badge.key} className="season-pill" title={badge.full}>
                          {badge.short}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <button
                      className="row-action danger"
                      disabled={players.length <= MIN_SQUAD}
                      onClick={() => {
                        setAddError('')
                        onSetSquad(p.id, seasonId, null).catch((reason: unknown) =>
                          setAddError(reason instanceof Error ? reason.message : 'Unable to remove this player.'),
                        )
                      }}
                      title={players.length <= MIN_SQUAD ? shrinkError(team, players.length) : 'Remove from squad (keeps the player in the pool)'}
                    >
                      <UserMinus size={14} /> Remove
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
  seasons,
  onClose,
  onSave,
}: {
  teams: Team[]
  seasons: Season[]
  onClose: () => void
  onSave: (match: Match) => Promise<void>
}) {
  const [seasonId, setSeasonId] = useState<number | undefined>(() => defaultSeasonId(seasons))

  // Only clubs registered for the chosen season can contest its fixtures.
  // Clubs with no season recorded stay selectable rather than disappearing.
  const names = useMemo(
    () =>
      teams
        .filter((team) => !seasonId || team.seasonId == null || team.seasonId === seasonId)
        .map((team) => team.name),
    [teams, seasonId],
  )
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const guard = useSingleFlight()
  const submit = (event: FormEvent<HTMLFormElement>) =>
    guard(event, async () => {
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
        seasonId,
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
  })

  return (
    <Modal title="Create match fixture" onClose={onClose}>
      <form className="admin-form" onSubmit={submit}>
        <label className="span-2">
          Season *
          <select
            name="seasonId"
            value={seasonId ?? ''}
            onChange={(event) => setSeasonId(Number(event.target.value) || undefined)}
            required
          >
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {seasonLabel(season)}
              </option>
            ))}
          </select>
          <small className="field-hint">
            Fixtures are recorded against a season, so concurrent competitions stay separate.
          </small>
        </label>
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
          <input name="stage" defaultValue="Group A" list="fixture-stages" required />
          <datalist id="fixture-stages">
            {(seasons.find((season) => season.id === seasonId)?.groupLeague?.groups.map((group) => group.name) ?? ['Group A', 'Group B', 'Group Stage']).map((stage) => <option key={stage} value={stage} />)}
            {['Round of 16', 'Quarter-final', 'Semi-final', 'Final', 'Third-place Play-off'].map((stage) => <option key={stage} value={stage} />)}
          </datalist>
          <small className="field-hint">For knockout fixtures, use Round of 16, Quarter-final, Semi-final or Final so the score updates the draw.</small>
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
  onClose,
  onSave,
}: {
  match: Match
  onClose: () => void
  onSave: (match: Match) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const guard = useSingleFlight()
  const submit = (event: FormEvent<HTMLFormElement>) =>
    guard(event, async () => {
    event.preventDefault()
    setSaving(true)
    setSaveError('')
    const data = new FormData(event.currentTarget)
    const homeScoreVal = data.get('homeScore')
    const awayScoreVal = data.get('awayScore')
    const homePenVal = data.get('homePenalties')
    const awayPenVal = data.get('awayPenalties')
    // A shootout needs both sides; a half-filled pair is treated as none.
    const hasShootout = !!homePenVal && !!awayPenVal
    // A scheduled match cannot have a score. Saving one while the status was
    // left on "Scheduled" kept the result out of the table and scorer list,
    // which only count finished matches, so a score marks it as full time.
    const hasScore = homeScoreVal !== '' && homeScoreVal != null && awayScoreVal !== '' && awayScoreVal != null
    const chosenStatus = String(data.get('matchStatus')) as MatchStatus
    const matchStatus: MatchStatus = hasScore && chosenStatus === 'scheduled' ? 'completed' : chosenStatus

    try {
      await onSave({
        ...match,
        stage: String(data.get('stage')),
        venue: String(data.get('venue')),
        date: String(data.get('date')),
        time: String(data.get('time')),
        referee: String(data.get('referee')) || undefined,
        streamUrl: String(data.get('streamUrl')).trim() || undefined,
        matchStatus,
        homeScore: homeScoreVal !== '' ? Number(homeScoreVal) : undefined,
        awayScore: awayScoreVal !== '' ? Number(awayScoreVal) : undefined,
        homePenalties: hasShootout ? Number(homePenVal) : undefined,
        awayPenalties: hasShootout ? Number(awayPenVal) : undefined,
        status: String(data.get('status')) as Match['status'],
      })
      onClose()
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : 'Unable to update match.')
    } finally {
      setSaving(false)
    }
  })

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
              aria-label={`${match.home} score`}
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
              aria-label={`${match.away} score`}
              defaultValue={match.awayScore ?? ''}
              placeholder="0"
              min={0}
              className="score-input"
            />
            <strong>{match.away}</strong>
            <TeamMark name={match.away} />
          </div>
        </div>

        <div className="penalties-keeper-row span-2">
          <small className="penalties-label">Penalty shootout (only for knockout matches level after full time)</small>
          <div className="penalties-inputs">
            <input
              type="number"
              name="homePenalties"
              aria-label={`${match.home} penalties`}
              defaultValue={match.homePenalties ?? ''}
              placeholder="Home"
              min={0}
              className="score-input pen-score-input"
            />
            <span className="pen-sep">–</span>
            <input
              type="number"
              name="awayPenalties"
              aria-label={`${match.away} penalties`}
              defaultValue={match.awayPenalties ?? ''}
              placeholder="Away"
              min={0}
              className="score-input pen-score-input"
            />
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
          <small className="field-hint">Saving a score on a scheduled match marks it Completed, so it counts in the table.</small>
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
  const [error, setError] = useState('')
  const selectedTeamId = selectedTeam === match.home ? match.homeTeamId : match.awayTeamId

  const matchPlayers = useMemo(() => {
    return selectedTeamId != null ? squadOf(players, selectedTeamId) : []
  }, [players, selectedTeamId])

  const guard = useSingleFlight()
  const submitEvent = (event: FormEvent<HTMLFormElement>) =>
    guard(event, async () => {
    event.preventDefault()
    const form = event.currentTarget
    setSaving(true)
    setError('')
    const data = new FormData(form)
    try {
      const player = matchPlayers.find((p) => p.id === Number(data.get('playerId')))
      await onAddEvent({
        id: Date.now(),
        matchId: match.id,
        teamName: selectedTeam,
        teamId: selectedTeamId,
        playerId: player?.id,
        playerName: player?.fullName ?? String(data.get('playerName') ?? '').trim(),
        eventType: String(data.get('eventType')) as MatchEventType,
        minute: Number(data.get('minute')),
        notes: String(data.get('notes')) || undefined,
      })
      form.reset()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The event could not be saved.')
    } finally {
      setSaving(false)
    }
  })

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
          {error ? <p className="form-error" role="alert">{error}</p> : null}
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
                <select key={selectedTeam} name="playerId" required>
                  {matchPlayers.map((p) => (
                    <option key={p.id} value={p.id}>
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
                <option value="assist">🅰️ Assist</option>
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

            <small className="field-hint span-2">
              Goals and scored penalties add one to the club&rsquo;s score; deleting them takes it back off.
            </small>

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

/**
 * Wrap an async handler so a second call while the first is still running is
 * ignored. A button's disabled={saving} only takes effect after React
 * re-renders, so two clicks in quick succession (or Enter plus a click) both
 * got through and created duplicate players. The ignored call still has its
 * default prevented, so a form never falls through to a page reload.
 */
function useSingleFlight() {
  const busy = useRef(false)
  return useCallback(async (event: { preventDefault?: () => void } | undefined, fn: () => Promise<void>) => {
    event?.preventDefault?.()
    if (busy.current) return
    busy.current = true
    try {
      await fn()
    } finally {
      busy.current = false
    }
  }, [])
}

/** The database accepts shirt numbers 1-99 (players_shirt_number_check). */
function validShirtNumber(value: string): boolean {
  const n = Number(value)
  return Number.isInteger(n) && n >= 1 && n <= 99
}

function PlayerForm({
  initial,
  teams,
  seasons,
  onClose,
  onSave,
  onSetSquad,
}: {
  initial: Player | null
  teams: Team[]
  seasons: Season[]
  onClose: () => void
  onSave: (player: Player) => Promise<void>
  onSetSquad: (playerId: number, seasonId: number, teamId: number | null) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // The club picked here is for one season; other seasons keep their squads.
  const [squadSeasonId, setSquadSeasonId] = useState<number>(() => {
    const latest = initial ? latestSquad(initial, seasons.map((season) => season.id)) : undefined
    return latest?.seasonId ?? defaultSeasonId(seasons) ?? seasons[0]?.id ?? 1
  })
  const seasonClubs = teams.filter((team) => team.seasonId === squadSeasonId)
  const currentTeamId = initial ? playerTeamId(initial, squadSeasonId) : undefined

  const guard = useSingleFlight()
  const submit = (event: FormEvent<HTMLFormElement>) =>
    guard(event, async () => {
    event.preventDefault()
    setSaving(true)
    setSaveError('')
    const data = new FormData(event.currentTarget)
    const teamId = Number(data.get('teamId')) || undefined
    const foundTeam = teams.find((t) => t.id === teamId)

    try {
      await onSave({
        id: initial?.id ?? Date.now(),
        squads: initial?.squads ?? (teamId ? [{ seasonId: squadSeasonId, teamId }] : []),
        fullName: String(data.get('fullName')),
        shirtNumber: data.get('shirtNumber') ? Number(data.get('shirtNumber')) : undefined,
        position: String(data.get('position')) as PlayerPosition,
        birthYear: data.get('birthYear') ? Number(data.get('birthYear')) : undefined,
        nationality: String(data.get('nationality')) || foundTeam?.countryCode || 'TR',
        photoUrl: String(data.get('photoUrl')).trim() || undefined,
        isCaptain: data.get('isCaptain') === 'on',
      })
      // Joining, transferring or leaving changes squads; the database keeps each above the minimum.
      if (initial && teamId !== currentTeamId) await onSetSquad(initial.id, squadSeasonId, teamId ?? null)
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
  })

  return (
    <Modal title={initial ? `Edit Player: ${initial.fullName}` : 'Register New Player'} onClose={onClose}>
      <form className="admin-form" onSubmit={submit}>
        <label className="span-2">
          Full Name *
          <input name="fullName" defaultValue={initial?.fullName ?? ''} placeholder="e.g. Emre Yılmaz" required />
        </label>

        <label>
          Season
          <select value={squadSeasonId} onChange={(e) => setSquadSeasonId(Number(e.target.value))}>
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {seasonLabel(season)}
              </option>
            ))}
          </select>
        </label>

        <label>
          Club this season
          <select name="teamId" key={squadSeasonId} defaultValue={currentTeamId ? String(currentTeamId) : ''}>
            <option value="">No club this season</option>
            {seasonClubs.map((t) => (
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

        <ImageUploadField
          name="photoUrl"
          label="Cutout Photo"
          folder="players"
          defaultValue={initial?.photoUrl ?? ''}
          hint="A background-free PNG works best — it is layered over the player's flag on roster cards."
        />
        {initial && initial.squads.length > 0 ? (
          <div className="span-2 season-picker-field">
            <span className="field-label">Squads by season</span>
            <div className="season-picker-chips">
              {initial.squads.map((entry) => {
                const season = seasons.find((item) => item.id === entry.seasonId)
                return (
                  <span key={entry.seasonId} className="season-chip-btn active">
                    {season ? seasonLabel(season) : 'Season'} · {teams.find((team) => team.id === entry.teamId)?.name ?? 'Club'}
                  </span>
                )
              })}
            </div>
          </div>
        ) : null}

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
  seasons,
  onClose,
  onSave,
}: {
  initial: Story | null
  seasons: Season[]
  onClose: () => void
  onSave: (story: Story) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const guard = useSingleFlight()
  const submit = (event: FormEvent<HTMLFormElement>) =>
    guard(event, async () => {
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
        seasonId: Number(data.get('seasonId')) || undefined,
        publishedAt: initial?.publishedAt ?? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date()),
      })
      onClose()
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : 'Unable to save story.')
    } finally {
      setSaving(false)
    }
  })

  return (
    <Modal title={initial ? 'Edit Story Article' : 'Write New Story'} onClose={onClose}>
      <form className="admin-form" onSubmit={submit}>
        <label className="span-2">
          Headline / Title *
          <input name="title" defaultValue={initial?.title ?? ''} placeholder="Enter article headline" required />
        </label>

        <label className="span-2">
          Season
          <select name="seasonId" defaultValue={initial?.seasonId ?? ''}>
            <option value="">All seasons — not tied to one campaign</option>
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {seasonLabel(season)}
              </option>
            ))}
          </select>
          <small className="field-hint">
            The public newsroom shows this story only while its season is selected. Leave on
            &ldquo;All seasons&rdquo; for evergreen pieces such as rules or venue guides.
          </small>
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
            <option value="Archived">Archived</option>
          </select>
          <small className="field-hint">
            Archived keeps a story on record without publishing it. It is hidden from the public site.
          </small>
        </label>

        <ImageUploadField
          name="coverImageUrl"
          label="Cover Image"
          folder="articles"
          defaultValue={initial?.coverImageUrl ?? ''}
          hint="Used as the hero image on the newsroom carousel and the article page."
        />

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


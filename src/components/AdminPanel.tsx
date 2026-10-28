import { AdminLanguageSwitch } from './AdminLanguageSwitch'
import { useAdminLanguage } from '../i18n/AdminLanguageContext'
import { broadcastUrlError } from '../lib/broadcast'
import {
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
import { isStoryPublic, publicationDate, publicationInput } from '../lib/publication'
import { defaultMatchLineups, goalScore } from '../lib/matchRules'
import { knockoutRoundSize } from '../lib/matchStages'
import { MatchLineupFields } from './MatchLineupFields'
import { ClubRegistry, RegisteredClubForm } from './ClubRegistry'
import { PlayerSuspensions } from './PlayerSuspensions'
import { LotsOrderForm } from './LotsOrderForm'
import { reportAssetSaveFailure } from '../lib/assetSaveUtils'
import { ImageUploadField } from './ImageUploadField'
import { COUNTRIES, getCountry } from '../lib/countries'
import { generateEmptyBracket } from '../lib/bracketUtils'
import { assignedGroupName, generateEmptyGroupLeague } from '../lib/groupLeagueUtils'
import { qualificationOptions, tableStageMatches } from '../lib/qualificationUtils'
import type { FixtureOptions } from '../lib/fixtureUtils'
import { FixtureGenerator } from './FixtureGenerator'
import { QualificationPanel } from './QualificationPanel'
import { computeGroupStandings, computeTopScorers, isCountableMatch, shootoutError } from '../lib/standingsUtils'
import { defaultSeasonId, seasonBadgesForIds, seasonLabel, seasonLabelsForIds } from '../lib/seasonLabels'
import {
  mediaRepository,
  clubsRepository,
  moderationRepository,
  siteSettingsRepository,
  sponsorsRepository,
  usersRepository,
} from '../services/tournamentRepository'
import { DEFAULT_SITE_SETTINGS, type SiteSettings } from '../lib/siteSettings'
import {
  HOST_CITIES,
  type AdminSection,
  type Club,
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
import { MIN_SQUAD, clubsToEnter, isInTeam, latestSquad, playerTeamId, squadOf } from '../lib/squadUtils'
import type { EntryRoster, NewSquadPlayer } from '../services/tournamentRepository'
import type { Lineup } from '../lib/formations'

type Props = {
  clubs: Club[]
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
  onSaveLineup: (teamId: number, lineup: Lineup) => Promise<void>
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
  clubs,
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
  onSaveLineup,
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
  const { tr } = useAdminLanguage()
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
  const [newMatchSeasonId, setNewMatchSeasonId] = useState<number | undefined>()
  const [editingRegistration, setEditingRegistration] = useState<Club | null | undefined>(undefined)
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
          tr("{value0} club{value1} will be deleted", { value0: seasonTeams.length, value1: seasonTeams.length === 1 ? '' : 's' }),
          tr("{value0} player{value1} leave this season's squads; their profiles and other seasons stay", { value0: seasonPlayers.length, value1: seasonPlayers.length === 1 ? '' : 's' }),
        ]
      : ['Every club entry in this season is deleted; players keep their profiles']
    // The database unpublishes these before the delete, so they do not turn into content shown in every season.
    const seasonStories = stories.filter((story) => story.seasonId === id).length
    const seasonMedia = media.filter((asset) => asset.seasonId === id).length
    if (seasonStories + seasonMedia > 0) {
      cascadeLines.push(
        tr("{value0} article{value1} and {value2} media item{value3} are kept as unpublished drafts with no season", { value0: seasonStories, value1: seasonStories === 1 ? '' : 's', value2: seasonMedia, value3: seasonMedia === 1 ? '' : 's' }),
      )
    }

    const ok = await confirm({
      title: 'Delete season',
      body: (
        <>
          {tr('Delete {name} and everything recorded under it?', { name: label })}</>
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
            {tr('{name} appears in {count} fixtures. A club with match history cannot be deleted. Delete or reassign those fixtures first.', { name: label, count: fixtures.length })}</>
        ),
        confirmLabel: 'Close',
      })
      return
    }

    const ok = await confirm({
      title: 'Delete club',
      body: (
        <>
          {tr('Delete {name}?', { name: label })}
        </>
      ),
      consequences: [
        tr("{value0} player{value1} leave{value2} this season's squad; their profiles and other seasons stay", { value0: squad.length, value1: squad.length === 1 ? '' : 's', value2: squad.length === 1 ? 's' : '' }),
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
          {tr('Delete {name} and their squad places in every season?', { name: player?.fullName ?? tr('this player') })}</>
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
          {tr("Delete ")}<strong>{match ? tr("{value0} v {value1}", { value0: match.home, value1: match.away }) : tr("this fixture")}</strong>
          {match?.date ? tr(" on {value0}", { value0: match.date }) : ''}?
        </>
      ),
      consequences: [
        ...(eventCount > 0 ? [tr("{value0} match event{value1} will be deleted", { value0: eventCount, value1: eventCount === 1 ? '' : 's' })] : []),
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
          {tr('Delete {name}?', { name: story?.title ?? tr("this story") })}
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
          {tr("Remove the ")}{event?.eventType.replace('_', ' ') ?? tr("event")} {tr(" for")}{' '}
          <strong>{event?.playerName ?? tr("this player")}</strong>
          {event?.minute ? tr(" at {value0}'", { value0: event.minute }) : ''}?
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

  const chooseSection = (next: AdminSection) => {
    window.location.assign(next === 'Overview' ? '#admin' : `#admin/${next.toLowerCase()}`)
    setSection(next)
    setSidebarOpen(false)
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="admin-shell">
      {sidebarOpen ? <button className="admin-sidebar-scrim" aria-label={tr("Close admin menu")} onClick={() => setSidebarOpen(false)} /> : null}
      <aside className={sidebarOpen ? 'admin-sidebar is-open' : 'admin-sidebar'}>
        <div className="sidebar-top">
          <Brand admin />
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label={tr("Close menu")}>
            <X />
          </button>
        </div>
        <nav aria-label={tr("Admin sections")}>
          {visibleSections.map(({ label, icon: Icon }) => (
            <button className={activeSection === label ? 'active' : ''} key={label} onClick={() => chooseSection(label)}>
              <Icon />
              {tr(label)}
            </button>
          ))}
        </nav>
        <div className="admin-user">
          <CircleUserRound />
          <div>
            <strong>{profile.fullName}</strong>
            <span>{tr(ROLE_LABELS[profile.role])}</span>
          </div>
          <button aria-label={tr("Sign out")} onClick={() => void onSignOut()}>
            <LogOut />
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <button className="admin-menu" onClick={() => setSidebarOpen(true)} aria-label={tr("Open admin menu")} aria-expanded={sidebarOpen}>
            <Menu />
          </button>
          <h1>{tr(activeSection)}</h1>
          <div className="admin-top-actions">
            <AdminLanguageSwitch />
            <button className="site-switch" onClick={onViewSite}>
              {tr("View site")}</button>
            {/* A shortcut from the dashboard only. Teams has its own "Register New
                Club" button, and on Players it read as the wrong action. */}
            {activeSection === 'Overview' && allowed('teams') && (
              <button className="button button-admin" onClick={() => setEditingRegistration(null)}>
                <Plus />
                {tr("Add Club")}</button>
            )}
          </div>
        </header>

        <div className="admin-content">
          {error ? (
            <div className="admin-error" role="alert">
              {tr(error)}
            </div>
          ) : null}

          {activeSection === 'Overview' && (
            <SeasonOverview
              seasons={seasons}
              teams={teams}
              players={players}
              matches={matches}
              stories={stories}
              role={profile.role}
              onOpenModal={(m) => m === 'team' ? setEditingRegistration(null) : setModal(m)}
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
            <>
            <ClubRegistry clubs={clubs} seasons={seasons} onNew={() => setEditingRegistration(null)} onEdit={setEditingRegistration}
              entered={(clubId, seasonId) => teams.some((t) => t.clubId === clubId && t.seasonId === seasonId)}
              onEnter={(club, seasonId) => {
                setEditingTeam(null); setCreatedClub(null)
                setEnteringClub({ team: { id: -club.id, clubId: club.id, seasonId, name: club.name,
                  countryCode: club.countryCode ?? 'TR', color: club.color ?? '#63e35b', logoUrl: club.logoUrl, played: 0, goalDifference: 0, points: 0 }, squadIds: [] })
                setModal('team')
              }} />
            <TeamsManager
              teams={teams}
              seasons={seasons}
              players={players}
              onEnterClub={(team, seasonId) => {
                setEditingTeam(null)
                setEnteringClub({ team: { ...team, seasonId }, squadIds: [] })
                setModal('team')
              }}
              onDelete={confirmDeleteTeam}
              onEdit={(team) => {
                setEditingTeam(team)
                setModal('team')
              }}
              onManageSquad={(team) => setSquadTeam(team)}
              onOpenSquadCanvas={(team) => setCanvasSquadTeam(team)}
              onAdd={() => setEditingRegistration(null)}
            />
            </>
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
              onAdd={(seasonId) => { setNewMatchSeasonId(seasonId); setModal('match') }}
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
        <MatchForm teams={teams} seasons={seasons} initialSeasonId={newMatchSeasonId} onClose={() => { setNewMatchSeasonId(undefined); setModal(null) }} onSave={onAddMatch} />
      )}

      {editingMatch && (
        <MatchScoreModal
          match={editingMatch}
          teams={teams}
          players={players}
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
          hasMatches={!!teamInModal && matches.some((m) => m.homeTeamId === teamInModal.id || m.awayTeamId === teamInModal.id)}
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

      {editingRegistration !== undefined && <RegisteredClubForm initial={editingRegistration} players={players}
        onClose={() => setEditingRegistration(undefined)} onSave={async (club, added) => {
          await clubsRepository.save(club, added); await onRefresh()
        }} />}

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
          onSaveSquad={async (assignedIds, unassignedIds, lineup) => {
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
            await onSaveLineup(canvasSquadTeam.id, lineup)
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

function SeasonOverview({ seasons, teams, players, matches, stories, role, onOpenModal, onManageMatchScore }: {
  seasons: Season[]; teams: Team[]; players: Player[]; matches: Match[]; stories: Story[]; role: AuthProfile['role']
  onOpenModal: (value: 'season' | 'match' | 'team' | 'player' | 'story') => void
  onManageMatchScore: (match: Match) => void
}) {
  const { tr } = useAdminLanguage()
  const [selected, setSelected] = useState<number | undefined>(() => defaultSeasonId(seasons))
  const id = seasons.some((s) => s.id === selected) ? selected : defaultSeasonId(seasons)
  const articles = stories.filter((s) => s.seasonId === id)
  return <>
    <label className="filter-group">{tr("Tournament")}<select aria-label={tr("Overview tournament")} value={id ?? ''} onChange={(e) => setSelected(Number(e.target.value))}>
        {seasons.map((s) => <option key={s.id} value={s.id}>{seasonLabel(s)}</option>)}
      </select>
    </label>
    <Overview seasonsCount={id ? 1 : 0} teams={teams.filter((t) => t.seasonId === id)}
      players={players.filter((p) => p.squads.some((s) => s.seasonId === id))}
      matches={matches.filter((m) => m.seasonId === id)}
      published={articles.filter((s) => isStoryPublic(s)).length}
      draft={articles.filter((s) => s.status === 'Draft').length}
      scheduled={articles.filter((s) => s.status === 'Scheduled' && !isStoryPublic(s)).length}
      role={role} onOpenModal={onOpenModal} onManageMatchScore={onManageMatchScore} />
  </>
}

function Overview({
  seasonsCount,
  teams,
  players,
  matches,
  published,
  draft,
  scheduled,
  role,
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
  role: AuthProfile['role']
  onOpenModal: (value: 'season' | 'match' | 'team' | 'player' | 'story') => void
  onManageMatchScore: (match: Match) => void
}) {
  const { tr } = useAdminLanguage()
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
            <span>{tr(label)}</span>
          </div>
        ))}
      </section>

      <div className="overview-grid">
        <section className="admin-panel upcoming">
          <div className="panel-header-row">
            <h2>{tr("Live & Upcoming matches")}</h2>
          </div>
          <MatchTable matches={matches.filter((match) => match.matchStatus === 'live' || match.matchStatus === 'scheduled').slice(0, 4)} onEdit={can(role, 'matches') ? onManageMatchScore : undefined} />
        </section>

        <section className="admin-panel activity">
          <h2>{tr("Latest results")}</h2>
          {/*
            This panel used to be four hardcoded rows with invented staff names
            and fabricated timestamps. There is no audit trail to build a real
            activity feed from — audit_logs exists but nothing writes to it — so
            it now shows the most recent actual results instead of inventing
            history. Attribution returns when audit logging does.
          */}
          {recentResults.length === 0 ? (
            <p className="empty-text">
              {tr("No results recorded yet. Completed fixtures appear here as scores are entered.")}</p>
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
          <h2>{tr("Article status pipeline")}</h2>
          <div className="pipeline-cards-row">
            <div className="pipeline-card published">
              <div className="pipeline-icon">
                <CheckCircle2 size={22} />
              </div>
              <div className="pipeline-info">
                <span>{tr("Published")}</span>
                <strong>{published}</strong>
              </div>
            </div>

            <div className="pipeline-card draft">
              <div className="pipeline-icon">
                <Clock size={22} />
              </div>
              <div className="pipeline-info">
                <span>{tr("Draft")}</span>
                <strong>{draft}</strong>
              </div>
            </div>

            <div className="pipeline-card scheduled">
              <div className="pipeline-icon">
                <CalendarDays size={22} />
              </div>
              <div className="pipeline-info">
                <span>{tr("Scheduled")}</span>
                <strong>{scheduled}</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="admin-panel quick-actions">
          <h2>{tr("Quick actions")}</h2>
          <div className="quick-actions-grid">
            {can(role, 'seasons') && <button onClick={() => onOpenModal('season')}>
              <Trophy size={18} />
              <span>{tr("New season")}</span>
            </button>}
            {can(role, 'teams') && <button onClick={() => onOpenModal('team')}>
              <Shield size={18} />
              <span>{tr("Register Club")}</span>
            </button>}
            {can(role, 'players') && <button onClick={() => onOpenModal('player')}>
              <UserPlus size={18} />
              <span>{tr("Add Player")}</span>
            </button>}
            {can(role, 'matches') && <button onClick={() => onOpenModal('match')}>
              <CalendarDays size={18} />
              <span>{tr("Schedule Match")}</span>
            </button>}
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
  const { tr } = useAdminLanguage()
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
            <span>{tr("Admin")}</span>
            <i>/</i>
            <strong>{tr("Seasons")}</strong>
          </div>
          <h2>
            {tr("Seasons & Tournaments (")}{filtered.length}
            {selectedYearFilter !== 'all' ? ` · ${selectedYearFilter}` : ''})
          </h2>
        </div>
      </div>

      <div className="seasons-table-card">
        <div className="seasons-controls-bar">
          <div className="seasons-left-actions">
            <button className="button-yeni-ekle" onClick={onAdd}>
              <Plus size={16} /> {tr(" New Season")}</button>

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
                title={tr("Filter by year")}
              >
                <option value="all">{tr("All years (")}{seasons.length})</option>
                {availableYears.map((yr) => {
                  const count = seasons.filter((s) => s.year === yr).length
                  return (
                    <option key={yr} value={yr}>
                      {yr} ({count} {count === 1 ? tr("competition") : tr("competitions")})
                    </option>
                  )
                })}
              </select>
              <ChevronDown size={14} className="dropdown-chevron-icon" />
            </div>

            <span className="data-source seasons-bar-source">
              {backend === 'supabase' ? <Cloud size={14} /> : <HardDrive size={14} />}
              {backend === 'supabase' ? tr("Supabase") : tr("Local persistent")}
            </span>
          </div>

          <div className="seasons-filter-right">
            <div className="gosterim-group">
              <label>{tr("Show:")}</label>
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
              <label>{tr("Search:")}</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  setCurrentPage(1)
                }}
                placeholder={tr("Search seasons or cities…")}
              />
            </div>
          </div>
        </div>

        <div className="seasons-table-wrap">
          <table className="seasons-table">
            <thead>
              <tr>
                <th scope="col" style={{ width: '40px' }} aria-label={tr("Sort")}>
                  <span className="th-sort-icon">▼</span>
                </th>
                <th scope="col">{tr("Title")}</th>
                <th scope="col">{tr("City")}</th>
                <th scope="col">{tr("Year")}</th>
                <th scope="col">{tr("Status")}</th>
                <th scope="col" style={{ width: '150px', textAlign: 'center' }}>{tr("Actions")}</th>
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
                      {tr(SEASON_STATUS_LABEL[season.status ?? 'published'])}
                    </span>
                    {season.status === 'published' && season.id === defaultSeasonId(seasons) ? <span className="season-status-pill active">{tr("Public default")}</span> : null}
                  </td>
                  <td>
                    <div className="seasons-action-buttons">
                      {season.seasonType === 'group_league' ? (
                        <button
                          className="btn-season-action group-league"
                          onClick={() => onOpenGroupLeague(season)}
                          title={tr("Open group tables")}
                          aria-label={tr("Open group tables for {value0}", { value0: season.fullName })}
                        >
                          <Grid size={15} aria-hidden="true" />
                        </button>
                      ) : season.seasonType === 'league' ? (
                        <button
                          className="btn-season-action league"
                          onClick={() => onOpenLeague(season)}
                          title={tr("Open league table")}
                          aria-label={tr("Open league table for {value0}", { value0: season.fullName })}
                        >
                          <List size={15} aria-hidden="true" />
                        </button>
                      ) : (
                        <button
                          className="btn-season-action bracket"
                          onClick={() => onOpenBracket(season)}
                          title={tr("Open knockout bracket")}
                          aria-label={tr("Open knockout bracket for {value0}", { value0: season.fullName })}
                        >
                          <Trophy size={15} aria-hidden="true" />
                        </button>
                      )}
                      {season.bracket?.qualification ? <button
                        className="btn-season-action bracket"
                        onClick={() => onOpenBracket(season)}
                        title={tr("Open knockout bracket")}
                        aria-label={tr("Open knockout bracket for {value0}", { value0: season.fullName })}
                      ><Trophy size={15} aria-hidden="true" /></button> : null}
                      <button
                        className="btn-season-action settings"
                        onClick={() => onEdit(season)}
                        title={tr("Edit season")}
                        aria-label={tr("Edit season {value0}", { value0: season.fullName })}
                      >
                        <Settings size={15} aria-hidden="true" />
                      </button>
                      <button
                        className="btn-season-action delete"
                        onClick={() => void onDelete(season.id)}
                        title={tr("Delete season")}
                        aria-label={tr("Delete season {value0}", { value0: season.fullName })}
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
                    {seasons.length ? tr("No seasons match these filters.") : tr("No seasons yet. Use \"New Season\" to add the first one.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="seasons-table-footer">
          <span>
            {tr("Showing ")}{filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} -{' '}
            {Math.min(currentPage * pageSize, filtered.length)} {tr(" of ")}{filtered.length}
          </span>
          <div className="seasons-pagination-btns">
            <button
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              {tr("← Previous")}</button>
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
              {tr("Next →")}</button>
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
  const { tr } = useAdminLanguage()
  // The draw builders place this season's club entries only, as the Seasons table's buttons do.
  const seasonTeams = teams.filter((team) => team.seasonId == null || team.seasonId === initial?.id)
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
  const [startDate, setStartDate] = useState(initial?.startDate ?? '')
  const [endDate, setEndDate] = useState(initial?.endDate ?? '')
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
        startDate,
        endDate: endDate || undefined,
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
      <Modal title={initial ? tr("Edit Season: {value0}", { value0: initial.fullName }) : tr("New Season")} onClose={onClose}>
        <form className="admin-form" onSubmit={submit}>
          <label>
            {tr("City *")}<select value={city} onChange={(e) => setCity(e.target.value)}>
              {HOST_CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label>
            {tr("Year *")}<select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {yearsList.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>

          <label className="span-2">
            {tr("Season name *")}<input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tr("e.g. International Corporate Cup")}
              required
            />
          </label>

          <label className={seasonType === 'league' ? 'span-2' : ''}>
            {tr("Format *")}<select
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
              <option value="tournament">{tr("🏆 Tournament (knockout bracket)")}</option>
              <option value="league">{tr("⚽ League (single table)")}</option>
              <option value="group_league">{tr("🗂️ Group league (multiple groups)")}</option>
              <option value="league_knockout">{tr("⚽ League → Knockout (single table, then elimination)")}</option>
              <option value="group_league_knockout">{tr("🗂️ Groups → Knockout (group tables, then elimination)")}</option>
            </select>
          </label>

          {seasonType === 'tournament' && (
            <label>
              {tr("Number of teams *")}<select
                value={teamCount}
                onChange={(e) => handleTournamentTeamCountChange(Number(e.target.value))}
              >
                <option value={4}>{tr("4 teams (semi-finals → final)")}</option>
                <option value={8}>{tr("8 teams (quarter-finals → final)")}</option>
                <option value={16}>{tr("16 teams (round of 16 → final)")}</option>
              </select>
            </label>
          )}

          {seasonType === 'group_league' && (
            <label>
              {tr("Number of groups *")}<select
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
                    {c} {tr(" groups (")}{c === 2 ? tr("A, B") : c === 4 ? tr("A, B, C, D") : tr("{value0} groups", { value0: c })})
                  </option>
                ))}
              </select>
            </label>
          )}

          {knockout && seasonType !== 'tournament' ? <div className="span-2 qualification-settings">
            <label>
              {seasonType === 'group_league' ? tr("Qualifiers per group") : tr("Qualifiers from the table")}
              <select value={qualifiersPerTable} onChange={(event) => setQualifiersPerTable(Number(event.target.value))}>
                {qualificationOptions(seasonType === 'group_league' ? groupCount : 1).map((count) => <option key={count} value={count}>{tr("Top ")}{count}</option>)}
              </select>
            </label>
            <p>{qualificationOptions(seasonType === 'group_league' ? groupCount : 1).length
              ? tr("{value0} clubs enter the knockout stage. Assign clubs to the table(s), enter results in Matches, then generate the draw from Standings.", { value0: qualifiersPerTable * (seasonType === 'group_league' ? groupCount : 1) })
              : tr("Choose 2, 4 or 8 groups for a knockout stage.")}</p>
          </div> : null}

          {seasonType === 'tournament' && (
            <div className="span-2 season-bracket-launch-box">
              <div className="bracket-launch-info">
                <Trophy size={20} className="trophy-accent" />
                <div>
                  <strong>{tr("Knockout bracket")}</strong>
                  <span>
                    {bracket
                      ? tr("{value0}-team bracket set up (edit the draw and pairings)", { value0: teamCount })
                      : tr("Empty {value0}-team bracket", { value0: teamCount })}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="button button-admin"
                onClick={() => setOpenBracketBuilder(true)}
              >
                <Trophy size={15} /> {tr(" Open bracket")}</button>
            </div>
          )}

          {seasonType === 'league' && (
            <div className="span-2 season-bracket-launch-box">
              <div className="bracket-launch-info">
                <Trophy size={20} className="trophy-accent" />
                <div>
                  <strong>{tr("League table")}</strong>
                  <span>
                    {league && league.slots.length > 0
                      ? tr("{value0} teams in the table (edit order and teams)", { value0: league.slots.length })
                      : tr("Empty league table (drag clubs in)")}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="button button-admin"
                onClick={() => setOpenLeagueBuilder(true)}
              >
                {tr("⚽ Open league table")}</button>
            </div>
          )}

          {seasonType === 'group_league' && (
            <div className="span-2 season-bracket-launch-box">
              <div className="bracket-launch-info">
                <Trophy size={20} className="trophy-accent" />
                <div>
                  <strong>{tr("Group tables (")}{groupCount} {tr(" groups)")}</strong>
                  <span>
                    {groupLeague && groupLeague.groups.some((g) => g.slots.length > 0)
                      ? tr("{value0} teams assigned to groups", { value0: groupLeague.groups.reduce((acc, g) => acc + g.slots.length, 0) })
                      : tr("{value0} empty groups (drag clubs in)", { value0: groupCount })}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="button button-admin"
                onClick={() => setOpenGroupLeagueBuilder(true)}
              >
                {tr("🗂️ Open group tables")}</button>
            </div>
          )}

          <label className="span-2">
            {tr("Visibility")}<select value={status} onChange={(e) => setStatus(e.target.value as SeasonStatus)}>
              <option value="draft">{tr("Draft — hidden from the public site")}</option>
              <option value="published">{tr("Published — shown on the public site")}</option>
              <option value="archived">{tr("Archived — hidden from the public site")}</option>
            </select>
          </label>

          <label>{tr("Start date *")}<input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
          <label>{tr("End date")}<input type="date" min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
          <small className="field-hint span-2">{tr("The latest published tournament by start date opens by default across all cities, including future tournaments.")}</small>

          {saveError ? <div className="form-error span-2">{tr(saveError)}</div> : null}

          <FormActions onClose={onClose} label={initial ? tr("Save Changes") : tr("Add season")} saving={saving} />
        </form>
      </Modal>

      {openBracketBuilder && (
        <BracketCanvasModal
          seasonTitle={fullName || 'Turnuva'}
          teams={seasonTeams}
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
          teams={seasonTeams}
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
          teams={seasonTeams}
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
  /** Register a new club, starting on the season being viewed (if one is). */
  onAdd: (seasonId?: number) => void
}) {
  const { tr } = useAdminLanguage()
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

  const filteredTeams = useMemo(() => {
    return teams.filter((team) => {
      if (searchTerm && !team.name.toLowerCase().includes(searchTerm.toLowerCase())) return false
      if (countryFilter !== 'All' && team.countryCode !== countryFilter) return false
      return true
    })
  }, [teams, searchTerm, countryFilter])

  return (
    <section className="manager-view">
      <div className="manager-head">
        <div>
          <h2>{tr("Teams & Participating Clubs (")}{teams.length})</h2>
          <p>{tr("The foundational data entry point: manage club branding, logos, country flags, and rosters.")}</p>
        </div>
        <div className="manager-head-actions">
          {enterable.length > 0 && seasonFilter !== 'all' ? (
            <select
              aria-label={tr("Enter a club from another season")}
              value=""
              onChange={(e) => {
                const team = enterable.find((item) => item.id === Number(e.target.value))
                if (team) onEnterClub(team, seasonFilter)
              }}
            >
              <option value="">{tr("Enter an existing club in this season…")}</option>
              {enterable.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name} {tr(" · last in ")}{seasonName(team.seasonId)}
                </option>
              ))}
            </select>
          ) : null}
          <button className="button button-admin" onClick={() => onAdd(seasonFilter === 'all' ? undefined : seasonFilter)}>
            <Plus />
            {tr("Register New Club")}</button>
        </div>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="filter-bar">
        <div className="filter-group">
          <CalendarDays size={16} />
          <span>{tr("Season:")}</span>
          <select
            value={seasonFilter}
            onChange={(e) => setSeasonFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          >
            <option value="all">{tr("All seasons")}</option>
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
            placeholder={tr("Search by club name...")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filter-group">
          <Globe size={16} />
          <span>{tr("Country:")}</span>
          <select value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)}>
            <option value="All">{tr("All Countries")}</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {tr(c.name)}
              </option>
            ))}
          </select>
        </div>



        <div className="view-mode-toggle">
          <button
            className={viewMode === 'table' ? 'active' : ''}
            onClick={() => setViewMode('table')}
            title={tr("Table View")}
          >
            <List size={16} />
          </button>
          <button
            className={viewMode === 'grid' ? 'active' : ''}
            onClick={() => setViewMode('grid')}
            title={tr("Grid View")}
          >
            <Grid size={16} />
          </button>
        </div>
      </div>

      {/* TABLE VIEW */}
      {viewMode === 'table' ? (
        <div className="admin-panel table-scroll">
          <table className="admin-table teams-table">
            <thead>
              <tr>
                <th scope="col">{tr("CLUB & CREST")}</th>
                <th scope="col">{tr("COUNTRY")}</th>
                <th scope="col">{tr("TOURNAMENT & GROUP")}</th>
                <th scope="col">{tr("MANAGER / COACH")}</th>
                <th scope="col">{tr("SQUAD STATUS")}</th>
                <th scope="col">{tr("STANDINGS")}</th>
                <th scope="col">{tr("ACTIONS")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredTeams.map((team) => {
                const squad = squadOf(players, team.id)
                const country = getCountry(team.countryCode)

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
                        <span>{tr(country.name)}</span>
                      </span>
                    </td>
                    <td>
                      <div className="tournament-tag-group">
                        <span className="tournament-pill">{seasonName(team.seasonId)}</span>
                        <span className="group-pill">{assignedGroupName(seasons.find((season) => season.id === team.seasonId), team.id) ?? tr("Not drawn")}</span>
                      </div>
                    </td>
                    <td>
                      <div className="staff-info">
                        <strong>{team.managerName || '—'}</strong>
                        <span>{tr("Coach: ")}{team.coachName || '—'}</span>
                      </div>
                    </td>
                    <td>
                      <div className="squad-indicator">
                        <span className="squad-badge complete">
                          <Users size={13} aria-hidden="true" /> {squad.length} {tr(" Players (Registered)")}</span>
                      </div>
                    </td>
                    <td>
                      <div className="standings-mini">
                        <strong>{team.points} {tr(" pts")}</strong>
                        <span>({team.played}{tr("P / GD: ")}{team.goalDifference > 0 ? `+${team.goalDifference}` : team.goalDifference})</span>
                      </div>
                    </td>
                    <td>
                      <div className="row-actions-group">
                        {onOpenSquadCanvas && (
                          <button
                            className="row-action"
                            style={{ color: '#0284c7', borderColor: '#bae6fd', background: '#f0f9ff' }}
                            onClick={() => onOpenSquadCanvas(team)}
                            title={tr("Formation & pitch canvas")}
                            aria-label={tr("Formation and pitch canvas for {value0}", { value0: team.name })}
                          >
                            <Sparkles size={14} aria-hidden="true" /> <span className="row-action-label">{tr("Pitch")}</span>
                          </button>
                        )}
                        <button
                          className="row-action secondary"
                          onClick={() => onManageSquad(team)}
                          title={tr("Manage Squad Roster")}
                          aria-label={tr("Manage squad roster for {value0}", { value0: team.name })}
                        >
                          <Users size={14} aria-hidden="true" /> <span className="row-action-label">{tr("Squad")}</span> ({squad.length})
                        </button>
                        <button
                          className="row-action"
                          onClick={() => onEdit(team)}
                          title={tr("Edit Club Details")}
                          aria-label={tr("Edit {value0} details", { value0: team.name })}
                        >
                          <Edit2 size={14} aria-hidden="true" /> <span className="row-action-label">{tr("Edit")}</span>
                        </button>
                        <button
                          className="row-action danger"
                          onClick={() => void onDelete(team.id)}
                          title={tr("Delete Club")}
                          aria-label={tr("Delete club {value0}", { value0: team.name })}
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
                    {tr("No clubs found matching your search.")}</td>
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

            return (
              <div className="team-admin-card" key={team.id}>
                <div
                  className="team-card-banner"
                  style={{
                    background: `linear-gradient(135deg, ${team.color} 0%, ${team.secondaryColor || '#071525'} 100%)`,
                  }}
                >
                  <span className="card-flag-badge">
                    {country.flag} {tr(country.name)}
                  </span>
                  <span className="card-format-badge">{seasonName(team.seasonId)}</span>
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
                      <span className="card-group-label">{assignedGroupName(seasons.find((season) => season.id === team.seasonId), team.id) ?? tr("Not drawn")}</span>
                    </div>
                  </div>

                  <p className="team-card-bio">{team.bio || tr("Participating member in the CCL Cup.")}</p>

                  <div className="team-card-meta">
                    <div>
                      <span>{tr("Manager")}</span>
                      <strong>{team.managerName || '—'}</strong>
                    </div>
                    <div>
                      <span>{tr("Coach")}</span>
                      <strong>{team.coachName || '—'}</strong>
                    </div>
                  </div>

                  <div className="team-card-squad-status">
                    <span className="squad-badge complete">
                      <Users size={13} aria-hidden="true" /> {squad.length} {tr(" registered players")}</span>
                  </div>

                  <div className="team-card-actions">
                    {onOpenSquadCanvas && (
                      <button
                        className="button button-secondary"
                        style={{ color: '#0284c7', borderColor: '#bae6fd', background: '#f0f9ff' }}
                        onClick={() => onOpenSquadCanvas(team)}
                        title={tr("Formation & pitch canvas")}
                      >
                        <Sparkles size={14} /> {tr(" Pitch")}</button>
                    )}
                    <button className="button button-secondary" onClick={() => onManageSquad(team)}>
                      <Users size={14} /> {tr(" Roster (")}{squad.length})
                    </button>
                    <button className="button button-admin" onClick={() => onEdit(team)}>
                      <Edit2 size={14} /> {tr(" Edit Club")}</button>
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
  const { tr } = useAdminLanguage()
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
          <h2>{tr("Players & Rosters (")}{players.length})</h2>
          <p>{tr("Register squad members, assign shirt numbers, positions, and active seasons.")}</p>
        </div>
        <button className="button button-admin" onClick={onAdd}>
          <Plus />
          {tr("Register Player")}</button>
      </div>

      <div className="filter-bar">
        <div className="filter-group search-group">
          <Search size={16} />
          <input
            type="text"
            placeholder={tr("Search player name...")}
            value={searchPlayer}
            onChange={(e) => setSearchPlayer(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="filter-group">
          <Filter size={16} />
          <span>{tr("Team:")}</span>
          <select aria-label={tr("Team")} value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)}>
            <option value="All">{tr("All Teams")}</option>
            <option value="Free Agent">{tr("Free agents")}</option>
            {clubNames.map((clubName) => (
              <option key={clubName} value={clubName}>
                {clubName}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <span>{tr("Position:")}</span>
          <select value={selectedPos} onChange={(e) => setSelectedPos(e.target.value)}>
            <option value="All">{tr("All Positions")}</option>
            <option value="Goalkeeper">{tr("Goalkeeper")}</option>
            <option value="Defender">{tr("Defender")}</option>
            <option value="Midfielder">{tr("Midfielder")}</option>
            <option value="Forward">{tr("Forward")}</option>
          </select>
        </div>
      </div>

      <div className="admin-panel">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">{tr("PLAYER")}</th>
              <th scope="col">{tr("TEAM")}</th>
              <th scope="col">{tr("POSITION")}</th>
              <th scope="col">{tr("PLAYED SEASONS")}</th>
              <th scope="col">{tr("STATS")}</th>
              <th scope="col">{tr("ACTIONS")}</th>
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
                    {player.isCaptain && <span className="captain-badge" title={tr("Team Captain")} aria-label={tr("Team Captain")}>{tr("C")}</span>}
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
                    <span className="free-agent-badge">{tr("Free agent")}</span>
                  )}
                </td>
                <td>
                  <span className={`position-tag ${player.position}`}>{tr(POSITION_SHORT[player.position])}</span>
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
                      title={tr("Edit player")}
                      aria-label={tr("Edit player {value0}", { value0: player.fullName })}
                    >
                      <Edit2 size={14} aria-hidden="true" /> <span className="row-action-label">{tr("Edit")}</span>
                    </button>
                    <button
                      className="row-action danger"
                      onClick={() => void onDelete(player.id)}
                      title={tr("Delete player")}
                      aria-label={tr("Delete player {value0}", { value0: player.fullName })}
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
                  {tr("No players found matching current filter.")}</td>
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
  onAdd: (seasonId?: number) => void
}) {
  const { tr } = useAdminLanguage()
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
          <h2>{tr("Matches & Scorekeeping (")}{matches.length})</h2>
          <p>{tr("Schedule fixtures, record live match scores, and log event timelines.")}</p>
        </div>
        <button className="button button-admin" onClick={() => onAdd(filterSeason === 'All' ? undefined : Number(filterSeason))}>
          <Plus />
          {tr("Schedule Match")}</button>
      </div>

      <div className="filter-bar">
        <div className="filter-group">
          <span>{tr("Status:")}</span>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="All">{tr("All Matches")}</option>
            <option value="Scheduled">{tr("Scheduled")}</option>
            <option value="Live">{tr("Live")}</option>
            <option value="Completed">{tr("Completed")}</option>
            <option value="Postponed">{tr("Postponed")}</option>
          </select>
        </div>
        <div className="filter-group">
          <span>{tr("Season:")}</span>
          <select value={filterSeason} onChange={(e) => setFilterSeason(e.target.value)}>
            <option value="All">{tr("All Seasons")}</option>
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
  const { tr, language } = useAdminLanguage()
  return (
    <section className="manager-view">
      <div className="manager-head">
        <div>
          <h2>{tr("Editorial Content & Stories (")}{stories.length})</h2>
          <p>{tr("Write match reports, announcements, and headlines for the public portal.")}</p>
        </div>
        <button className="button button-admin" onClick={onAdd}>
          <Plus />
          {tr("New Story")}</button>
      </div>

      <section className="admin-panel">
        <table className="admin-table">
          <thead>
            <tr>
              <th>{tr("HEADLINE")}</th>
              <th>{tr("CATEGORY")}</th>
              <th>{tr("STATUS")}</th>
              <th>{tr("PUBLISHED DATE")}</th>
              <th>{tr("ACTIONS")}</th>
            </tr>
          </thead>
          <tbody>
            {stories.map((story) => (
              <tr key={story.id}>
                <td>
                  <strong>{story.title}</strong>
                </td>
                <td>
                  <span className="category-pill">{tr(story.category ?? 'news')}</span>
                </td>
                <td>
                  <span className="status-label">
                    <span className={`status-dot ${story.status.toLowerCase()}`} />
                    {tr(story.status)}
                  </span>
                </td>
                <td>{publicationDate(story.publishedAt, language === 'tr' ? 'tr-TR' : 'en-GB')}</td>
                <td>
                  <div className="row-actions-group">
                    <button className="row-action" onClick={() => onEdit(story)}>
                      <Edit2 size={14} /> {tr(" Edit")}</button>
                    <button className="row-action secondary" onClick={() => void onToggle(story.id)}>
                      {story.status === 'Published' ? tr("Unpublish") : tr("Publish")}
                    </button>
                    <button className="row-action danger" onClick={() => void onDelete(story.id)} aria-label={tr("Delete {value0}", { value0: story.title })} title={tr("Delete article")}>
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
  const { tr } = useAdminLanguage()
  const [lotsOpen, setLotsOpen] = useState(false)
  const [seasonFilter, setSeasonFilter] = useState<number | 'all'>(() => {
    return defaultSeasonId(seasons) ?? 'all'
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
          <h2>{tr("Standings & Statistics")}</h2>
          <p>
            {tr("Calculated from completed results: Points → Head-to-head (reapplied to remaining ties) → Goal difference → Goals scored → Fewer forfeits → Discipline → Recorded lots.")}</p>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-group">
          <Filter size={16} />
          <span>{tr("Season:")}</span>
          <select
            value={seasonFilter}
            onChange={(e) => setSeasonFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          >
            <option value="all">{tr("All seasons")}</option>
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {season.fullName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedSeason && canManage && <button className="button button-admin" onClick={() => setLotsOpen(true)}>{tr("Record drawing-of-lots order")}</button>}
      {groups.some((g) => g.rows.some((r) => r.lotsPending)) && <p className="module-note">{tr("Some clubs remain tied. Their displayed order is provisional until staff records the drawing of lots.")}</p>}
      {lotsOpen && selectedSeason && <LotsOrderForm season={selectedSeason} teams={scopedTeams} onSave={onUpdateSeason} onClose={() => setLotsOpen(false)} />}

      <section className="metric-strip">
        {metrics.map(({ icon: Icon, value, label }) => (
          <div key={label}>
            <Icon />
            <strong>{value}</strong>
            <span>{tr(label)}</span>
          </div>
        ))}
      </section>

      {selectedSeason?.bracket?.qualification ? <QualificationPanel key={selectedSeason.id} season={selectedSeason} teams={scopedTeams} matches={scopedMatches} canManage={canManage} onUpdateSeason={onUpdateSeason} onOpenBracket={onOpenBracket} /> : null}

      {resultsEntered === 0 ? (
        <section className="admin-panel standings-hint">
          <Info size={16} />
          <span>
            {tr("No completed matches yet. Enter a score on the Matches screen and every table below updates immediately.")}</span>
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
                  <th>{tr("CLUB")}</th>
                  <th>{tr("P")}</th>
                  <th>{tr("W")}</th>
                  <th>{tr("D")}</th>
                  <th>{tr("L")}</th>
                  <th>{tr("GF")}</th>
                  <th>{tr("GA")}</th>
                  <th>{tr("GD")}</th>
                  <th>{tr("PTS")}</th>
                  <th>{tr("FORM")}</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.length === 0 ? (
                  <tr>
                    <td colSpan={11}>{tr("No clubs assigned to this group yet.")}</td>
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
                              <span className="team-flag-country" title={tr(country.name)}>
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
          <h3>{tr("Top scorers")}</h3>
        </div>
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{tr("PLAYER")}</th>
                <th>{tr("CLUB")}</th>
                <th>{tr("GOALS")}</th>
                <th>{tr("YELLOW")}</th>
                <th>{tr("RED")}</th>
              </tr>
            </thead>
            <tbody>
              {topScorers.length === 0 ? (
                <tr>
                  <td colSpan={6}>{tr("No goals logged yet. Add goal events to a completed match to build this list.")}</td>
                </tr>
              ) : (
                topScorers.map((scorer, index) => (
                  <tr key={`${scorer.playerName}-${scorer.teamName}`}>
                    <td>{index + 1}</td>
                    <td>
                      <strong>{scorer.playerName}</strong>
                      {scorer.playerId === undefined ? (
                        <span className="category-pill" title={tr("No matching player on any roster")}>
                          {tr("unlinked")}</span>
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
  const { tr } = useAdminLanguage()
  if (!screening) return <p className="screening-note is-empty">{tr("Not screened by Jev.")}</p>
  return (
    <div className={`screening-note screening-${screening.action}`}>
      <strong>
        <Sparkles size={13} /> {tr(SCREENING_ACTION_LABELS[screening.action])}
      </strong>
      {screening.reasons.map((reason) => (
        <span key={reason} className="screening-reason">
          {tr(SCREENING_REASON_LABELS[reason] ?? reason)}
          {reason in screening.hazards ? ` ${Math.round(screening.hazards[reason] * 100)}%` : ''}
        </span>
      ))}
      <span className="screening-meta" title={tr("Model {value0}, policy {value1}", { value0: screening.model, value1: screening.policy })}>
        {tr("severity ")}{screening.severity.toFixed(1)}/3
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
  const { tr } = useAdminLanguage()
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
          <h2>{tr("Comment moderation")}</h2>
          <p className="module-sub">
            {pendingCount === 0
              ? tr("Nothing is waiting for review.")
              : tr("{value0} comment{value1} awaiting review.", { value0: pendingCount, value1: pendingCount === 1 ? '' : 's' })}
          </p>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-group">
          <span>{tr("Season:")}</span>
          <select
            value={seasonFilter}
            onChange={(e) => setSeasonFilter(e.target.value === 'all' || e.target.value === 'none' ? e.target.value : Number(e.target.value))}
          >
            <option value="all">{tr("All seasons")}</option>
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {seasonLabel(season)}
              </option>
            ))}
            <option value="none">{tr("No season")}</option>
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
              {tr(option.label)} <span>{count}</span>
            </button>
          )
        })}
      </div>

      {error ? <div className="form-error">{tr(error)}</div> : null}

      {loading ? (
        <p className="empty-text">{tr("Loading comments…")}</p>
      ) : visible.length === 0 ? (
        <p className="empty-text">{tr("No comments in this view.")}</p>
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
                <span className={`status-chip status-${comment.status}`}>{tr(comment.status)}</span>
              </header>
              <p>{comment.body}</p>
              <ScreeningNote screening={comment.screening} />
              <footer>
                {comment.status === 'pending' && (
                  <button
                    className="mini-button"
                    disabled={busyId === comment.id}
                    title={tr("Ask TypeSafe (Jev) to screen this comment again")}
                    onClick={() => void act(comment.id, () => moderationRepository.rescreen(comment.id))}
                  >
                    <Sparkles size={14} /> {comment.screening ? tr("Re-screen") : tr("Screen with Jev")}
                  </button>
                )}
                {comment.status !== 'approved' && (
                  <button
                    className="mini-button approve"
                    disabled={busyId === comment.id}
                    onClick={() => void act(comment.id, () => moderationRepository.setStatus(comment.id, 'approved'))}
                  >
                    <Check size={14} /> {tr(" Approve")}</button>
                )}
                {comment.status !== 'rejected' && (
                  <button
                    className="mini-button reject"
                    disabled={busyId === comment.id}
                    onClick={() => void act(comment.id, () => moderationRepository.setStatus(comment.id, 'rejected'))}
                  >
                    <Ban size={14} /> {tr(" Reject")}</button>
                )}
                <button
                  className="mini-button danger"
                  disabled={busyId === comment.id}
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Delete comment',
                      body: (
                        <>
                          {tr("Delete this comment from ")}<strong>{comment.authorName}</strong>?
                        </>
                      ),
                      consequences: ['Rejecting instead keeps the comment on record without publishing it'],
                      confirmLabel: 'Delete comment',
                    })
                    if (ok) await act(comment.id, () => moderationRepository.remove(comment.id))
                  }}
                >
                  <Trash2 size={14} /> {tr(" Delete")}</button>
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
  const { tr } = useAdminLanguage()
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
          <h2>{tr("Media library")}</h2>
          <p className="module-sub">
            {media.length} {tr(" asset")}{media.length === 1 ? '' : tr("s")} {tr(" · publish an item to show it in Highlights for its season")}</p>
        </div>
        <button className="button button-admin" onClick={() => setEditing(emptyMedia())}>
          <Plus size={16} /> {tr(" Add asset")}</button>
      </div>

      {error ? <div className="form-error">{tr(error)}</div> : null}

      {media.length === 0 ? (
        <p className="empty-text">
          {tr("No media yet. Add a highlight video or photo and publish it to replace the placeholder cards on the public site.")}</p>
      ) : (
        <div className="media-admin-grid">
          {media.map((asset) => (
            <article className="media-admin-card" key={asset.id}>
              <div className="media-admin-thumb">
                {asset.thumbnailUrl ? (
                  <img src={asset.thumbnailUrl} alt="" />
                ) : (
                  <span className="media-admin-kind">{tr(MEDIA_KIND_LABELS[asset.kind] ?? asset.kind)}</span>
                )}
              </div>
              <div className="media-admin-body">
                <strong>{asset.title}</strong>
                <span className={`status-chip ${asset.isPublished ? 'status-approved' : 'status-pending'}`}>
                  {asset.isPublished ? tr("Published") : tr("Draft")}
                </span>
                <small className="field-hint">
                  {asset.seasonId == null ? tr("All seasons") : seasonLabelsForIds([asset.seasonId], seasons).join(', ')}
                </small>
                {asset.sponsorId ? (
                  <small className="field-hint">
                    {tr("Presented by ")}{sponsors.find((s) => s.id === asset.sponsorId)?.name ?? tr("a sponsor")}
                  </small>
                ) : null}
                {asset.externalUrl ? (
                  <a href={asset.externalUrl} target="_blank" rel="noopener noreferrer" className="media-admin-link">
                    <ExternalLink size={13} /> {tr(" Open")}</a>
                ) : null}
              </div>
              <footer>
                <button
                  className="mini-button"
                  disabled={busyId === asset.id}
                  onClick={() => void act(asset.id, () => mediaRepository.togglePublished(asset.id, !asset.isPublished))}
                >
                  {asset.isPublished ? tr("Unpublish") : tr("Publish")}
                </button>
                <button className="mini-button" onClick={() => setEditing(asset)}>
                  <Edit2 size={13} /> {tr(" Edit")}</button>
                <button
                  className="mini-button danger"
                  aria-label={tr("Delete media {value0}", { value0: asset.title })}
                  disabled={busyId === asset.id}
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Delete media asset',
                      body: (
                        <>
                          {tr('Delete {name}?', { name: asset.title })}
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
  const { tr } = useAdminLanguage()
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
    const form = event.currentTarget
    const data = new FormData(form)
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
      reportAssetSaveFailure(form, reason)
      setSaveError(reason instanceof Error ? reason.message : 'Unable to save this asset.')
    } finally {
      setSaving(false)
    }
  })

  return (
    <Modal title={initial.id ? tr("Edit media asset") : tr("Add media asset")} onClose={onClose}>
      <form className="admin-form" onSubmit={submit}>
        <label className="span-2">
          {tr("Title *")}<input name="title" defaultValue={initial.title} placeholder={tr("e.g. Matchday 3 highlights")} required />
        </label>
        <label className="span-2">
          {tr("Season")}<select name="seasonId" value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
            <option value="">{tr("All seasons")}</option>
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {seasonLabel(season)}
              </option>
            ))}
          </select>
          <small className="field-hint">{tr("Shown in the public media rail only while this season is selected.")}</small>
        </label>
        <label className="span-2">
          {tr("Presented by")}<select
            name="sponsorId"
            key={seasonId}
            defaultValue={sponsorOptions.some((s) => s.id === initial.sponsorId) ? initial.sponsorId : ''}
          >
            <option value="">{tr("No sponsor")}</option>
            {sponsorOptions.map((sponsor) => (
              <option key={sponsor.id} value={sponsor.id}>
                {sponsor.name}
              </option>
            ))}
          </select>
          <small className="field-hint">{tr("Optional. Shows a “Presented by” badge with the sponsor’s logo on the public card.")}</small>
        </label>
        <label>
          {tr("Type")}<select name="kind" defaultValue={initial.kind}>
            {MEDIA_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {tr(MEDIA_KIND_LABELS[kind])}
              </option>
            ))}
          </select>
        </label>
        <label>
          {tr("Duration (seconds)")}<input name="duration" type="number" min={0} defaultValue={initial.durationSeconds ?? ''} placeholder={tr("e.g. 180")} />
        </label>
        <label className="span-2">
          {tr("Link URL *")}<input
            name="externalUrl"
            type="url"
            defaultValue={initial.externalUrl ?? ''}
            placeholder="https://youtube.com/watch?v=…"
            required
          />
          <small className="field-hint">
            {tr("Required — media are shared as links (YouTube, Instagram, a hosted file). Only the thumbnail below is uploaded.")}</small>
        </label>
        <ImageUploadField
          name="thumbnailUrl"
          label={tr("Thumbnail image")}
          folder="media"
          defaultValue={initial.thumbnailUrl ?? ''}
          hint={tr("Shown as the card image on the public site.")}
        />
        <label className="checkbox-label span-2">
          <input type="checkbox" name="isPublished" defaultChecked={initial.isPublished} />
          {tr("Publish to the public site")}</label>
        {saveError ? <div className="form-error span-2">{tr(saveError)}</div> : null}
        <FormActions onClose={onClose} label={tr("Save asset")} saving={saving} />
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
  const { tr } = useAdminLanguage()
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
          <h2>{tr("Sponsors")}</h2>
          <p className="module-sub">
            {sponsors.length} {tr(" partner")}{sponsors.length === 1 ? '' : tr("s")} {tr(" · active partners appear in Sponsors for their season")}</p>
        </div>
        <button
          className="button button-admin"
          onClick={() => setEditing(emptySponsor(sponsors.length))}
        >
          <Plus size={16} /> {tr(" Add sponsor")}</button>
      </div>

      {error ? <div className="form-error">{tr(error)}</div> : null}

      {sponsors.length === 0 ? (
        <p className="empty-text">{tr("No sponsors yet.")}</p>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{tr("ORDER")}</th>
                <th>{tr("LOGO")}</th>
                <th>{tr("NAME")}</th>
                <th>{tr("WEBSITE")}</th>
                <th>{tr("STATUS")}</th>
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
                      {sponsor.seasonId == null ? tr("All seasons") : seasonLabelsForIds([sponsor.seasonId], seasons).join(', ')}
                    </div>
                  </td>
                  <td>
                    {sponsor.websiteUrl ? (
                      <a href={sponsor.websiteUrl} target="_blank" rel="noopener noreferrer" className="media-admin-link">
                        <ExternalLink size={13} /> {tr(" Visit")}</a>
                    ) : (
                      <span className="empty-text">—</span>
                    )}
                  </td>
                  <td>
                    <span className={`status-chip ${sponsor.isActive ? 'status-approved' : 'status-pending'}`}>
                      {sponsor.isActive ? tr("Active") : tr("Hidden")}
                    </span>
                  </td>
                  <td className="row-actions">
                    <button
                      className="mini-button"
                      disabled={busyId === sponsor.id}
                      onClick={() => void act(sponsor.id, () => sponsorsRepository.toggleActive(sponsor.id, !sponsor.isActive))}
                    >
                      {sponsor.isActive ? tr("Hide") : tr("Show")}
                    </button>
                    <button className="mini-button" onClick={() => setEditing(sponsor)} aria-label={tr("Edit sponsor {value0}", { value0: sponsor.name })}>
                      <Edit2 size={13} />
                    </button>
                    <button
                      className="mini-button danger"
                      aria-label={tr("Delete sponsor {value0}", { value0: sponsor.name })}
                      disabled={busyId === sponsor.id}
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'Delete sponsor',
                          body: (
                            <>
                              {tr('Delete {name}?', { name: sponsor.name })}
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
  const { tr } = useAdminLanguage()
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const guard = useSingleFlight()
  const submit = (event: FormEvent<HTMLFormElement>) =>
    guard(event, async () => {
    event.preventDefault()
    setSaving(true)
    setSaveError('')
    const form = event.currentTarget
    const data = new FormData(form)
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
      reportAssetSaveFailure(form, reason)
      setSaveError(reason instanceof Error ? reason.message : 'Unable to save this sponsor.')
    } finally {
      setSaving(false)
    }
  })

  return (
    <Modal title={initial.id ? tr("Edit sponsor") : tr("Add sponsor")} onClose={onClose}>
      <form className="admin-form" onSubmit={submit}>
        <label className="span-2">
          {tr("Sponsor name *")}<input name="name" defaultValue={initial.name} placeholder={tr("e.g. Anadolu Enerji")} required />
        </label>

        <label className="span-2">
          {tr("Season")}<select name="seasonId" defaultValue={initial.seasonId ?? ''}>
            <option value="">{tr("All seasons")}</option>
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {seasonLabel(season)}
              </option>
            ))}
          </select>
          <small className="field-hint">
            {tr("Shown in the public sponsor rail only while this season is selected. Leave on “All seasons” for a partner backing the whole competition.")}</small>
        </label>
        <ImageUploadField
          name="logoUrl"
          label={tr("Logo")}
          folder="sponsors"
          defaultValue={initial.logoUrl ?? ''}
          hint={tr("Shown in the public sponsor rail.")}
        />
        <label>
          {tr("Website")}<input name="websiteUrl" type="url" defaultValue={initial.websiteUrl ?? ''} placeholder="https://example.com" />
        </label>
        <label>
          {tr("Display order")}<input name="displayOrder" type="number" min={0} defaultValue={initial.displayOrder} />
          <small className="field-hint">{tr("Lower numbers appear first.")}</small>
        </label>
        <label className="checkbox-label span-2">
          <input type="checkbox" name="isActive" defaultChecked={initial.isActive} />
          {tr("Show on the public site")}</label>
        {saveError ? <div className="form-error span-2">{tr(saveError)}</div> : null}
        <FormActions onClose={onClose} label={tr("Save sponsor")} saving={saving} />
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
  const { tr } = useAdminLanguage()
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
          <h2>{tr("Site settings")}</h2>
          <p className="module-sub">{tr("The About section, competition rules and contact links on the public site.")}</p>
        </div>
      </div>

      {!loaded ? (
        <p className="empty-text">{tr("Loading settings…")}</p>
      ) : (
        <form className="admin-form" onSubmit={submit}>
          <label className="span-2">
            {tr("About — introduction")}<textarea rows={3} {...field('aboutIntro')} />
          </label>
          <label className="span-2">
            {tr("About — history")}<textarea rows={3} {...field('aboutHistory')} />
          </label>
          <label className="span-2">
            {tr("About — vision")}<textarea rows={3} {...field('aboutVision')} />
          </label>
          <label className="span-2">
            {tr("Competition rules (one per line)")}<textarea rows={6} {...field('rules')} />
          </label>
          <label className="span-2">
            {tr("Venue note")}<input {...field('venueNote')} />
          </label>
          <label>
            {tr("Instagram link")}<input type="url" placeholder="https://instagram.com/…" {...field('instagramUrl')} />
          </label>
          <label>
            {tr("YouTube link")}<input type="url" placeholder="https://youtube.com/@…" {...field('youtubeUrl')} />
          </label>
          <label>
            {tr("LinkedIn link")}<input type="url" placeholder="https://linkedin.com/company/…" {...field('linkedinUrl')} />
          </label>
          <label>
            {tr("WhatsApp number")}<input inputMode="tel" placeholder={tr("Country code first, digits only")} {...field('whatsappNumber')} />
          </label>
          <label className="span-2">
            {tr("WhatsApp greeting")}<input {...field('whatsappMessage')} />
          </label>
          <small className="field-hint span-2">{tr("Empty links and an empty WhatsApp number are hidden on the public site.")}</small>

          {error ? <div className="form-error span-2">{tr(error)}</div> : null}
          {saved ? <p className="span-2" role="status">{tr("Saved. The public site shows the new settings on its next load.")}</p> : null}

          <div className="form-actions span-2">
            <button className="button button-admin" type="submit" disabled={saving}>
              {saving ? tr("Saving…") : tr("Save settings")}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}

function UsersManager({ currentRole }: { currentRole: AuthProfile['role'] }) {
  const { tr } = useAdminLanguage()
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
          <h2>{tr("Staff & roles")}</h2>
          <p className="module-sub">
            {users.length} {tr(" account")}{users.length === 1 ? '' : tr("s")} {tr(" · roles take effect immediately")}</p>
        </div>
      </div>

      <p className="module-note">
        <ShieldCheck size={15} />
        {tr("Accounts are created in the Supabase dashboard (Authentication → Users); the staff login only signs in. Email addresses live in Supabase Auth and are not readable from here, so accounts are listed by profile name.")}</p>

      {error ? <div className="form-error">{tr(error)}</div> : null}

      {loading ? (
        <p className="empty-text">{tr("Loading accounts…")}</p>
      ) : users.length === 0 ? (
        <p className="empty-text">{tr("No staff accounts found.")}</p>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{tr("NAME")}</th>
                <th>{tr("ROLE")}</th>
                <th>{tr("CREATED")}</th>
                <th>{tr("CHANGE ROLE")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.fullName}</strong>
                  </td>
                  <td>
                    <span className={`role-chip role-${user.role}`}>{tr(ROLE_LABELS[user.role])}</span>
                  </td>
                  <td>{user.createdAt ?? '—'}</td>
                  <td>
                    <select
                      aria-label={tr("Role for {value0}", { value0: user.fullName || 'unnamed account' })}
                      value={user.role}
                      disabled={busyId === user.id || (user.role === 'super_admin' && (!canGrantSuper || users.filter((u) => u.role === 'super_admin').length === 1))}
                      onChange={(event) => void changeRole(user, event.target.value as AdminUser['role'])}
                    >
                      {ASSIGNABLE_ROLES.filter((role) => role !== 'super_admin' || canGrantSuper || user.role === 'super_admin').map((role) => (
                        <option key={role} value={role}>
                          {tr(ROLE_LABELS[role])}
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
  const { tr } = useAdminLanguage()
  return (
    <div className="table-scroll">
      <table className="admin-table">
        <thead>
          <tr>
            <th>{tr("MATCH")}</th>
            <th>{tr("SCORE / STATUS")}</th>
            <th>{tr("STAGE")}</th>
            <th>{tr("DATE")}</th>
            <th>{tr("VENUE")}</th>
            <th>{tr("ACTIONS")}</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((match) => {
            const hasScore = match.homeScore != null && match.awayScore != null
            return (
              <tr key={match.id}>
                <td>
                  <strong>
                    {match.home} {tr(" vs ")}{match.away}
                  </strong>
                </td>
                <td>
                  <div className="match-status-cell">
                    {hasScore ? (
                      <span className="score-badge">
                        {match.homeScore} - {match.awayScore}
                        {match.homePenalties != null && match.awayPenalties != null && (
                          <small className="admin-pen-tag"> ({match.homePenalties}–{match.awayPenalties}{tr("p)")}</small>
                        )}
                      </span>
                    ) : (
                      <span className="score-badge empty">{tr("vs")}</span>
                    )}
                    <span className={`status-dot ${match.matchStatus}`}></span>
                    <span className="status-text">{tr(match.matchStatus)}</span>
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
                      <button className="row-action" onClick={() => onEdit(match)} title={tr("Edit score & details")}>
                        <Edit2 size={14} /> <span className="row-action-label">{tr("Score / Edit")}</span>
                      </button>
                    )}
                    {onManageEvents && (
                      <button className="row-action secondary" onClick={() => onManageEvents(match)} title={tr("Manage events")}>
                        <Flame size={14} /> <span className="row-action-label">{tr("Events")}</span> (
                        {match.events?.length ?? 0})
                      </button>
                    )}
                    {onDelete && (
                      <button className="row-action danger" onClick={() => void onDelete(match.id)} title={tr("Delete match")}>
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
  defaultSeasonId: preselectedSeasonId,
  hasMatches = false,
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
  /** A new club starts in this season: the one the Teams list is showing. */
  defaultSeasonId?: number
  /** An entry with fixtures stays in its season; the database refuses the move too. */
  hasMatches?: boolean
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
  const { tr } = useAdminLanguage()
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
    if (preselectedSeasonId && seasons.some((s) => s.id === preselectedSeasonId)) return preselectedSeasonId
    return defaultSeasonId(seasons) ?? 1
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
        setSaveError(tr("Add at least {value0} players in the Squad tab before registering ({value1} so far).", { value0: MIN_SQUAD, value1: squadSize }))
        setTab('squad')
        setSaving(false)
        return
      }

      // The repository uploads the crest and cleans it up if the row is rejected.
      await onSave({
        id: initial?.id ?? Date.now(),
        seasonId: selectedSeasonId,
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
      }, initial ? undefined : { playerIds: stagedIds, newPlayers: stagedNew })
      // Saved edits close the form like the other editors; a new club stays open on its squad.
      if (initial) onClose()
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
    <Modal
      // The season picker sits on the third tab, so a new entry names its season up front.
      title={
        initial
          ? tr("Manage Club: {value0}", { value0: initial.name })
          : template
            ? tr('Enter {club} in {season}', { club: template.team.name, season: currentSelectedSeason ? seasonLabel(currentSelectedSeason) : tr('a season') })
            : tr('Register New Club in {season}', { season: currentSelectedSeason ? seasonLabel(currentSelectedSeason) : tr('a season') })
      }
      onClose={onClose}
    >
      <div className="tabbed-modal-container">
        <div className="modal-tabs-header">
          <button
            type="button"
            className={tab === 'identity' ? 'active' : ''}
            onClick={() => setTab('identity')}
          >
            {tr("1. Identity & Crest")}</button>
          <button
            type="button"
            className={tab === 'staff' ? 'active' : ''}
            onClick={() => setTab('staff')}
          >
            {tr("2. Staff & Bio")}</button>
          <button
            type="button"
            className={tab === 'tournament' ? 'active' : ''}
            onClick={() => setTab('tournament')}
          >
            {tr("3. Tournament & Group")}</button>
          <button
            type="button"
            className={tab === 'squad' ? 'active' : ''}
            onClick={() => setTab('squad')}
          >
            {tr("4. Squad Roster (")}{squadSize}{initial ? '' : `/${MIN_SQUAD}+`})
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
              <h3>{name || tr("Club Name")}</h3>
              {shortName && <span className="short-pill">{shortName}</span>}
              <span className="preview-country-flag">{selectedCountry.flag} {tr(selectedCountry.name)}</span>
            </div>
            <span className="preview-colors-hint">
              {tr("Primary: ")}<i style={{ background: color }} /> {tr(" Secondary: ")}<i style={{ background: secondaryColor }} />
            </span>
          </div>
          <div className="preview-squad-status">
            {squadSize >= MIN_SQUAD ? (
              <span className="squad-badge complete">{tr("✅ Squad Complete (")}{squadSize}/{MIN_SQUAD} {tr(" min)")}</span>
            ) : (
              <span className="squad-badge incomplete">⚠️ {squadSize}/{MIN_SQUAD} {tr(" (Min ")}{MIN_SQUAD} {tr(" players needed)")}</span>
            )}
          </div>
        </div>

        <form className="admin-form" onSubmit={submit}>
          {/* Every form tab stays mounted (just hidden) so saving from any tab sends
              all fields; rendering only the open tab saved "null" for the rest. */}
          <div className="tab-panel" style={{ display: tab === 'identity' ? 'contents' : 'none' }}>
              <label>
                {tr("Club Full Name *")}<input
                  name="name"
                  value={name}
                  onChange={(e) => setName(e.target.value.toUpperCase())}
                  placeholder={tr("e.g. NOVA FC")}
                  required
                />
              </label>

              <label>
                {tr("Short Name / Code (3-4 chars)")}<input
                  name="shortName"
                  value={shortName}
                  onChange={(e) => setShortName(e.target.value.toUpperCase())}
                  placeholder={tr("e.g. NOV")}
                  maxLength={5}
                />
              </label>

              <label className="span-2">
                {tr("Country / Flag *")}<select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  required
                >
                  <option value="" disabled>
                    {tr("Select a country…")}</option>
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {tr(c.name)} ({c.code})
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
                {tr("Primary Club Color *")}<div className="color-input-wrapper">
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
                {tr("Secondary Accent Color")}<div className="color-input-wrapper">
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
                {tr("Manager / Director Name")}<input
                  name="managerName"
                  defaultValue={base?.managerName ?? ''}
                  placeholder={tr("e.g. Ahmet Yılmaz")}
                />
              </label>

              <label>
                {tr("Head Coach Name")}<input
                  name="coachName"
                  defaultValue={base?.coachName ?? ''}
                  placeholder={tr("e.g. Roberto Mancini")}
                />
              </label>

              <label className="span-2">
                {tr("Club Biography & Background")}<textarea
                  name="bio"
                  rows={4}
                  defaultValue={base?.bio ?? ''}
                  placeholder={tr("Brief description of the club, corporate background, and history...")}
                />
              </label>
          </div>

          <div className="tab-panel" style={{ display: tab === 'tournament' ? 'contents' : 'none' }}>
              <label className="span-2">
                {tr("Season *")}<select
                  name="seasonId"
                  value={selectedSeasonId}
                  onChange={(e) => setSelectedSeasonId(Number(e.target.value))}
                  // A wrongly entered club can move (squad included) until it has fixtures.
                  disabled={hasMatches}
                >
                  {seasons.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.year} - {s.fullName || s.name || s.city} (
                      {s.seasonType === 'tournament'
                        ? tr("🏆 Knockout")
                        : s.seasonType === 'league'
                        ? tr("📋 League")
                        : tr("👥 Groups")}
                      {s.isActive ? tr(" • Active") : ''})
                    </option>
                  ))}
                </select>
              </label>

{hasMatches ? (
                <small className="span-2 field-hint">
                  {tr("This club has fixtures in this season, so it stays here. Enter the club again to play another season.")}</small>
              ) : initial ? (
                <small className="span-2 field-hint">{tr("Changing the season moves this club and its squad.")}</small>
              ) : null}
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
                    <Sparkles size={14} /> {tr(" Formation & pitch canvas")}</button>
                )}
                <button
                  type="button"
                  className={`mode-btn ${squadAddMode === 'pool' ? 'active' : ''}`}
                  onClick={() => setSquadAddMode('pool')}
                >
                  {tr("👥 Add an existing player (")}{availablePoolPlayers.length})
                </button>
                <button
                  type="button"
                  className={`mode-btn ${squadAddMode === 'new' ? 'active' : ''}`}
                  onClick={() => setSquadAddMode('new')}
                >
                  {tr("➕ Create a new player")}</button>
              </div>

              {squadAddMode === 'pool' ? (
                <div className="inline-add-player-box">
                  <h4>{tr("Add an existing player to ")}{initial?.name ?? (name || 'this club')}</h4>
                  <div className="inline-player-fields">
                    <input
                      type="text"
                      placeholder={tr("Search players (name, club, position)…")}
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
                          ? tr("No available players found")
                          : tr("-- Choose a player to add ({value0}) --", { value0: filteredPoolPlayers.length })}
                      </option>
                      {filteredPoolPlayers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.fullName} ({p.position.toUpperCase()}{tr(") · This season: ")}{clubThisSeason(p) ?? tr("free agent")}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="button button-admin"
                      onClick={handleAssignPoolPlayer}
                      disabled={assigningPoolPlayer || !selectedPoolPlayerId}
                    >
                      {assigningPoolPlayer ? tr("Adding…") : tr("+ Add to squad")}
                    </button>
                  </div>
                  {squadActionError ? <div className="form-error" style={{ marginTop: '8px' }}>{tr(squadActionError)}</div> : null}
                </div>
              ) : (
                <div className="inline-add-player-box">
                  <h4>{tr("Register a new player for ")}{initial?.name ?? (name || 'this club')}</h4>
                  <div className="inline-player-fields">
                    <input
                      placeholder={tr("Player full name *")}
                      value={newPlayerName}
                      onChange={(e) => setNewPlayerName(e.target.value)}
                    />
                    <input
                      type="number"
                      min={1}
                      max={99}
                      placeholder={tr("Forma #")}
                      value={newPlayerNumber}
                      onChange={(e) => setNewPlayerNumber(e.target.value)}
                      style={{ width: '85px' }}
                    />
                    <select
                      value={newPlayerPosition}
                      onChange={(e) => setNewPlayerPosition(e.target.value as PlayerPosition)}
                    >
                      <option value="goalkeeper">{tr("🧤 Goalkeeper")}</option>
                      <option value="defender">{tr("🛡️ Defender")}</option>
                      <option value="midfielder">{tr("⚙️ Midfielder")}</option>
                      <option value="forward">{tr("⚡ Forward")}</option>
                    </select>
                    <button
                      type="button"
                      className="button button-admin"
                      onClick={handleInlineAddPlayer}
                      disabled={addingPlayer || !newPlayerName.trim()}
                    >
                      {addingPlayer ? tr("Adding…") : tr("+ Add to squad")}
                    </button>
                  </div>
                  {squadActionError ? <div className="form-error" style={{ marginTop: '8px' }}>{tr(squadActionError)}</div> : null}
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
                        {tr(posLabels[pos])} ({posPlayers.length + posNew.length})
                      </h5>
                      {posPlayers.length + posNew.length === 0 ? (
                        <p className="no-pos-players">{tr("No ")}{pos}{tr("s registered yet.")}</p>
                      ) : (
                        <div className="pos-players-list">
                          {posPlayers.map((p) => (
                            <div key={p.id} className="squad-player-item">
                              <span className="shirt-badge">{p.shirtNumber ?? '-'}</span>
                              <div className="squad-player-meta">
                                <strong>{p.fullName}</strong>
                                <span>
                                  {tr("Active Seasons:")}{' '}
                                  {seasonLabelsForIds(p.activeSeasonIds, seasons).join(', ') || '—'}
                                </span>
                              </div>
                              <button
                                type="button"
                                className="delete-player-inline-btn"
                                aria-label={tr("Remove {value0} from the squad", { value0: p.fullName })}
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
                                title={tr("Remove from squad (keeps the player in the pool)")}
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
                                <span>{tr("New player · saved with the club")}</span>
                              </div>
                              <button
                                type="button"
                                className="delete-player-inline-btn"
                                aria-label={tr("Remove {value0}", { value0: p.fullName })}
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

          {saveError ? <div className="form-error span-2">{tr(saveError)}</div> : null}

          <div className="form-actions span-2">
            <button type="button" onClick={onClose} disabled={saving}>
              {tr("Cancel")}</button>
            <button className="button button-admin" type="submit" disabled={saving}>
              {saving ? tr("Saving…") : initial ? tr("Save Club Changes") : tr("Register Club")}
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
  const { tr } = useAdminLanguage()
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
    <Modal title={tr("Squad Roster Hub: {value0}", { value0: team.name })} onClose={onClose}>
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
              {country.flag} {tr(country.name)} · {team.tournamentFormat ?? "Champions Cup"}
              {groupName ? ` (${groupName})` : ''}
            </span>
          </div>
          <div className="header-status">
            {players.length >= 5 ? (
              <span className="squad-badge complete">✅ {players.length} {tr(" Players (Ready)")}</span>
            ) : (
              <span className="squad-badge incomplete">⚠️ {players.length}{tr("/5 (Min 5 required)")}</span>
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
              <Sparkles size={14} /> {tr(" Formation & pitch canvas")}</button>
          )}
          <button
            type="button"
            className={`mode-btn ${squadMode === 'pool' ? 'active' : ''}`}
            onClick={() => setSquadMode('pool')}
          >
            {tr("👥 Add an existing player (")}{availablePoolPlayers.length})
          </button>
          <button
            type="button"
            className={`mode-btn ${squadMode === 'new' ? 'active' : ''}`}
            onClick={() => setSquadMode('new')}
          >
            {tr("➕ Create a new player")}</button>
        </div>

        {squadMode === 'pool' ? (
          <div className="inline-add-player-box">
            <h4>{tr("Move an existing player to ")}{team.name}</h4>
            <div className="inline-player-fields">
              <input
                type="text"
                placeholder={tr("Search players (name, club, position)…")}
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
                    ? tr("No available players found")
                    : tr("-- Choose a player to add ({value0}) --", { value0: filteredPoolPlayers.length })}
                </option>
                {filteredPoolPlayers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName} ({p.position.toUpperCase()}{tr(") · This season: ")}{clubThisSeason(p) ?? tr("free agent")}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="button button-admin"
                onClick={handleAssignPool}
                disabled={assigning || !selectedPoolId}
              >
                {assigning ? tr("Adding…") : tr("+ Add to squad")}
              </button>
            </div>
            {addError ? <div className="form-error" style={{ marginTop: '8px' }}>{tr(addError)}</div> : null}
          </div>
        ) : (
          <div className="inline-add-player-box">
            <h4>{tr("Register a new player for ")}{team.name}</h4>
            <div className="inline-player-fields">
              <input
                placeholder={tr("Player Full Name *")}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <input
                type="number"
                min={1}
                max={99}
                placeholder={tr("Shirt #")}
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                style={{ width: '85px' }}
              />
              <select value={pos} onChange={(e) => setPos(e.target.value as PlayerPosition)}>
                <option value="goalkeeper">{tr("🧤 Goalkeeper")}</option>
                <option value="defender">{tr("🛡️ Defender")}</option>
                <option value="midfielder">{tr("⚙️ Midfielder")}</option>
                <option value="forward">{tr("⚡ Forward")}</option>
              </select>
              <button
                type="button"
                className="button button-admin"
                onClick={handleAdd}
                disabled={adding || !name.trim()}
              >
                {adding ? tr("Adding…") : tr("+ Register")}
              </button>
            </div>
            {addError ? <div className="form-error" style={{ marginTop: '8px' }}>{tr(addError)}</div> : null}
          </div>
        )}

        {/* FULL SQUAD LIST */}
        <div className="quick-squad-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{tr("PLAYER")}</th>
                <th>{tr("POSITION")}</th>
                <th>{tr("PLAYED SEASONS")}</th>
                <th>{tr("ACTION")}</th>
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
                      {tr({ goalkeeper: 'GK', defender: 'DEF', midfielder: 'MID', forward: 'FWD' }[p.position])}
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
                      onClick={() => {
                        setAddError('')
                        onSetSquad(p.id, seasonId, null).catch((reason: unknown) =>
                          setAddError(reason instanceof Error ? reason.message : 'Unable to remove this player.'),
                        )
                      }}
                      title={tr("Remove from squad (keeps the player in the pool)")}
                    >
                      <UserMinus size={14} /> {tr(" Remove")}</button>
                  </td>
                </tr>
              ))}
              {players.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: '#8c9bad' }}>
                    {tr("No players registered in this squad yet. Use the form above to add the starting 5+ players.")}</td>
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
  initialSeasonId,
  onClose,
  onSave,
}: {
  teams: Team[]
  seasons: Season[]
  initialSeasonId?: number
  onClose: () => void
  onSave: (match: Match) => Promise<void>
}) {
  const { tr } = useAdminLanguage()
  const [seasonId, setSeasonId] = useState<number | undefined>(() => initialSeasonId ?? defaultSeasonId(seasons))

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
    const streamUrl = String(data.get('streamUrl')).trim()
    const streamProblem = broadcastUrlError(streamUrl)
    if (streamProblem) { setSaveError(streamProblem); setSaving(false); return }
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
        streamUrl: streamUrl || undefined,
        matchStatus: 'scheduled',
        status: 'Scheduled',
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
    <Modal title={tr("Create match fixture")} onClose={onClose}>
      <form className="admin-form" onSubmit={submit}>
        <label className="span-2">
          {tr("Season *")}<select
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
            {tr("Fixtures are recorded against a season, so concurrent competitions stay separate.")}</small>
        </label>
        <label>
          {tr("Home team")}<select name="home" defaultValue={names[0]}>
            {names.map((name) => (
              <option value={name} key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          {tr("Away team")}<select name="away" defaultValue={names[1] ?? names[0]}>
            {names.map((name) => (
              <option value={name} key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          {tr("Stage")}<input name="stage" defaultValue="Group A" list="fixture-stages" required />
          <datalist id="fixture-stages">
            {(seasons.find((season) => season.id === seasonId)?.groupLeague?.groups.map((group) => group.name) ?? ['Group A', 'Group B', 'Group Stage']).map((stage) => <option key={stage} value={stage} />)}
            {['Round of 16', 'Quarter-final', 'Semi-final', 'Final', 'Third-place Play-off'].map((stage) => <option key={stage} value={stage} />)}
          </datalist>
          <small className="field-hint">{tr("For knockout fixtures, use Round of 16, Quarter-final, Semi-final or Final so the score updates the draw.")}</small>
        </label>
        <label>
          {tr("Venue")}<input name="venue" defaultValue="Central Arena" required />
        </label>
        <label>
          {tr("Date")}<input name="date" defaultValue="18 Aug" placeholder={tr("e.g. 18 Aug")} required />
        </label>
        <label>
          {tr("Kickoff Time")}<input name="time" type="time" defaultValue="20:30" required />
        </label>
        <label className="span-2">
          {tr("Referee Name")}<input name="referee" placeholder={tr("e.g. Mehmet Ali Yılmaz")} />
        </label>
        <label className="span-2">
          {tr("Broadcast URL")}<input name="streamUrl" type="url" placeholder="https://youtube.com/watch?v=…" />
          <small className="field-hint">
            {tr("Optional. A YouTube video or scheduled live link adds a player before kickoff. Other services open in a new tab.")}</small>
        </label>
        <p className="field-hint span-2">{tr("All fixtures are public when their tournament is published.")}</p>
        {saveError ? <div className="form-error span-2">{tr(saveError)}</div> : null}
        <FormActions onClose={onClose} label={tr("Create fixture")} saving={saving} />
      </form>
    </Modal>
  )
}

function MatchScoreModal({
  match,
  teams,
  players,
  onClose,
  onSave,
}: {
  match: Match
  teams: Team[]
  players: Player[]
  onClose: () => void
  onSave: (match: Match) => Promise<void>
}) {
  const { tr } = useAdminLanguage()
  const [lineup, setLineup] = useState(() => defaultMatchLineups(match, teams, players))
  const [resultKind, setResultKind] = useState(match.resultKind ?? 'normal')
  const [forfeitTeamId, setForfeitTeamId] = useState(match.forfeitTeamId)
  const [status, setStatus] = useState(match.matchStatus)
  const scores = resultKind === 'forfeit' && forfeitTeamId != null ? (forfeitTeamId === match.homeTeamId ? [0, 3] : [3, 0]) : match.scoreSource === 'legacy' ? [match.homeScore ?? 0, match.awayScore ?? 0] : goalScore(match)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const guard = useSingleFlight()
  const submit = (event: FormEvent<HTMLFormElement>) =>
    guard(event, async () => {
    event.preventDefault()
    setSaving(true)
    setSaveError('')
    const data = new FormData(event.currentTarget)
    const streamUrl = String(data.get('streamUrl')).trim()
    const streamProblem = broadcastUrlError(streamUrl)
    if (streamProblem) { setSaveError(streamProblem); setSaving(false); return }
    const homeScoreVal = data.get('homeScore')
    const awayScoreVal = data.get('awayScore')
    const homePenVal = data.get('homePenalties')
    const awayPenVal = data.get('awayPenalties')
    // A shootout needs both sides; a half-filled pair is treated as none.
    const hasShootout = !!homePenVal && !!awayPenVal
    // Recording goals and completing play are separate staff decisions.
    const chosenStatus = String(data.get('matchStatus')) as MatchStatus
    const matchStatus: MatchStatus = chosenStatus
    // A 2–2 shootout was accepted and then shown nowhere, since it has no winner.
    const penaltyProblem = (!!homePenVal !== !!awayPenVal) ? 'Enter both shootout scores.' : resultKind !== 'forfeit' && matchStatus === 'completed' && knockoutRoundSize(String(data.get('stage'))) != null && Number(homeScoreVal) === Number(awayScoreVal) && !hasShootout ? 'A drawn knockout match requires direct penalties with a winner.' : hasShootout
      ? shootoutError(Number(homeScoreVal), Number(awayScoreVal), Number(homePenVal), Number(awayPenVal))
      : ''
    if (penaltyProblem) {
      setSaveError(penaltyProblem)
      setSaving(false)
      return
    }

    try {
      await onSave({
        ...match,
        stage: String(data.get('stage')),
        venue: String(data.get('venue')),
        date: String(data.get('date')),
        time: String(data.get('time')),
        referee: String(data.get('referee')) || undefined,
        streamUrl: streamUrl || undefined,
        matchStatus,
        squads: lineup,
        resultKind,
        forfeitTeamId: resultKind === 'forfeit' ? forfeitTeamId : undefined,
        decisionNote: String(data.get('decisionNote')).trim() || undefined,
        homeScore: homeScoreVal !== '' ? Number(homeScoreVal) : undefined,
        awayScore: awayScoreVal !== '' ? Number(awayScoreVal) : undefined,
        homePenalties: hasShootout ? Number(homePenVal) : undefined,
        awayPenalties: hasShootout ? Number(awayPenVal) : undefined,
        status: 'Scheduled',
      })
      onClose()
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : 'Unable to update match.')
    } finally {
      setSaving(false)
    }
  })

  return (
    <Modal title={tr("Match Scorekeeper: {value0} vs {value1}", { value0: match.home, value1: match.away })} onClose={onClose}>
      <form className="admin-form" onSubmit={submit}>
        <div className="scorekeeper-banner span-2">
          <div className="scorekeeper-team">
            <TeamMark name={match.home} />
            <strong>{match.home}</strong>
            <input
              type="number"
              name="homeScore"
              aria-label={tr("{value0} score", { value0: match.home })}
              value={scores[0]} readOnly
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
              aria-label={tr("{value0} score", { value0: match.away })}
              value={scores[1]} readOnly
              placeholder="0"
              min={0}
              className="score-input"
            />
            <strong>{match.away}</strong>
            <TeamMark name={match.away} />
          </div>
        </div>

        <small className="field-hint span-2">{tr("Normal scores come from registered-player goal events. Fixed duration: two 25-minute halves plus stoppage time; drawn knockout matches go straight to penalties.")}</small>
        {match.scoreSource === 'legacy' && <p className="module-note span-2">{tr("Historical result: its original score is preserved. Its goal ledger needs staff reconciliation before score changes.")}</p>}
        <label>{tr("Result type")}<select value={resultKind} onChange={(e) => { setResultKind(e.target.value as 'normal' | 'forfeit'); if (e.target.value === 'forfeit') setStatus('completed') }}>
          <option value="normal">{tr("Played match · goals from players")}</option><option value="forfeit">{tr("Administrative 3–0 forfeit")}</option>
        </select></label>
        {resultKind === 'forfeit' && <label>{tr("Forfeiting club *")}<select required value={forfeitTeamId ?? ''} onChange={(e) => setForfeitTeamId(Number(e.target.value))}>
          <option value="">{tr("Select a club")}</option><option value={match.homeTeamId}>{match.home}</option><option value={match.awayTeamId}>{match.away}</option>
        </select></label>}
        <label className="span-2">{tr("Staff decision / reason")}<textarea name="decisionNote" defaultValue={match.decisionNote ?? ''} required={resultKind === 'forfeit' || status === 'stopped'} /></label>
        <MatchLineupFields match={match} players={players} value={lineup} onChange={setLineup} />

        <div className="penalties-keeper-row span-2">
          <small className="penalties-label">{tr("Penalty shootout (only for knockout matches level after full time)")}</small>
          <div className="penalties-inputs">
            <input
              type="number"
              name="homePenalties"
              aria-label={tr("{value0} penalties", { value0: match.home })}
              defaultValue={match.homePenalties ?? ''}
              placeholder={tr("Home")}
              min={0}
              className="score-input pen-score-input"
            />
            <span className="pen-sep">–</span>
            <input
              type="number"
              name="awayPenalties"
              aria-label={tr("{value0} penalties", { value0: match.away })}
              defaultValue={match.awayPenalties ?? ''}
              placeholder={tr("Away")}
              min={0}
              className="score-input pen-score-input"
            />
          </div>
        </div>

        <label>
          {tr("Match Status")}<select aria-label={tr("Match Status")} name="matchStatus" value={status} onChange={(e) => setStatus(e.target.value as MatchStatus)}>
            <option value="scheduled">{tr("Scheduled")}</option>
            <option value="live">{tr("Live (In Progress)")}</option>
            <option value="completed">{tr("Completed (Final)")}</option>
            <option value="postponed">{tr("Postponed")}</option><option value="stopped">{tr("Stopped · staff decision required")}</option>
          </select>
          <small className="field-hint">{tr("Choose Completed after play, or Stopped when play cannot continue. Staff decides the outcome; no automatic forfeit.")}</small>
        </label>

        <label>
          {tr("Stage")}<input name="stage" defaultValue={match.stage} required />
        </label>

        <label>
          {tr("Date")}<input name="date" defaultValue={match.date} required />
        </label>

        <label>
          {tr("Time")}<input name="time" defaultValue={match.time} required />
        </label>

        <label>
          {tr("Venue")}<input name="venue" defaultValue={match.venue} required />
        </label>

        <label>
          {tr("Referee")}<input name="referee" defaultValue={match.referee ?? ''} placeholder={tr("Referee Name")} />
        </label>

        <label className="span-2">
          {tr("Broadcast URL")}<input
            name="streamUrl"
            type="url"
            defaultValue={match.streamUrl ?? ''}
            placeholder="https://youtube.com/watch?v=…"
          />
          <small className="field-hint">
            {tr("A YouTube video or scheduled live link embeds on the public site before kickoff. Leave empty to remove the broadcast.")}</small>
        </label>

        <p className="field-hint span-2">{tr("All fixtures and their broadcast links are public when their tournament is published.")}</p>

        {saveError ? <div className="form-error span-2">{tr(saveError)}</div> : null}
        <FormActions onClose={onClose} label={tr("Save match result")} saving={saving} />
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
  const { tr } = useAdminLanguage()
  const [saving, setSaving] = useState(false)
  const [selectedTeam, setSelectedTeam] = useState<string>(match.home)
  const [eventType, setEventType] = useState<MatchEventType>('goal')
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
      if (!player) throw new Error('Select a registered squad player. Free-text scorers are not allowed.')
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
        extraMinute: data.get('extraMinute') ? Number(data.get('extraMinute')) : undefined,
        incomingPlayerId: eventType === 'substitution' ? Number(data.get('incomingPlayerId')) : undefined,
        isGoalkeeperChange: data.get('isGoalkeeperChange') === 'on',
      })
      form.reset()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The event could not be saved.')
    } finally {
      setSaving(false)
    }
  })

  return (
    <Modal title={tr("Match Events Timeline: {value0} vs {value1}", { value0: match.home, value1: match.away })} onClose={onClose}>
      <div className="match-events-container">
        <div className="current-events-list">
          <h3>{tr("Logged Events (")}{(match.events ?? []).length})</h3>
          {(match.events ?? []).length === 0 ? (
            <p className="empty-text">{tr("No events logged yet for this match.")}</p>
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
                    title={tr("Remove event")}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="add-event-section">
          <h3>{tr("Log New Event")}</h3>
          {error ? <p className="form-error" role="alert">{tr(error)}</p> : null}
          <form className="admin-form" onSubmit={submitEvent}>
            <label>
              {tr("Team")}<select aria-label={tr("Team")} value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)}>
                <option value={match.home}>{match.home}</option>
                <option value={match.away}>{match.away}</option>
              </select>
            </label>

            <label>
              {tr("Player")}<select aria-label={tr("Player")} key={selectedTeam} name="playerId" required disabled={!matchPlayers.length}>
                  {!matchPlayers.length && <option value="">{tr("Register squad players first")}</option>}
                  {matchPlayers.map((p) => (
                    <option key={p.id} value={p.id}>
                      #{p.shirtNumber ?? '-'} {p.fullName}
                    </option>
                  ))}
                </select>
            </label>

            <label>
              {tr("Event Type")}<select name="eventType" value={eventType} onChange={(e) => setEventType(e.target.value as MatchEventType)}>
                <option value="goal">{tr("⚽ Goal")}</option>
                <option value="assist">{tr("🅰️ Assist")}</option>
                <option value="penalty_scored">{tr("🎯 Penalty Scored")}</option>
                <option value="own_goal">{tr("🥅 Own Goal")}</option>
                <option value="yellow_card">{tr("🟨 Yellow Card")}</option>
                <option value="red_card">{tr("🟥 Red Card")}</option>
                <option value="substitution">{tr("🔄 Substitution")}</option>
              </select>
            </label>

            <label>
              {tr("Minute (0–50)")}<input name="minute" type="number" min={0} max={50} defaultValue={25} required />
            </label>
            <label>{tr("Stoppage minute")}<input name="extraMinute" type="number" min={0} max={30} placeholder={tr("e.g. 2 for 25+2")} /></label>
            {eventType === 'substitution' && <>
              <label>{tr("Incoming substitute *")}<select name="incomingPlayerId" required>
                <option value="">{tr("Choose a match-day substitute")}</option>
                {matchPlayers.filter((p) => match.squads?.some((s) => s.playerId === p.id && s.lineupRole === 'bench')).map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
              </select></label>
              <label className="checkbox-label"><input name="isGoalkeeperChange" type="checkbox" />{tr("Goalkeeper exchange (one allowed)")}</label>
              <small className="field-hint span-2">{tr("Player above is outgoing. Five outfield changes plus one goalkeeper change; substituted players cannot return.")}</small>
            </>}

            <label className="span-2">
              {tr("Notes (e.g. Header, Assist, Free kick)")}<input name="notes" placeholder={tr("Optional notes")} />
            </label>

            <small className="field-hint span-2">
              {tr("Goals and scored penalties add one to the club’s score, an own goal to the other club’s; deleting them takes it back off.")}</small>

            <div className="form-actions span-2">
              <button className="button button-admin" type="submit" disabled={saving || !matchPlayers.length || match.scoreSource === 'legacy'}>
                {saving ? tr("Adding…") : tr("Add Event to Timeline")}
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
  return useCallback(async (event: { preventDefault?: () => void; currentTarget?: EventTarget | null } | undefined, fn: () => Promise<void>) => {
    event?.preventDefault?.()
    if (busy.current) return
    busy.current = true
    const form = event?.currentTarget instanceof HTMLFormElement ? event.currentTarget : null
    if (form) form.dataset.saving = 'true'
    try {
      await fn()
    } finally {
      busy.current = false
      if (form) delete form.dataset.saving
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
  const { tr } = useAdminLanguage()
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
    const form = event.currentTarget
    const data = new FormData(form)
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
      reportAssetSaveFailure(form, reason)
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
    <Modal title={initial ? tr("Edit Player: {value0}", { value0: initial.fullName }) : tr("Register New Player")} onClose={onClose}>
      <form className="admin-form" onSubmit={submit}>
        <label className="span-2">
          {tr("Full Name *")}<input name="fullName" defaultValue={initial?.fullName ?? ''} placeholder={tr("e.g. Emre Yılmaz")} required />
        </label>

        <label>
          {tr("Season")}<select value={squadSeasonId} onChange={(e) => setSquadSeasonId(Number(e.target.value))}>
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {seasonLabel(season)}
              </option>
            ))}
          </select>
        </label>

        <label>
          {tr("Club this season")}<select name="teamId" key={squadSeasonId} defaultValue={currentTeamId ? String(currentTeamId) : ''}>
            <option value="">{tr("No club this season")}</option>
            {seasonClubs.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({getCountry(t.countryCode).flag})
              </option>
            ))}
          </select>
        </label>

        <label>
          {tr("Shirt Number (1–99)")}<input
            name="shirtNumber"
            type="number"
            min={1}
            max={99}
            defaultValue={initial?.shirtNumber ?? ''}
            placeholder="10"
          />
        </label>

        <label>
          {tr("Position")}<select name="position" defaultValue={initial?.position ?? 'forward'}>
            <option value="goalkeeper">{tr("🧤 Goalkeeper (GK)")}</option>
            <option value="defender">{tr("🛡️ Defender (DEF)")}</option>
            <option value="midfielder">{tr("⚙️ Midfielder (MID)")}</option>
            <option value="forward">{tr("⚡ Forward (FWD)")}</option>
          </select>
        </label>

        <label>
          {tr("Birth Year")}<input
            name="birthYear"
            type="number"
            min={1960}
            max={2015}
            defaultValue={initial?.birthYear ?? 1996}
            placeholder="1996"
          />
        </label>

        <label>
          {tr("Nationality")}<select name="nationality" defaultValue={initial?.nationality ?? 'TR'}>
            {COUNTRIES.map((country) => (
              <option key={country.code} value={country.code}>
                {country.flag} {tr(country.name)}
              </option>
            ))}
          </select>
          <small className="field-hint">{tr("Drives the flag behind this player's roster card.")}</small>
        </label>

        <ImageUploadField
          name="photoUrl"
          label={tr("Cutout Photo")}
          folder="players"
          defaultValue={initial?.photoUrl ?? ''}
          hint={tr("A background-free PNG works best — it is layered over the player's flag on roster cards.")}
        />
        {initial && initial.squads.length > 0 ? (
          <div className="span-2 season-picker-field">
            <span className="field-label">{tr("Squads by season")}</span>
            <div className="season-picker-chips">
              {initial.squads.map((entry) => {
                const season = seasons.find((item) => item.id === entry.seasonId)
                return (
                  <span key={entry.seasonId} className="season-chip-btn active">
                    {season ? seasonLabel(season) : tr("Season")} · {teams.find((team) => team.id === entry.teamId)?.name ?? tr("Club")}
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
          <span>{tr("Team Captain (C)")}</span>
        </label>

        {saveError ? <div className="form-error span-2">{tr(saveError)}</div> : null}
        <FormActions onClose={onClose} label={initial ? tr("Save Changes") : tr("Register Player")} saving={saving} />
      </form>
      {initial && <PlayerSuspensions player={initial} seasons={seasons} />}
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
  const { tr } = useAdminLanguage()
  const [publicationStatus, setPublicationStatus] = useState<Story['status']>(initial?.status ?? 'Draft')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const guard = useSingleFlight()
  const submit = (event: FormEvent<HTMLFormElement>) =>
    guard(event, async () => {
    event.preventDefault()
    setSaving(true)
    setSaveError('')
    const form = event.currentTarget
    const data = new FormData(form)
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
        publishedAt: publicationStatus === 'Scheduled' ? new Date(`${String(data.get('publishedAt'))}:00+03:00`).toISOString() : initial?.publishedAt,
      })
      onClose()
    } catch (reason) {
      reportAssetSaveFailure(form, reason)
      setSaveError(reason instanceof Error ? reason.message : 'Unable to save story.')
    } finally {
      setSaving(false)
    }
  })

  return (
    <Modal title={initial ? tr("Edit Story Article") : tr("Write New Story")} onClose={onClose}>
      <form className="admin-form" onSubmit={submit}>
        <label className="span-2">
          {tr("Headline / Title *")}<input name="title" defaultValue={initial?.title ?? ''} placeholder={tr("Enter article headline")} required />
        </label>

        <label className="span-2">
          {tr("Season")}<select name="seasonId" defaultValue={initial?.seasonId ?? ''}>
            <option value="">{tr("All seasons — not tied to one campaign")}</option>
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {seasonLabel(season)}
              </option>
            ))}
          </select>
          <small className="field-hint">
            {tr("The public newsroom shows this story only while its season is selected. Leave on “All seasons” for evergreen pieces such as rules or venue guides.")}</small>
        </label>

        <label>
          {tr("Category")}<select name="category" defaultValue={initial?.category ?? 'news'}>
            <option value="news">{tr("News")}</option>
            <option value="match_report">{tr("Match Report")}</option>
            <option value="announcement">{tr("Announcement")}</option>
            <option value="press">{tr("Press Conference")}</option>
            <option value="panorama">{tr("Weekly Panorama")}</option>
          </select>
        </label>

        <label>
          {tr("Publication Status")}<select name="status" value={publicationStatus} onChange={(e) => setPublicationStatus(e.target.value as Story['status'])}>
            <option value="Published">{tr("Published")}</option>
            <option value="Draft">{tr("Draft")}</option>
            <option value="Scheduled">{tr("Scheduled")}</option>
            <option value="Archived">{tr("Archived")}</option>
          </select>
          <small className="field-hint">
            {tr("Archived keeps a story on record without publishing it. It is hidden from the public site.")}</small>
        </label>

        {publicationStatus === 'Scheduled' && <label className="span-2">{tr("Publish at (Istanbul time) *")}<input name="publishedAt" type="datetime-local" required defaultValue={publicationInput(initial?.publishedAt)} />
          <small className="field-hint">{tr("Appears automatically at this time. Open pages refresh within one minute.")}</small>
        </label>}

        <ImageUploadField
          name="coverImageUrl"
          label={tr("Cover Image")}
          folder="articles"
          defaultValue={initial?.coverImageUrl ?? ''}
          hint={tr("Used as the hero image on the newsroom carousel and the article page.")}
        />

        <label className="span-2">
          {tr("Summary (Brief teaser)")}<textarea
            name="summary"
            rows={2}
            defaultValue={initial?.summary ?? ''}
            placeholder={tr("One or two sentences summarizing the story...")}
          />
        </label>

        <label className="span-2">
          {tr("Full Article Body")}<textarea
            name="body"
            rows={6}
            defaultValue={initial?.body ?? ''}
            placeholder={tr("Write the full match report or article here...")}
          />
        </label>

        {saveError ? <div className="form-error span-2">{tr(saveError)}</div> : null}
        <FormActions onClose={onClose} label={publicationStatus === 'Draft' ? tr("Save Draft") : publicationStatus === 'Scheduled' ? tr("Schedule Story") : publicationStatus === 'Published' ? tr("Publish Story") : tr("Archive Story")} saving={saving} />
      </form>
    </Modal>
  )
}

function FormActions({ onClose, label, saving }: { onClose: () => void; label: string; saving: boolean }) {
  const { tr } = useAdminLanguage()
  return (
    <div className="form-actions span-2" data-saving={saving ? 'true' : undefined}>
      <button type="button" onClick={onClose} disabled={saving}>
        {tr("Cancel")}</button>
      <button className="button button-admin" type="submit" disabled={saving}>
        {saving ? tr("Saving…") : label}
      </button>
    </div>
  )
}


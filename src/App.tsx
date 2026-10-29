import { useAdminLanguage } from './i18n/AdminLanguageContext'
import { AdminLanguageProvider } from './i18n/AdminLanguageProvider'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { canAccessAdmin, useAuth } from './auth/AuthContext'
import { PublicSite, parsePublicRoute } from './components/PublicSite'
import type { FixtureOptions } from './lib/fixtureUtils'
import { withDerivedPlayerTotals, withDerivedTeamTotals } from './lib/standingsUtils'
import { isStoryPublic } from './lib/publication'
import { resolveTournamentAssets, tournamentRepository, type EntryRoster, type LoadOptions, type TournamentData } from './services/tournamentRepository'
import type { Lineup } from './lib/formations'
import type { Club, Match, MatchEvent, MediaAsset, Player, Season, Sponsor, Story, Team, View } from './types'

// Staff-only screens load on demand: the admin panel and its canvas editors
// are most of the app's code, and no public visitor ever needs them.
const AdminPanel = lazy(() => import('./components/AdminPanel').then((module) => ({ default: module.AdminPanel })))
const LoginPage = lazy(() => import('./components/LoginPage').then((module) => ({ default: module.LoginPage })))

function LoadingScreen() {
  const { tr } = useAdminLanguage()
  return (
  <div className="app-loading">
    <span />
    <strong>{tr('Loading ICC…')}</strong>
  </div>
  )
}
const loadingScreen = <LoadingScreen />

const currentView = (): View => (window.location.hash.startsWith('#admin') ? 'admin' : 'site')

function publicDetail(): LoadOptions['detail'] {
  const route = parsePublicRoute(window.location.hash)
  return route.kind === 'home' ? undefined : route
}

export default function App() {
  const [admin, setAdmin] = useState(() => currentView() === 'admin')
  useEffect(() => {
    const onHash = () => setAdmin(currentView() === 'admin')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return <AdminLanguageProvider enabled={admin}><Application /></AdminLanguageProvider>
}

function Application() {
  const { tr } = useAdminLanguage()
  const auth = useAuth()
  const [view, setView] = useState<View>(currentView)
  const lastAdminHash = useRef(window.location.hash.startsWith('#admin') ? window.location.hash : '#admin')
  // When the last full load started; the reload on returning to the tab waits a minute after it.
  const lastLoad = useRef(0)
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(() => {
    try {
      const saved = Number(sessionStorage.getItem('ccl-cup:public-season:v1'))
      return Number.isInteger(saved) && saved > 0 ? saved : null
    } catch { return null }
  })
  const [seasons, setSeasons] = useState<Season[]>([])
  const [clubs, setClubs] = useState<Club[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [stories, setStories] = useState<Story[]>([])
  const [media, setMedia] = useState<MediaAsset[]>([])
  const [sponsors, setSponsors] = useState<Sponsor[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [dataError, setDataError] = useState('')
  const assetData = useRef<TournamentData | null>(null)
  const selectedSeason = useRef(selectedSeasonId)
  const retrySeason = useRef<number | undefined>(undefined)
  const loadRevision = useRef(0)
  const loadedScope = useRef('')
  const [readyScope, setReadyScope] = useState('')
  const [changingSeason, setChangingSeason] = useState(false)
  const scope = view === 'admin' ? `admin:${!auth.loading && auth.profile && canAccessAdmin(auth.profile.role) ? auth.profile.id : ''}` : 'public'

  const applyData = useCallback((data: TournamentData) => {
    assetData.current = data
    setSeasons(data.seasons ?? [])
    setClubs(data.clubs ?? [])
    setTeams(data.teams)
    setPlayers(data.players)
    setMatches(data.matches)
    setStories(data.stories)
    setMedia(data.media ?? [])
    setSponsors(data.sponsors ?? [])
    setDataError(data.loadWarning ?? '')
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = assetData.current
      if (!current || document.visibilityState !== 'visible') return
      resolveTournamentAssets(current).then((next) => {
        if (assetData.current === current) applyData(next)
      }).catch(() => undefined)
    }, 90_000)
    return () => window.clearInterval(timer)
  }, [applyData])

  const refresh = useCallback(async (requestedSeason?: number) => {
    const revision = ++loadRevision.current
    if (scope === 'admin:') { setDataLoading(false); return }
    if (loadedScope.current !== scope) { setDataLoading(true); retrySeason.current = undefined }
    if (requestedSeason != null) retrySeason.current = requestedSeason
    setChangingSeason(requestedSeason != null)
    setDataError('')
    lastLoad.current = Date.now()
    try {
      const publicOnly = scope === 'public'
      const data = await tournamentRepository.load({ mode: publicOnly ? 'public' : 'admin',
        seasonId: requestedSeason ?? selectedSeason.current,
        detail: publicOnly && requestedSeason == null ? publicDetail() : undefined })
      if (loadRevision.current !== revision) return
      applyData(data)
      loadedScope.current = scope
      retrySeason.current = undefined
      if (publicOnly && (data.loadedSeasonId !== undefined || requestedSeason != null)) {
        const id = data.loadedSeasonId !== undefined ? data.loadedSeasonId : requestedSeason!
        selectedSeason.current = id
        setSelectedSeasonId(id)
        try {
          if (id != null) sessionStorage.setItem('ccl-cup:public-season:v1', String(id))
          else sessionStorage.removeItem('ccl-cup:public-season:v1')
        } catch { /* Storage is optional. */ }
      }
    } catch (reason) {
      if (loadRevision.current === revision) {
        if (loadedScope.current !== scope) applyData({ seasons: [], clubs: [], teams: [], players: [], matches: [], stories: [], media: [], sponsors: [] })
        setDataError(reason instanceof Error ? reason.message : 'Unable to load tournament data.')
      }
    } finally {
      if (loadRevision.current === revision) { setDataLoading(false); setChangingSeason(false); setReadyScope(scope) }
    }
  }, [applyData, scope])

  const invalidateLoads = useCallback(() => { loadRevision.current++ }, [])
  useEffect(() => {
    void refresh()
    return invalidateLoads
  }, [refresh, invalidateLoads])

  useEffect(() => {
    if (view !== 'site' || changingSeason) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [refresh, view, changingSeason])

  // Results are often entered from the admin panel in another tab. When this
  // tab comes back into view, reload quietly (no loading screen) so the public
  // page shows them without a manual refresh. A failure here keeps the data
  // already on screen; the initial load above is what reports errors.
  useEffect(() => {
    const onVisible = () => {
      // Avoid repeating workspace reads when switching tabs back and forth.
      if (changingSeason || document.visibilityState !== 'visible' || Date.now() - lastLoad.current < 60_000) return
      void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh, changingSeason])

  // `played`, `goalDifference` and `points` are derived from results rather
  // than read from storage, so every surface sees the same live numbers.
  const derivedTeams = useMemo(() => withDerivedTeamTotals(teams, matches, seasons), [teams, matches, seasons])
  const derivedPlayers = useMemo(() => withDerivedPlayerTotals(players, matches), [players, matches])

  const selectSeason = (id: number) => { void refresh(id) }

  useEffect(() => {
    const onHash = () => {
      if (currentView() === 'admin') lastAdminHash.current = window.location.hash
      setDataError('')
      setView(currentView())
      const detail = publicDetail()
      const list = detail?.kind === 'match' ? assetData.current?.matches : detail?.kind === 'team' ? assetData.current?.teams : detail?.kind === 'story' ? assetData.current?.stories : assetData.current?.players
      if (currentView() === 'site' && detail && !list?.some((row) => row.id === detail.id)) void refresh()
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [refresh])

  const navigate = (next: View) => {
    if (currentView() === 'admin') lastAdminHash.current = window.location.hash
    window.location.hash = next === 'admin' ? lastAdminHash.current : '#site'
    setDataError('')
    setView(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const mutate = async (operation: () => Promise<TournamentData>) => {
    invalidateLoads()
    setDataError('')
    try {
      applyData(await operation())
    } catch (reason: unknown) {
      console.error('Operation failed:', reason)
      let message = 'The change could not be saved.'
      if (reason instanceof Error) {
        message = reason.message
      } else if (typeof reason === 'object' && reason !== null && 'message' in reason) {
        message = String((reason as { message: unknown }).message)
      } else if (typeof reason === 'string') {
        message = reason
      }
      setDataError(message)
      throw new Error(message, { cause: reason })
    }
  }

  if (view === 'admin') {
    if (auth.loading) return loadingScreen
    if (!auth.profile) {
      return (
        <Suspense fallback={loadingScreen}>
          <LoginPage onBack={() => navigate('site')} />
        </Suspense>
      )
    }
    if (!canAccessAdmin(auth.profile.role)) {
      return (
        <main className="access-denied">
          <h1>{tr('Admin access required')}</h1>
          <p>{tr('This account has a viewer role.')}</p>
          <button onClick={() => navigate('site')}>{tr('Public website')}</button>
          <button onClick={() => void auth.signOut()}>{tr('Sign out')}</button>
        </main>
      )
    }
    if (dataLoading || readyScope !== scope) return loadingScreen
    return (
      <Suspense fallback={loadingScreen}>
      <AdminPanel
        clubs={clubs}
        seasons={seasons}
        teams={derivedTeams}
        players={derivedPlayers}
        matches={matches}
        stories={stories}
        media={media}
        sponsors={sponsors}
        profile={auth.profile}
        backend={auth.backend}
        error={dataError}
        onAddSeason={(season: Season) => mutate(() => tournamentRepository.addSeason(season))}
        onUpdateSeason={(season: Season) => mutate(() => tournamentRepository.updateSeason(season))}
        onDeleteSeason={(id: number) => mutate(() => tournamentRepository.deleteSeason(id))}
        onAddTeam={(team: Team, roster: EntryRoster) => mutate(() => tournamentRepository.addTeam(team, roster))}
        onUpdateTeam={(team: Team) => mutate(() => tournamentRepository.updateTeam(team))}
        onDeleteTeam={(id: number) => mutate(() => tournamentRepository.deleteTeam(id))}
        onAddPlayer={(player: Player) => mutate(() => tournamentRepository.addPlayer(player))}
        onUpdatePlayer={(player: Player) => mutate(() => tournamentRepository.updatePlayer(player))}
        onDeletePlayer={(id: number) => mutate(() => tournamentRepository.deletePlayer(id))}
        onSaveLineup={(teamId: number, lineup: Lineup) => mutate(() => tournamentRepository.saveLineup(teamId, lineup))}
        onSetSquad={(playerId: number, seasonId: number, teamId: number | null) => mutate(() => tournamentRepository.setSquad(playerId, seasonId, teamId))}
        onGenerateFixtures={(seasonId: number, options: FixtureOptions) => mutate(() => tournamentRepository.generateFixtures(seasonId, options))}
        onAddMatch={(match: Match) => mutate(() => tournamentRepository.addMatch(match))}
        onUpdateMatch={(match: Match) => mutate(() => tournamentRepository.updateMatch(match))}
        onDeleteMatch={(id: number) => mutate(() => tournamentRepository.deleteMatch(id))}
        onAddMatchEvent={(matchId: number, event: MatchEvent) => mutate(() => tournamentRepository.addMatchEvent(matchId, event))}
        onDeleteMatchEvent={(matchId: number, eventId: number) => mutate(() => tournamentRepository.deleteMatchEvent(matchId, eventId))}
        onAddStory={(story: Story) => mutate(() => tournamentRepository.addStory(story))}
        onUpdateStory={(story: Story) => mutate(() => tournamentRepository.updateStory(story))}
        onDeleteStory={(id: number) => mutate(() => tournamentRepository.deleteStory(id))}
        onToggleStory={(id: number) => mutate(() => tournamentRepository.toggleStory(id))}
        onRefresh={refresh}
        onSignOut={auth.signOut}
        onViewSite={() => navigate('site')}
      />
      </Suspense>
    )
  }

  if (dataLoading || readyScope !== scope) return loadingScreen
  return (
    <>
      {changingSeason && <div className="public-data-loading" role="status">Loading tournament…</div>}
      {dataError ? <div className="public-data-error" role="alert">Tournament data could not be refreshed. <button onClick={() => void refresh(retrySeason.current)}>Retry</button></div> : null}
      <PublicSite
        seasons={seasons}
        teams={derivedTeams}
        players={derivedPlayers}
        selectedSeasonId={selectedSeasonId}
        loadingSeason={changingSeason}
        onSelectSeason={selectSeason}
        matches={matches}
        stories={stories.filter((story) => isStoryPublic(story))}
        media={media.filter((asset) => asset.isPublished)}
        sponsors={sponsors.filter((sponsor) => sponsor.isActive)}
        onAdmin={() => navigate('admin')}
      />
    </>
  )
}


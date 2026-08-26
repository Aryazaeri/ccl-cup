import { useCallback, useEffect, useMemo, useState } from 'react'
import { canAccessAdmin, useAuth } from './auth/AuthContext'
import { AdminPanel } from './components/AdminPanel'
import { LoginPage } from './components/LoginPage'
import { PublicSite } from './components/PublicSite'
import { withDerivedTeamTotals } from './lib/standingsUtils'
import { tournamentRepository, type TournamentData } from './services/tournamentRepository'
import type { Match, MatchEvent, MediaAsset, Player, Season, Sponsor, Story, Team, View } from './types'

const currentView = (): View => (window.location.hash.startsWith('#admin') ? 'admin' : 'site')

export default function App() {
  const auth = useAuth()
  const [view, setView] = useState<View>(currentView)
  const [seasons, setSeasons] = useState<Season[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [stories, setStories] = useState<Story[]>([])
  const [media, setMedia] = useState<MediaAsset[]>([])
  const [sponsors, setSponsors] = useState<Sponsor[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [dataError, setDataError] = useState('')

  const applyData = useCallback((data: TournamentData) => {
    setSeasons(data.seasons ?? [])
    setTeams(data.teams)
    setPlayers(data.players)
    setMatches(data.matches)
    setStories(data.stories)
    setMedia(data.media ?? [])
    setSponsors(data.sponsors ?? [])
  }, [])

  const refresh = useCallback(async () => {
    setDataLoading(true)
    setDataError('')
    try {
      applyData(await tournamentRepository.load())
    } catch (reason) {
      setDataError(reason instanceof Error ? reason.message : 'Unable to load tournament data.')
    } finally {
      setDataLoading(false)
    }
  }, [applyData])

  useEffect(() => {
    void refresh()
  }, [refresh, auth.profile?.id])

  // `played`, `goalDifference` and `points` are derived from results rather
  // than read from storage, so every surface sees the same live numbers.
  const derivedTeams = useMemo(() => withDerivedTeamTotals(teams, matches), [teams, matches])

  useEffect(() => {
    const onHash = () => setView(currentView())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const navigate = (next: View) => {
    window.location.hash = next === 'admin' ? 'admin' : 'site'
    setView(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const mutate = async (operation: () => Promise<TournamentData>) => {
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
      throw new Error(message)
    }
  }

  if (dataLoading || auth.loading) return <div className="app-loading"><span /><strong>Loading CCL Cup…</strong></div>

  if (view === 'admin') {
    if (!auth.profile) return <LoginPage onBack={() => navigate('site')} />
    if (!canAccessAdmin(auth.profile.role)) {
      return (
        <main className="access-denied">
          <h1>Admin access required</h1>
          <p>This account has a viewer role.</p>
          <button onClick={() => void auth.signOut()}>Sign out</button>
        </main>
      )
    }
    return (
      <AdminPanel
        seasons={seasons}
        teams={derivedTeams}
        players={players}
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
        onAddTeam={(team: Team) => mutate(() => tournamentRepository.addTeam(team))}
        onUpdateTeam={(team: Team) => mutate(() => tournamentRepository.updateTeam(team))}
        onDeleteTeam={(id: number) => mutate(() => tournamentRepository.deleteTeam(id))}
        onAddPlayer={(player: Player) => mutate(() => tournamentRepository.addPlayer(player))}
        onUpdatePlayer={(player: Player) => mutate(() => tournamentRepository.updatePlayer(player))}
        onDeletePlayer={(id: number) => mutate(() => tournamentRepository.deletePlayer(id))}
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
    )
  }

  return (
    <>
      {dataError ? <div className="public-data-error">Data connection: {dataError}</div> : null}
      <PublicSite
        seasons={seasons}
        teams={derivedTeams}
        players={players}
        matches={matches.filter((match) => match.status === 'Scheduled')}
        stories={stories.filter((story) => story.status === 'Published')}
        media={media.filter((asset) => asset.isPublished)}
        sponsors={sponsors.filter((sponsor) => sponsor.isActive)}
        onAdmin={() => navigate('admin')}
      />
    </>
  )
}


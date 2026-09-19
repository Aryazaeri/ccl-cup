import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  Flame,
  MapPin,
  Menu,
  MessageCircle,
  Play,
  Radio,
  Search,
  Send,
  Shield,
  User,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { flagImageUrl, getCountry } from '../lib/countries'
import { computeGroupStandings, computePlayerStats, computeTopAssists, computeTopScorers } from '../lib/standingsUtils'
import { seasonLabelsForIds } from '../lib/seasonLabels'
import { commentsRepository } from '../services/tournamentRepository'
import type { Comment, Match, MediaAsset, Player, Season, Sponsor, Story, Team } from '../types'
import { Brand } from './Brand'
import { Modal } from './Modal'
import { TeamMark } from './TeamMark'

/* ------------------------------------------------------------------ *
 * Site configuration
 *
 * TODO — replace every value in this block with the real ones before launch.
 * Everything the public site says about the organisation, and every outbound
 * link, is collected here so none of it is buried in the markup.
 *
 * A social link left as an empty string is simply not rendered, so the row
 * degrades to whatever is actually filled in.
 * ------------------------------------------------------------------ */
const SITE_CONFIG = {
  social: {
    instagram: '', // TODO e.g. 'https://instagram.com/cclcup'
    youtube: '', // TODO
    linkedin: '', // TODO
  },
  whatsapp: {
    // TODO — international format, digits only, no '+' or spaces.
    number: '',
    message: 'Hello! I have a question about the CCL Cup.',
  },
  about: {
    // TODO — replace with the organisation's own copy.
    intro:
      'The CCL Cup brings corporate teams together for a season of competitive football, played to full match-day standards across the host city.',
    history:
      'Founded to give company sides a real competition rather than a series of friendlies, the Cup has grown into a multi-format season running group stages, league tables and knockout rounds side by side.',
    vision:
      'A tournament that treats amateur football seriously: proper fixtures, published results, verified standings, and a record every club can point back to.',
    rules: [
      'Squads register a minimum of five players before their first fixture.',
      'Group stage points: three for a win, one for a draw.',
      'Ties are separated by goal difference, then goals scored, then head-to-head.',
      'A player may represent only one club per season.',
    ],
    venueNote:
      'Fixtures are played at the host city venues listed on each match. Kick-off times are local.',
  },
}

/* ------------------------------------------------------------------ *
 * Routing
 *
 * Detail views used to be modal-only: nothing had a URL, so a match or a squad
 * could not be linked or shared. The app already routes on the hash, so
 * `#site/match/10` opens that fixture directly on load and the browser's back
 * button closes it.
 * ------------------------------------------------------------------ */

type PublicRoute =
  | { kind: 'home' }
  | { kind: 'team'; id: number }
  | { kind: 'player'; id: number }
  | { kind: 'match'; id: number }
  | { kind: 'story'; id: number }

const DETAIL_KINDS = ['team', 'player', 'match', 'story'] as const

export function parsePublicRoute(hash: string): PublicRoute {
  const parts = hash.replace(/^#/, '').split('/').filter(Boolean)
  // parts[0] is the surface ("site"); the detail segment follows it.
  const kind = parts[1]
  const id = Number(parts[2])
  if (kind && (DETAIL_KINDS as readonly string[]).includes(kind) && Number.isFinite(id) && id > 0) {
    return { kind: kind as (typeof DETAIL_KINDS)[number], id }
  }
  return { kind: 'home' }
}

function routeToHash(route: PublicRoute): string {
  return route.kind === 'home' ? '#site' : `#site/${route.kind}/${route.id}`
}

type Props = {
  seasons: Season[]
  teams: Team[]
  players: Player[]
  matches: Match[]
  stories: Story[]
  media: MediaAsset[]
  sponsors: Sponsor[]
  onAdmin: () => void
}

// Order matches the sections on the page.
const nav = [
  { label: 'Fixtures', id: 'fixtures' },
  { label: 'Standings', id: 'standings' },
  { label: 'Scorers', id: 'scorers' },
  { label: 'News', id: 'news' },
  { label: 'Clubs', id: 'teams' },
  { label: 'About', id: 'about' },
]

const STORY_CATEGORY_LABELS: Record<string, string> = {
  news: 'News',
  match_report: 'Match report',
  announcement: 'Announcement',
  press: 'Press',
  panorama: 'Feature',
}

function storyCategoryLabel(category?: string): string {
  return (category && STORY_CATEGORY_LABELS[category]) || 'Story'
}

/**
 * Is this player on the books for the given season?
 *
 * An empty or absent list means no season history was ever recorded, which is
 * treated as "still current" rather than "never played" — otherwise every
 * player imported before season membership existed would vanish from the site.
 */
function playerActiveIn(player: Player, seasonId?: number): boolean {
  if (seasonId == null) return true
  const active = player.activeSeasonIds
  return !active || active.length === 0 || active.includes(seasonId)
}

export function PublicSite({ seasons, teams, players, matches, stories, media, sponsors, onAdmin }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [route, setRoute] = useState<PublicRoute>(() => parsePublicRoute(window.location.hash))
  const [seasonMenuOpen, setSeasonMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [groupIndex, setGroupIndex] = useState(0)

  /* ---------------- Season scoping ---------------- */

  // Newest first, so the switcher opens on the current campaign.
  const seasonOptions = useMemo(
    () => [...seasons].sort((a, b) => b.year - a.year || b.id - a.id),
    [seasons],
  )

  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null)

  // Default to the season marked current, else the newest.
  useEffect(() => {
    if (selectedSeasonId !== null || seasonOptions.length === 0) return
    const current = seasonOptions.find((season) => season.isActive) ?? seasonOptions[0]
    setSelectedSeasonId(current.id)
  }, [seasonOptions, selectedSeasonId])

  const activeSeason = useMemo(
    () => seasonOptions.find((season) => season.id === selectedSeasonId) ?? seasonOptions[0],
    [seasonOptions, selectedSeasonId],
  )

  /**
   * Whether the club records actually carry season membership.
   *
   * Local/demo data predates the column, so every team has `seasonId`
   * undefined. Filtering that strictly would blank the whole portal. When no
   * club anywhere claims a season the dataset is effectively one season and is
   * shown whole; the moment any club does, scoping is real and enforced.
   */
  const seasonScopingAvailable = useMemo(() => teams.some((team) => team.seasonId != null), [teams])

  /**
   * Clubs registered for the selected season.
   *
   * This deliberately does NOT fall back to the full list when a season has no
   * clubs. It used to, and the effect was that picking an empty season showed
   * every club in the database as though they were all competing in it — the
   * switcher looked like it did nothing. An empty season is a real state and
   * the sections below say so.
   */
  const seasonTeams = useMemo(() => {
    if (!activeSeason || !seasonScopingAvailable) return teams
    return teams.filter((team) => team.seasonId === activeSeason.id)
  }, [teams, activeSeason, seasonScopingAvailable])

  // Fixtures carry their own season id. Ones predating the column fall back to
  // club membership so they are not dropped, but nothing falls back to "show
  // everything" — see seasonTeams.
  const seasonMatches = useMemo(() => {
    if (!activeSeason || !seasonScopingAvailable) return matches
    const names = new Set(seasonTeams.map((team) => team.name))
    return matches.filter((match) =>
      match.seasonId != null ? match.seasonId === activeSeason.id : names.has(match.home) || names.has(match.away),
    )
  }, [matches, seasonTeams, activeSeason, seasonScopingAvailable])

  /**
   * Squad members for the selected season.
   *
   * Two conditions, not one. The club must be in the season, and the player
   * must be active in it — `activeSeasonIds` is what makes a roster
   * historically valid, so a player who left before this season is excluded
   * from its scorer lists even though their club still competes. A player with
   * no season list at all has no history recorded and is treated as current.
   */
  const seasonPlayers = useMemo(() => {
    if (!activeSeason || !seasonScopingAvailable) return players
    const ids = new Set(seasonTeams.map((team) => team.id))
    const names = new Set(seasonTeams.map((team) => team.name))
    return players.filter((player) => {
      const inSeasonClub = ids.has(player.teamId) || (!!player.teamName && names.has(player.teamName))
      return inSeasonClub && playerActiveIn(player, activeSeason.id)
    })
  }, [players, seasonTeams, activeSeason, seasonScopingAvailable])

  /**
   * Editorial, media and sponsors for the season.
   *
   * A null `seasonId` here means "not tied to a season" — an explainer about
   * the competition, an evergreen partner — so those stay visible whichever
   * season is selected. Only rows that name a different season drop out.
   */
  const seasonStories = useMemo(
    () => (activeSeason ? stories.filter((s) => s.seasonId == null || s.seasonId === activeSeason.id) : stories),
    [stories, activeSeason],
  )
  const seasonMedia = useMemo(
    () => (activeSeason ? media.filter((m) => m.seasonId == null || m.seasonId === activeSeason.id) : media),
    [media, activeSeason],
  )
  const seasonSponsors = useMemo(
    () => (activeSeason ? sponsors.filter((x) => x.seasonId == null || x.seasonId === activeSeason.id) : sponsors),
    [sponsors, activeSeason],
  )

  const completedOrLiveMatches = useMemo(
    () => seasonMatches.filter((m) => m.matchStatus === 'completed' || m.matchStatus === 'live'),
    [seasonMatches],
  )

  // Detail views resolve from the route rather than from their own state.
  const activeMatch = useMemo(
    () => (route.kind === 'match' ? matches.find((m) => m.id === route.id) ?? null : null),
    [route, matches],
  )
  const activeStory = useMemo(
    () => (route.kind === 'story' ? stories.find((x) => x.id === route.id) ?? null : null),
    [route, stories],
  )
  const selectedTeamRoster = useMemo(
    () => (route.kind === 'team' ? teams.find((t) => t.id === route.id) ?? null : null),
    [route, teams],
  )
  const activePlayer = useMemo(
    () => (route.kind === 'player' ? players.find((p) => p.id === route.id) ?? null : null),
    [route, players],
  )

  const teamLookup = useMemo(() => {
    return new Map(teams.map((t) => [t.name, t]))
  }, [teams])

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams])

  // Derived from results on every render — never read from the stored
  // points/played columns, which are no longer the source of truth.
  //
  // One group (or none) renders as a single league table; two or more render
  // as separate group tables, which is what the competition format calls for.
  const standingsGroups = useMemo(
    () => computeGroupStandings(seasonTeams, seasonMatches),
    [seasonTeams, seasonMatches],
  )
  const hasResults = useMemo(
    () => standingsGroups.some((group) => group.rows.some((row) => row.played > 0)),
    [standingsGroups],
  )

  // Same engine the admin panel uses, so the two can never disagree.
  const topScorers = useMemo(
    () => computeTopScorers(seasonPlayers, seasonMatches, 10),
    [seasonPlayers, seasonMatches],
  )

  const topAssists = useMemo(
    () => computeTopAssists(seasonPlayers, seasonMatches, 5),
    [seasonPlayers, seasonMatches],
  )

  const participants = useMemo(
    () => [...seasonTeams].sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    [seasonTeams],
  )

  const playersByTeamId = useMemo(() => {
    const counts = new Map<number, number>()
    for (const player of seasonPlayers) {
      counts.set(player.teamId, (counts.get(player.teamId) ?? 0) + 1)
    }
    return counts
  }, [seasonPlayers])

  // The hash is the source of truth, so a deep link, a back button and an
  // in-page click all arrive through the same path.
  useEffect(() => {
    const onHash = () => setRoute(parsePublicRoute(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const openDetail = (next: PublicRoute) => {
    window.location.assign(routeToHash(next))
  }
  const closeDetail = () => {
    // Prefer going back so the detail view does not pile up in history.
    if (window.history.length > 1) window.history.back()
    else window.location.hash = '#site'
  }

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    setMenuOpen(false)
  }

  // Matches arrive in kickoff order, so the most recent result is the last
  // completed one. A match in progress outranks it.
  const liveMatch = seasonMatches.find((m) => m.matchStatus === 'live') ?? null
  const recentResults = [...completedOrLiveMatches].reverse()
  const latestResult = liveMatch ?? recentResults.find((m) => m.matchStatus === 'completed') ?? null
  const scheduledMatches = seasonMatches.filter((m) => m.matchStatus === 'scheduled')
  const upcomingMatch = scheduledMatches[0] ?? null
  const shownGroup = standingsGroups[Math.min(groupIndex, Math.max(standingsGroups.length - 1, 0))]
  const leadStory = seasonStories[0]
  const seasonTitle = activeSeason ? `CCL Cup ${activeSeason.city} ${activeSeason.year}` : 'CCL Cup'

  const fixtureRow = (match: Match) => {
    const homeTeam = teamLookup.get(match.home)
    const awayTeam = teamLookup.get(match.away)
    const played = match.homeScore != null && match.awayScore != null
    return (
      <li key={match.id}>
        <button className="pg-fixture" onClick={() => openDetail({ kind: 'match', id: match.id })}>
          <time>{match.date}</time>
          <span className="pg-fixture-team">
            <TeamMark name={match.home} color={homeTeam?.color} secondaryColor={homeTeam?.secondaryColor} logoUrl={homeTeam?.logoUrl} size="sm" />
            <strong>{match.home}</strong>
          </span>
          <b className={played ? 'pg-fixture-score' : 'pg-fixture-time'}>
            {played ? `${match.homeScore}–${match.awayScore}` : match.time}
          </b>
          <span className="pg-fixture-team is-away">
            <strong>{match.away}</strong>
            <TeamMark name={match.away} color={awayTeam?.color} secondaryColor={awayTeam?.secondaryColor} logoUrl={awayTeam?.logoUrl} size="sm" />
          </span>
          <small>{match.matchStatus === 'live' ? 'Live now' : match.venue}</small>
        </button>
      </li>
    )
  }

  return (
    <div className="public-site programme">
      <FlagRippleDefs />
      <section className="pg-hero" id="home">
        <img className="pg-hero-photo" src="/assets/ccl-hero.png" alt="" />
        <div className="pg-hero-shade" />
        <header className="public-header content-width">
          <button className="brand-button" onClick={() => scrollTo('home')}>
            <Brand />
          </button>
          <nav className={menuOpen ? 'public-nav is-open' : 'public-nav'} aria-label="Main navigation">
            {nav.map((item) => (
              <button key={item.id} onClick={() => scrollTo(item.id)}>
                {item.label}
              </button>
            ))}
          </nav>
          <button
            className="search-button"
            aria-label="Search the site"
            onClick={() => setSearchOpen(true)}
          >
            <Search size={18} />
          </button>

          <div className="season-switcher">
            <button
              className="season-button"
              aria-haspopup="listbox"
              aria-expanded={seasonMenuOpen}
              disabled={seasonOptions.length === 0}
              onClick={() => setSeasonMenuOpen((open) => !open)}
            >
              {activeSeason ? `${activeSeason.city} ${activeSeason.year}` : 'Season'}
              <ChevronDown size={16} />
            </button>
            {seasonMenuOpen && seasonOptions.length > 0 && (
              <>
                <div className="season-menu-scrim" onClick={() => setSeasonMenuOpen(false)} />
                <ul className="season-menu" role="listbox" aria-label="Choose a season">
                  {seasonOptions.map((season) => {
                    const isSelected = season.id === activeSeason?.id
                    return (
                      <li key={season.id}>
                        <button
                          role="option"
                          aria-selected={isSelected}
                          className={isSelected ? 'is-selected' : ''}
                          onClick={() => {
                            setSelectedSeasonId(season.id)
                            setGroupIndex(0)
                            setSeasonMenuOpen(false)
                          }}
                        >
                          <span>
                            <strong>
                              {season.year} {season.name}
                            </strong>
                            <small>{season.city}</small>
                          </span>
                          {isSelected ? <Check size={16} /> : null}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </div>

          <button
            className="menu-button"
            aria-label="Toggle navigation"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X /> : <Menu />}
          </button>
        </header>

        <div className="pg-hero-body content-width">
          <h1 className={latestResult ? 'pg-hero-title' : 'pg-hero-title is-large'}>{seasonTitle}</h1>

          {latestResult ? (
            <button className="pg-scoreboard" onClick={() => openDetail({ kind: 'match', id: latestResult.id })}>
              <span className="pg-scoreboard-status">
                {latestResult.matchStatus === 'live' ? <span className="pg-live">Live</span> : 'Full time'}
                <span>
                  {latestResult.date}, {latestResult.stage}
                </span>
              </span>
              <span className="pg-scoreboard-row">
                <span className="pg-scoreboard-team">
                  <TeamMark
                    name={latestResult.home}
                    color={teamLookup.get(latestResult.home)?.color}
                    secondaryColor={teamLookup.get(latestResult.home)?.secondaryColor}
                    logoUrl={teamLookup.get(latestResult.home)?.logoUrl}
                    size="lg"
                  />
                  <strong>{latestResult.home}</strong>
                </span>
                <span className="pg-scoreboard-score" aria-label={`${latestResult.homeScore ?? 0} to ${latestResult.awayScore ?? 0}`}>
                  <b>{latestResult.homeScore ?? 0}</b>
                  <b>{latestResult.awayScore ?? 0}</b>
                </span>
                <span className="pg-scoreboard-team is-away">
                  <TeamMark
                    name={latestResult.away}
                    color={teamLookup.get(latestResult.away)?.color}
                    secondaryColor={teamLookup.get(latestResult.away)?.secondaryColor}
                    logoUrl={teamLookup.get(latestResult.away)?.logoUrl}
                    size="lg"
                  />
                  <strong>{latestResult.away}</strong>
                </span>
              </span>
            </button>
          ) : (
            <p className="pg-hero-lede">
              {upcomingMatch
                ? `The season kicks off on ${upcomingMatch.date}. Results, tables and scorers appear here as matches are played.`
                : 'Fixtures for this season will be published here once the draw is made.'}
            </p>
          )}

          {upcomingMatch ? (
            <button className="pg-next" onClick={() => openDetail({ kind: 'match', id: upcomingMatch.id })}>
              <span className="pg-next-label">Next match</span>
              <strong>
                {upcomingMatch.home} v {upcomingMatch.away}
              </strong>
              <span>
                {upcomingMatch.date}, {upcomingMatch.time} at {upcomingMatch.venue}
              </span>
            </button>
          ) : null}

          <div className="pg-hero-actions">
            <button className="pg-button" onClick={() => scrollTo('fixtures')}>
              See all fixtures
            </button>
            <button className="pg-button is-ghost" onClick={() => scrollTo('standings')}>
              See the table
            </button>
          </div>
        </div>
      </section>

      <main>
        <section className="pg-section content-width" id="fixtures">
          <h2 className="pg-heading">Fixtures and results</h2>
          {seasonMatches.length === 0 ? (
            <p className="pg-empty">No fixtures have been scheduled for this season yet.</p>
          ) : (
            <div className="pg-fixture-columns">
              <div>
                <h3 className="pg-subheading">Latest results</h3>
                {recentResults.length === 0 ? (
                  <p className="pg-empty">No results yet. The first scores appear here at full time.</p>
                ) : (
                  <ol className="pg-fixture-list">{recentResults.slice(0, 5).map(fixtureRow)}</ol>
                )}
              </div>
              <div>
                <h3 className="pg-subheading">Coming up</h3>
                {scheduledMatches.length === 0 ? (
                  <p className="pg-empty">Every fixture this season has been played.</p>
                ) : (
                  <ol className="pg-fixture-list">{scheduledMatches.slice(0, 5).map(fixtureRow)}</ol>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="pg-section content-width" id="standings">
          <div className="pg-heading-row">
            <h2 className="pg-heading">Standings</h2>
            {standingsGroups.length > 1 ? (
              <div className="pg-tabs" role="tablist" aria-label="Choose a group">
                {standingsGroups.map((group, index) => (
                  <button
                    key={group.groupId}
                    role="tab"
                    aria-selected={group === shownGroup}
                    className={group === shownGroup ? 'is-selected' : ''}
                    onClick={() => setGroupIndex(index)}
                  >
                    {group.groupName}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {seasonTeams.length === 0 || !shownGroup ? (
            <p className="pg-empty">No clubs are registered for this season yet, so there is no table to show.</p>
          ) : (
            <div className="pg-table-card" role={standingsGroups.length > 1 ? 'tabpanel' : undefined}>
              <div className="table-scroll">
                <table className="pg-table">
                  <thead>
                    <tr>
                      <th scope="col" className="pg-num">Pos</th>
                      <th scope="col">Club</th>
                      <th scope="col" className="pg-num" title="Played">P</th>
                      <th scope="col" className="pg-num" title="Won">W</th>
                      <th scope="col" className="pg-num" title="Drawn">D</th>
                      <th scope="col" className="pg-num" title="Lost">L</th>
                      <th scope="col" className="pg-num pg-wide" title="Goals for">GF</th>
                      <th scope="col" className="pg-num pg-wide" title="Goals against">GA</th>
                      <th scope="col" className="pg-num" title="Goal difference">GD</th>
                      <th scope="col" className="pg-num" title="Points">Pts</th>
                      <th scope="col" className="pg-form-col">Form</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownGroup.rows.map((row) => {
                      const country = getCountry(row.countryCode)
                      const team = teamById.get(row.teamId)
                      return (
                        <tr key={row.teamId} onClick={() => team && openDetail({ kind: 'team', id: team.id })}>
                          <td className="pg-num">{row.position}</td>
                          <td>
                            <button
                              className="pg-club-cell"
                              onClick={(event) => {
                                event.stopPropagation()
                                if (team) openDetail({ kind: 'team', id: team.id })
                              }}
                            >
                              <TeamMark name={row.teamName} color={row.color} secondaryColor={team?.secondaryColor} logoUrl={row.logoUrl} size="sm" />
                              <strong>{row.teamName}</strong>
                              <span title={country.name}>{country.flag}</span>
                            </button>
                          </td>
                          <td className="pg-num">{row.played}</td>
                          <td className="pg-num">{row.won}</td>
                          <td className="pg-num">{row.drawn}</td>
                          <td className="pg-num">{row.lost}</td>
                          <td className="pg-num pg-wide">{row.goalsFor}</td>
                          <td className="pg-num pg-wide">{row.goalsAgainst}</td>
                          <td className="pg-num">{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td>
                          <td className="pg-num pg-points">{row.points}</td>
                          <td className="pg-form-col">
                            {row.form.length === 0 ? (
                              <span className="pg-muted">None yet</span>
                            ) : (
                              <span className="pg-form">
                                {row.form.map((result, index) => (
                                  <span
                                    key={index}
                                    className={`pg-form-pip is-${result.toLowerCase()}`}
                                    title={result === 'W' ? 'Won' : result === 'D' ? 'Drawn' : 'Lost'}
                                  >
                                    {result}
                                  </span>
                                ))}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="pg-table-note">
                {hasResults
                  ? 'Three points for a win, one for a draw. Select a club to see its squad.'
                  : 'No results yet. The table updates itself as matches are completed.'}
              </p>
            </div>
          )}
        </section>

        <section className="pg-band" id="scorers">
          <div className="content-width">
            <h2 className="pg-heading">Top scorers</h2>
            {topScorers.length === 0 ? (
              <p className="pg-empty">No goals yet. The scorer race starts with the first one.</p>
            ) : (
              <div className={topAssists.length > 0 ? 'pg-scorers has-assists' : 'pg-scorers'}>
                <ol className="pg-stickers">
                  {topScorers.slice(0, 8).map((line, index) => {
                    const team = teamLookup.get(line.teamName)
                    const kit = {
                      '--kit': team?.color || '#0e4d35',
                      '--kit-2': team?.secondaryColor || '#f3f5f1',
                    } as React.CSSProperties
                    const content = (
                      <>
                        <span className="pg-sticker-kit" style={kit}>
                          <span className="pg-sticker-rank">{index + 1}</span>
                          <TeamMark name={line.teamName} color={team?.color} secondaryColor={team?.secondaryColor} logoUrl={team?.logoUrl} size="lg" />
                        </span>
                        <strong>{line.playerName}</strong>
                        <small>{line.teamName}</small>
                        <span className="pg-sticker-goals">
                          <b>{line.goals}</b> {line.goals === 1 ? 'goal' : 'goals'}
                        </span>
                      </>
                    )
                    return (
                      <li key={`${line.playerName}-${line.teamName}`}>
                        {line.playerId != null ? (
                          <button className="pg-sticker" onClick={() => openDetail({ kind: 'player', id: line.playerId! })}>
                            {content}
                          </button>
                        ) : (
                          <div className="pg-sticker">{content}</div>
                        )}
                      </li>
                    )
                  })}
                </ol>

                {topAssists.length > 0 ? (
                  <aside className="pg-assists">
                    <h3 className="pg-subheading">Most assists</h3>
                    <ol>
                      {topAssists.map((line) => (
                        <li key={`${line.playerName}-${line.teamName}`}>
                          <span>
                            <strong>{line.playerName}</strong>
                            <small>{line.teamName}</small>
                          </span>
                          <b>{line.assists}</b>
                        </li>
                      ))}
                    </ol>
                  </aside>
                ) : null}
              </div>
            )}
          </div>
        </section>

        <section className="pg-section content-width" id="news">
          <h2 className="pg-heading">News</h2>
          {!leadStory ? (
            <p className="pg-empty">Match reports and club news will appear here during the season.</p>
          ) : (
            <div className="pg-news">
              <button className="pg-lead-story" onClick={() => openDetail({ kind: 'story', id: leadStory.id })}>
                <img src={leadStory.coverImageUrl || '/assets/ccl-celebration.png'} alt="" />
                <span className="pg-lead-copy">
                  <small>
                    {storyCategoryLabel(leadStory.category)}
                    {leadStory.publishedAt ? `, ${leadStory.publishedAt}` : ''}
                  </small>
                  <strong>{leadStory.title}</strong>
                  {leadStory.summary ? <span>{leadStory.summary}</span> : null}
                  <em>Read the full story</em>
                </span>
              </button>
              {seasonStories.length > 1 ? (
                <ul className="pg-story-list">
                  {seasonStories.slice(1, 5).map((story) => (
                    <li key={story.id}>
                      <button onClick={() => openDetail({ kind: 'story', id: story.id })}>
                        <small>
                          {storyCategoryLabel(story.category)}
                          {story.publishedAt ? `, ${story.publishedAt}` : ''}
                        </small>
                        <strong>{story.title}</strong>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </section>

        <section className="pg-section content-width" id="teams">
          <h2 className="pg-heading">Clubs</h2>
          {participants.length === 0 ? (
            <p className="pg-empty">No clubs have been registered for this season yet.</p>
          ) : (
            <ul className="pg-clubs">
              {participants.map((team) => {
                const country = getCountry(team.countryCode)
                const squadSize = playersByTeamId.get(team.id) ?? 0
                return (
                  <li key={team.id}>
                    <button
                      className="pg-club"
                      style={{ '--kit': team.color || '#0e4d35' } as React.CSSProperties}
                      onClick={() => openDetail({ kind: 'team', id: team.id })}
                    >
                      <TeamMark name={team.name} color={team.color} secondaryColor={team.secondaryColor} logoUrl={team.logoUrl} size="lg" />
                      <strong>{team.name}</strong>
                      <span>
                        {country.flag} {country.name}
                      </span>
                      <small>
                        {team.groupName ? `${team.groupName}, ` : ''}
                        {squadSize} {squadSize === 1 ? 'player' : 'players'}
                      </small>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {seasonMedia.length > 0 && (
          <section className="pg-section media-section content-width" id="media">
            <h2 className="pg-heading">Highlights</h2>
            <div className="media-rail">
              {seasonMedia.slice(0, 6).map((asset) => {
                const body = (
                  <>
                    {asset.thumbnailUrl ? (
                      <img className="media-thumb" src={asset.thumbnailUrl} alt="" loading="lazy" />
                    ) : null}
                    {asset.kind === 'video' || asset.kind === 'highlight' || asset.kind === 'press_conference' ? (
                      <span className="media-play">
                        <Play />
                      </span>
                    ) : null}
                    <span className="video-title">{asset.title}</span>
                    {asset.durationSeconds ? (
                      <span className="media-duration">
                        {Math.floor(asset.durationSeconds / 60)}:
                        {String(asset.durationSeconds % 60).padStart(2, '0')}
                      </span>
                    ) : null}
                  </>
                )
                return asset.externalUrl ? (
                  <a
                    className="media-card clickable-card"
                    key={asset.id}
                    href={asset.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {body}
                  </a>
                ) : (
                  <div className="media-card" key={asset.id}>
                    {body}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        <section className="pg-about" id="about">
          <div className="content-width pg-about-grid">
            <div>
              <h2 className="pg-heading">About the cup</h2>
              <p className="pg-about-lead">{SITE_CONFIG.about.intro}</p>
              <p>{SITE_CONFIG.about.history}</p>
              <p>{SITE_CONFIG.about.vision}</p>
            </div>
            <div className="pg-about-facts">
              <h3 className="pg-subheading">
                <Shield size={17} /> Competition rules
              </h3>
              <ul>
                {SITE_CONFIG.about.rules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
              <h3 className="pg-subheading">
                <MapPin size={17} /> Venues and kick-off
              </h3>
              <p>{SITE_CONFIG.about.venueNote}</p>
              {activeSeason ? (
                <p>
                  Host city this season: <strong>{activeSeason.city}</strong>
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <CommentsSection />

        {seasonSponsors.length > 0 && (
          <section className="sponsors-section" id="sponsors">
            <div className="content-width">
              <h2 className="sponsors-title">Our partners</h2>
              <div className="sponsor-rail">
                {seasonSponsors.map((sponsor) => {
                  const mark = sponsor.logoUrl ? (
                    <img src={sponsor.logoUrl} alt={sponsor.name} loading="lazy" />
                  ) : (
                    <span className="sponsor-wordmark">{sponsor.name}</span>
                  )
                  return sponsor.websiteUrl ? (
                    <a
                      className="sponsor-item"
                      key={sponsor.id}
                      href={sponsor.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={sponsor.name}
                    >
                      {mark}
                    </a>
                  ) : (
                    <span className="sponsor-item" key={sponsor.id} title={sponsor.name}>
                      {mark}
                    </span>
                  )
                })}
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="public-footer">
        <div className="content-width">
          <Brand />
          <nav aria-label="Footer navigation">
            {nav.map((item) => (
              <button key={item.id} onClick={() => scrollTo(item.id)}>
                {item.label}
              </button>
            ))}
            <button onClick={onAdmin}>Staff login</button>
          </nav>

          <SocialLinks />

          <small>© {activeSeason?.year ?? new Date().getFullYear()} Corporate Champions League</small>
        </div>
      </footer>

      {/* Interactive Match Details Modal */}
      {activeMatch && (
        <MatchDetailsModal
          match={activeMatch}
          players={players}
          teams={teams}
          onClose={closeDetail}
        />
      )}

      {/* Interactive Story Reader Modal */}
      {activeStory && <StoryReaderModal story={activeStory} onClose={closeDetail} />}

      {/* Interactive Team Roster Modal */}
      {selectedTeamRoster && (
        <TeamRosterModal
          team={selectedTeamRoster}
          seasons={seasons}
          players={players.filter(
            (p) =>
              (p.teamId === selectedTeamRoster.id || p.teamName === selectedTeamRoster.name) &&
              playerActiveIn(p, selectedTeamRoster.seasonId ?? activeSeason?.id),
          )}
          onOpenPlayer={(player) => openDetail({ kind: 'player', id: player.id })}
          onClose={closeDetail}
        />
      )}

      {activePlayer && (
        <PlayerDetailModal
          player={activePlayer}
          team={teams.find((t) => t.id === activePlayer.teamId) ?? null}
          matches={seasonMatches}
          players={players}
          onClose={closeDetail}
        />
      )}

      {searchOpen && (
        <SearchOverlay
          teams={seasonTeams}
          players={seasonPlayers}
          matches={seasonMatches}
          stories={stories}
          onClose={() => setSearchOpen(false)}
          onSelectTeam={(team) => {
            setSearchOpen(false)
            openDetail({ kind: 'team', id: team.id })
          }}
          onSelectPlayer={(player) => {
            setSearchOpen(false)
            openDetail({ kind: 'player', id: player.id })
          }}
          onSelectMatch={(match) => {
            setSearchOpen(false)
            openDetail({ kind: 'match', id: match.id })
          }}
          onSelectStory={(story) => {
            setSearchOpen(false)
            openDetail({ kind: 'story', id: story.id })
          }}
        />
      )}

      <WhatsAppFloat />
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Social links and WhatsApp
 *
 * Both read from SITE_CONFIG and render nothing at all when it has not been
 * filled in, so an unconfigured site shows no dead links.
 * ------------------------------------------------------------------ */

/* Lucide removed its brand glyphs, so the three marks are inlined here. */

function InstagramMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41-.56-.22-.96-.48-1.38-.9-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16Zm0 3.68a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32Zm0 10.16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm7.85-10.4a1.44 1.44 0 1 1-2.88 0 1.44 1.44 0 0 1 2.88 0Z" />
    </svg>
  )
}

function YouTubeMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M23.5 6.5a3.02 3.02 0 0 0-2.12-2.14C19.5 3.85 12 3.85 12 3.85s-7.5 0-9.38.51A3.02 3.02 0 0 0 .5 6.5C0 8.38 0 12 0 12s0 3.62.5 5.5a3.02 3.02 0 0 0 2.12 2.14c1.88.51 9.38.51 9.38.51s7.5 0 9.38-.51a3.02 3.02 0 0 0 2.12-2.14C24 15.62 24 12 24 12s0-3.62-.5-5.5ZM9.6 15.6V8.4l6.24 3.6-6.24 3.6Z" />
    </svg>
  )
}

function LinkedInMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05a3.74 3.74 0 0 1 3.37-1.85c3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14ZM7.12 20.45H3.55V9h3.57v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0Z" />
    </svg>
  )
}

function SocialLinks() {
  const links = [
    { key: 'instagram', href: SITE_CONFIG.social.instagram, label: 'Instagram', Icon: InstagramMark },
    { key: 'youtube', href: SITE_CONFIG.social.youtube, label: 'YouTube', Icon: YouTubeMark },
    { key: 'linkedin', href: SITE_CONFIG.social.linkedin, label: 'LinkedIn', Icon: LinkedInMark },
  ].filter((link) => link.href.trim().length > 0)

  if (links.length === 0) return null

  return (
    <div className="social-links">
      {links.map(({ key, href, label, Icon }) => (
        <a key={key} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title={label}>
          <Icon />
        </a>
      ))}
    </div>
  )
}

function WhatsAppFloat() {
  const number = SITE_CONFIG.whatsapp.number.replace(/\D/g, '')
  if (!number) return null

  const href = `https://wa.me/${number}?text=${encodeURIComponent(SITE_CONFIG.whatsapp.message)}`

  return (
    <a
      className="whatsapp-float"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
    >
      <MessageCircle size={24} />
      <span>WhatsApp</span>
    </a>
  )
}

/* ------------------------------------------------------------------ *
 * Search
 *
 * Searches what is already in memory across clubs, players, fixtures and
 * stories. Everything the public site holds is already loaded, so this needs
 * no round trip.
 * ------------------------------------------------------------------ */

/** Folds Turkish dotted/dotless i and diacritics so "Istanbul" finds "İSTANBUL". */
function foldForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .toLowerCase()
    .trim()
}

function SearchOverlay({
  teams,
  players,
  matches,
  stories,
  onClose,
  onSelectTeam,
  onSelectPlayer,
  onSelectMatch,
  onSelectStory,
}: {
  teams: Team[]
  players: Player[]
  matches: Match[]
  stories: Story[]
  onClose: () => void
  onSelectTeam: (team: Team) => void
  onSelectPlayer: (player: Player) => void
  onSelectMatch: (match: Match) => void
  onSelectStory: (story: Story) => void
}) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const results = useMemo(() => {
    const q = foldForSearch(query)
    if (q.length < 2) return null

    const matchesText = (...values: (string | undefined)[]) =>
      values.some((value) => value && foldForSearch(value).includes(q))

    return {
      teams: teams.filter((team) => matchesText(team.name, team.shortName, team.countryName, team.managerName)).slice(0, 6),
      players: players
        .filter((player) => matchesText(player.fullName, player.teamName, player.position))
        .slice(0, 8),
      matches: matches.filter((match) => matchesText(match.home, match.away, match.venue, match.stage)).slice(0, 6),
      stories: stories.filter((story) => matchesText(story.title, story.summary)).slice(0, 5),
    }
  }, [query, teams, players, matches, stories])

  const total = results
    ? results.teams.length + results.players.length + results.matches.length + results.stories.length
    : 0

  return (
    <div className="search-overlay" role="dialog" aria-modal="true" aria-label="Search">
      <div className="search-scrim" onClick={onClose} />
      <div className="search-panel">
        <div className="search-field">
          <Search size={20} />
          <input
            ref={inputRef}
            type="search"
            value={query}
            placeholder="Search clubs, players, fixtures and stories…"
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search query"
          />
          <button className="search-close" onClick={onClose} aria-label="Close search">
            <X size={20} />
          </button>
        </div>

        <div className="search-results">
          {!results ? (
            <p className="search-hint">Type at least two characters to search.</p>
          ) : total === 0 ? (
            <p className="search-hint">No matches for “{query}”.</p>
          ) : (
            <>
              {results.teams.length > 0 && (
                <div className="search-group">
                  <h4>Clubs</h4>
                  {results.teams.map((team) => (
                    <button key={team.id} className="search-result" onClick={() => onSelectTeam(team)}>
                      <TeamMark
                        name={team.name}
                        color={team.color}
                        secondaryColor={team.secondaryColor}
                        logoUrl={team.logoUrl}
                        size="sm"
                      />
                      <span>
                        <strong>{team.name}</strong>
                        <small>{getCountry(team.countryCode).name}</small>
                      </span>
                      <ArrowRight size={16} />
                    </button>
                  ))}
                </div>
              )}

              {results.players.length > 0 && (
                <div className="search-group">
                  <h4>Players</h4>
                  {results.players.map((player) => (
                    <button
                      key={player.id}
                      className="search-result"
                      onClick={() => onSelectPlayer(player)}
                    >
                      <span className="search-shirt">{player.shirtNumber ?? '–'}</span>
                      <span>
                        <strong>{player.fullName}</strong>
                        <small>
                          {player.teamName} · {player.position.slice(0, 3).toUpperCase()}
                        </small>
                      </span>
                      <ArrowRight size={16} />
                    </button>
                  ))}
                </div>
              )}

              {results.matches.length > 0 && (
                <div className="search-group">
                  <h4>Fixtures</h4>
                  {results.matches.map((match) => (
                    <button key={match.id} className="search-result" onClick={() => onSelectMatch(match)}>
                      <CalendarDays size={17} />
                      <span>
                        <strong>
                          {match.home} v {match.away}
                        </strong>
                        <small>
                          {match.date} · {match.venue}
                        </small>
                      </span>
                      <ArrowRight size={16} />
                    </button>
                  ))}
                </div>
              )}

              {results.stories.length > 0 && (
                <div className="search-group">
                  <h4>Stories</h4>
                  {results.stories.map((story) => (
                    <button key={story.id} className="search-result" onClick={() => onSelectStory(story)}>
                      <Flame size={17} />
                      <span>
                        <strong>{story.title}</strong>
                        {story.summary ? <small>{story.summary}</small> : null}
                      </span>
                      <ArrowRight size={16} />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Comments
 *
 * Submissions are held for review — the database only ever returns approved
 * rows to the public, and refuses an insert that does not arrive as pending.
 * The submit-comment Edge Function screens each one with TypeSafe: clearly
 * clean comments are approved at once, the rest wait for a moderator.
 * ------------------------------------------------------------------ */

function CommentsSection() {
  const [comments, setComments] = useState<Comment[]>([])
  const [authorName, setAuthorName] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState<'approved' | 'pending' | null>(null)

  useEffect(() => {
    let cancelled = false
    void commentsRepository.listApproved().then((rows) => {
      if (!cancelled) setComments(rows)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSending(true)
    setError('')
    try {
      const status = await commentsRepository.submit({ authorName, body })
      setAuthorName('')
      setBody('')
      setSent(status)
      if (status === 'approved') setComments(await commentsRepository.listApproved())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your comment could not be sent.')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="comments-section content-width" id="feedback">
      <div className="section-title-row">
        <h2>Fan feedback</h2>
        <span className="hint-label">Comments are checked before they appear</span>
      </div>

      <div className="comments-grid">
        <form className="comment-form" onSubmit={submit}>
          {sent ? (
            <div className="comment-sent">
              <Check size={20} />
              {sent === 'approved' ? (
                <div>
                  <strong>Thanks — your comment is live.</strong>
                  <span>It now appears with the other comments.</span>
                </div>
              ) : (
                <div>
                  <strong>Thanks — your comment has been sent for review.</strong>
                  <span>It will appear here once a moderator approves it.</span>
                </div>
              )}
              <button type="button" className="text-link" onClick={() => setSent(null)}>
                Write another
              </button>
            </div>
          ) : (
            <>
              <label>
                Your name
                <input
                  value={authorName}
                  onChange={(event) => setAuthorName(event.target.value)}
                  placeholder="e.g. Deniz Kaya"
                  maxLength={60}
                  required
                />
              </label>
              <label>
                Your comment
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="Share your thoughts on the season so far…"
                  rows={5}
                  maxLength={2000}
                  required
                />
              </label>
              {error ? <p className="comment-error">{error}</p> : null}
              <button className="button button-primary" type="submit" disabled={sending}>
                {sending ? 'Sending…' : 'Send comment'} <Send size={17} />
              </button>
            </>
          )}
        </form>

        <div className="comment-list">
          {comments.length === 0 ? (
            <p className="standings-note">No approved comments yet — yours could be the first.</p>
          ) : (
            comments.map((comment) => (
              <article className="comment-card" key={comment.id}>
                <header>
                  <strong>{comment.authorName}</strong>
                  {comment.createdAt ? <time>{comment.createdAt}</time> : null}
                </header>
                <p>{comment.body}</p>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  )
}

function PlayerDetailModal({
  player,
  team,
  matches,
  players,
  onClose,
}: {
  player: Player
  team: Team | null
  matches: Match[]
  players: Player[]
  onClose: () => void
}) {
  const country = getCountry(player.nationality || team?.countryCode)
  // Derived from the event log, like every other number on the site.
  const stats = useMemo(
    () => computePlayerStats(players, matches).find((line) => line.playerId === player.id),
    [players, matches, player.id],
  )

  return (
    <Modal title={player.fullName} onClose={onClose}>
      <div className="player-detail">
        <div className="player-detail-head">
          {team ? <PlayerCutoutCard player={player} team={team} /> : null}
          <div className="player-detail-meta">
            <h3>{player.fullName}</h3>
            <p className="player-detail-club">
              {team ? team.name : player.teamName} · {country.flag} {country.name}
            </p>
            <div className="player-detail-tags">
              <span className={`position-tag ${player.position}`}>
                {player.position.slice(0, 3).toUpperCase()}
              </span>
              <span className="season-pill">#{player.shirtNumber ?? '—'}</span>
              {player.isCaptain ? <span className="season-pill">Captain</span> : null}
              {player.birthYear ? <span className="season-pill">Born {player.birthYear}</span> : null}
              {player.strongFoot ? <span className="season-pill">{player.strongFoot} footed</span> : null}
            </div>
          </div>
        </div>

        <div className="player-stat-grid">
          <div><b>{stats?.goals ?? 0}</b><span>Goals</span></div>
          <div><b>{stats?.assists ?? 0}</b><span>Assists</span></div>
          <div><b>{stats?.yellowCards ?? 0}</b><span>Yellow cards</span></div>
          <div><b>{stats?.redCards ?? 0}</b><span>Red cards</span></div>
        </div>
        <p className="standings-note">All figures are derived from the match event log.</p>
      </div>
    </Modal>
  )
}

function MatchDetailsModal({
  match,
  players,
  teams,
  onClose,
}: {
  match: Match
  players: Player[]
  teams: Team[]
  onClose: () => void
}) {
  const homeTeam = teams.find((t) => t.name === match.home)
  const awayTeam = teams.find((t) => t.name === match.away)

  const homeSquad = players.filter((p) => p.teamName === match.home || (homeTeam && p.teamId === homeTeam.id))
  const awaySquad = players.filter((p) => p.teamName === match.away || (awayTeam && p.teamId === awayTeam.id))

  const hasScore = match.homeScore != null && match.awayScore != null
  const events = match.events ?? []

  return (
    <Modal title="Match Center" onClose={onClose}>
      <div className="public-match-modal">
        {/* Match Hero Scoreboard */}
        <div className="match-hero-card">
          <div className="team-side">
            <TeamMark
              name={match.home}
              color={homeTeam?.color}
              secondaryColor={homeTeam?.secondaryColor}
              logoUrl={homeTeam?.logoUrl}
              countryCode={homeTeam?.countryCode}
              size="lg"
            />
            <h3>{match.home}</h3>
          </div>

          <div className="match-score-center">
            {hasScore ? (
              <div className="big-score">
                <span>{match.homeScore}</span>
                <i>:</i>
                <span>{match.awayScore}</span>
              </div>
            ) : (
              <div className="match-time-large">{match.time}</div>
            )}
            <span className={`status-pill ${match.matchStatus}`}>
              {match.matchStatus.toUpperCase()}
            </span>
            {match.streamUrl ? (
              <a
                className="watch-live-button"
                href={match.streamUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Radio size={16} />
                {match.matchStatus === 'live' ? 'Watch live' : 'Watch broadcast'}
              </a>
            ) : null}
          </div>

          <div className="team-side">
            <TeamMark
              name={match.away}
              color={awayTeam?.color}
              secondaryColor={awayTeam?.secondaryColor}
              logoUrl={awayTeam?.logoUrl}
              countryCode={awayTeam?.countryCode}
              size="lg"
            />
            <h3>{match.away}</h3>
          </div>
        </div>

        {/* Match Meta Strip */}
        <div className="match-info-strip">
          <span>
            <CalendarDays size={16} /> {match.date} · {match.time}
          </span>
          <span>
            <MapPin size={16} /> {match.venue}
          </span>
          <span>
            <Shield size={16} /> {match.stage}
          </span>
          {match.referee && (
            <span>
              <User size={16} /> Referee: {match.referee}
            </span>
          )}
        </div>

        {/* Timeline Events Section */}
        <div className="match-timeline-section">
          <h4>Match Timeline Events</h4>
          {events.length === 0 ? (
            <p className="no-events-text">No timeline events logged for this match fixture.</p>
          ) : (
            <div className="public-timeline">
              {events.map((ev) => (
                <div key={ev.id} className="public-event-row">
                  <span className="event-min">{ev.minute}'</span>
                  <span className="event-symbol">
                    {ev.eventType === 'goal' && '⚽'}
                    {ev.eventType === 'assist' && '🅰️'}
                    {ev.eventType === 'penalty_scored' && '🎯'}
                    {ev.eventType === 'yellow_card' && '🟨'}
                    {ev.eventType === 'red_card' && '🟥'}
                    {ev.eventType === 'substitution' && '🔄'}
                    {/* Anything the client does not draw explicitly — an
                        own goal or missed penalty inserted directly — still
                        gets a marker rather than an empty cell. */}
                    {!['goal', 'assist', 'penalty_scored', 'yellow_card', 'red_card', 'substitution'].includes(
                      ev.eventType,
                    ) && '•'}
                  </span>
                  <div className="event-desc">
                    <strong>{ev.playerName}</strong>
                    <span>({ev.teamName})</span>
                    {ev.notes && <small>— {ev.notes}</small>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Starting Lineups / Squads */}
        {(homeSquad.length > 0 || awaySquad.length > 0) && (
          <div className="match-lineups-grid">
            <div className="squad-column">
              <h5>{match.home} Squad</h5>
              {homeSquad.map((p) => (
                <div key={p.id} className="player-row-simple">
                  <span className="num">#{p.shirtNumber ?? '-'}</span>
                  <span>{p.fullName}</span>
                  <span className="pos-badge">{p.position.slice(0, 3).toUpperCase()}</span>
                </div>
              ))}
            </div>

            <div className="squad-column">
              <h5>{match.away} Squad</h5>
              {awaySquad.map((p) => (
                <div key={p.id} className="player-row-simple">
                  <span className="num">#{p.shirtNumber ?? '-'}</span>
                  <span>{p.fullName}</span>
                  <span className="pos-badge">{p.position.slice(0, 3).toUpperCase()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

function StoryReaderModal({ story, onClose }: { story: Story; onClose: () => void }) {
  const paragraphs = story.body ? story.body.split('\n\n') : [story.summary ?? '']

  return (
    <Modal title={story.title} onClose={onClose}>
      <article className="story-reader">
        {story.coverImageUrl && (
          <div className="reader-cover">
            <img src={story.coverImageUrl} alt={story.title} />
          </div>
        )}
        <div className="reader-meta">
          <span className="reader-category">
            {story.category?.replace('_', ' ').toUpperCase() ?? 'NEWS'}
          </span>
          <time>{story.publishedAt ?? '15 AUG 2026'}</time>
        </div>
        <h1 className="reader-title">{story.title}</h1>
        {story.summary && <p className="reader-lead">{story.summary}</p>}
        <div className="reader-body">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </article>
    </Modal>
  )
}

/* ------------------------------------------------------------------ *
 * Player cutout over an animated flag backdrop
 *
 * The player's own nationality wins over the club's country — a squad is
 * routinely mixed, and the flag is meant to say where the player is from.
 *
 * The backdrop is real flag artwork, not the emoji glyph it used to be. An
 * emoji skewed a couple of degrees reads as a wobbling sticker, never as
 * cloth, which is why the reference site (eurobusinesscup.com) ships painted
 * waving-flag bitmaps instead. We get the same fabric look without sourcing a
 * file per country: a flat flag bitmap displaced by an SVG turbulence filter,
 * with fold shading and a sheen over the top.
 *
 * If the bitmap cannot load — offline, CDN blocked — the emoji glyph is still
 * rendered underneath it, so the card degrades to what it looked like before
 * rather than to an empty box.
 * ------------------------------------------------------------------ */

/**
 * The turbulence + displacement pair that bends the flat bitmap into folds,
 * defined once for the whole page and referenced by id from every card.
 *
 * The fold geometry is deliberately static. Animating `baseFrequency` would
 * make the folds travel, but Blink does not animate filter-primitive
 * attributes over SMIL — the timeline runs and `beginElement()` succeeds while
 * `baseFrequency.animVal` never moves, so in Chrome it would be dead markup.
 * Static displacement is also what the reference site does: its waving flags
 * are painted bitmaps, with no flag animation anywhere in its stylesheet.
 *
 * The motion instead comes from CSS, which is reliable everywhere: the cloth
 * sways (`flag-wave`) and the fold shading travels across it (`flag-folds`).
 */
function FlagRippleDefs() {
  return (
    <svg className="flag-ripple-defs" aria-hidden="true" focusable="false">
      <filter id="ccl-flag-ripple" x="-12%" y="-12%" width="124%" height="124%">
        <feTurbulence type="fractalNoise" baseFrequency="0.011 0.026" numOctaves="3" seed="7" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="17" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  )
}

function FlagBackdrop({ country }: { country: ReturnType<typeof getCountry> }) {
  const src = flagImageUrl(country.code)
  const [failed, setFailed] = useState(false)

  return (
    <span className="cutout-flag" aria-hidden="true">
      <span className="cutout-flag-glyph">{country.flag}</span>
      {src && !failed ? (
        <img
          className="cutout-flag-img"
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : null}
      <span className="cutout-folds" />
      <span className="cutout-sheen" />
    </span>
  )
}

function PlayerCutoutCard({ player, team }: { player: Player; team: Team }) {
  const country = getCountry(player.nationality || team.countryCode)
  const initials = player.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

  return (
    <figure className="player-cutout" style={{ ['--club-color' as string]: team.color }}>
      <div className="cutout-stage">
        <FlagBackdrop country={country} />

        {player.photoUrl ? (
          <img className="cutout-photo" src={player.photoUrl} alt={player.fullName} loading="lazy" />
        ) : (
          <span className="cutout-initials" aria-hidden="true">
            {initials}
          </span>
        )}

        <span className="cutout-shirt">{player.shirtNumber ?? '–'}</span>
        {player.isCaptain ? <span className="cutout-captain" title="Captain">C</span> : null}
      </div>

      <figcaption>
        <strong>{player.fullName}</strong>
        <span>
          {country.flag} {player.position.slice(0, 3).toUpperCase()}
        </span>
      </figcaption>
    </figure>
  )
}

function TeamRosterModal({
  team,
  seasons,
  players,
  onOpenPlayer,
  onClose,
}: {
  team: Team
  seasons: Season[]
  players: Player[]
  onOpenPlayer: (player: Player) => void
  onClose: () => void
}) {
  const country = getCountry(team.countryCode)

  return (
    <Modal title={`${team.name} Club & Squad Profile`} onClose={onClose}>
      <div className="team-roster-modal">
        <div className="roster-header">
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
            {team.managerName && (
              <small style={{ display: 'block', marginTop: '4px', color: '#64748b' }}>
                Manager: <strong>{team.managerName}</strong> {team.coachName ? `· Coach: ${team.coachName}` : ''}
              </small>
            )}
          </div>
        </div>

        {team.bio && (
          <p style={{ fontSize: '0.88rem', color: '#475569', lineHeight: 1.5, margin: '0 0 16px', background: '#f8fafc', padding: '10px 14px', borderRadius: '6px' }}>
            {team.bio}
          </p>
        )}

        {players.length > 0 && (
          <div className="squad-cutout-grid">
            {players.map((player) => (
              <button
                key={player.id}
                className="cutout-link"
                onClick={() => onOpenPlayer(player)}
                title={`View ${player.fullName}`}
              >
                <PlayerCutoutCard player={player} team={team} />
              </button>
            ))}
          </div>
        )}

        <div className="roster-table-wrap">
          {players.length === 0 ? (
            <p className="empty-text" style={{ padding: '2rem', textAlign: 'center' }}>
              No players currently registered for this club.
            </p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>PLAYER</th>
                  <th>POSITION</th>
                  <th>PLAYED SEASONS</th>
                  <th>STATS</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span className="shirt-badge">{p.shirtNumber ?? '-'}</span>
                    </td>
                    <td>
                      <div className="player-cell">
                        <strong>{p.fullName}</strong>
                        {p.isCaptain && <span className="captain-badge" title="Team Captain">C</span>}
                      </div>
                    </td>
                    <td>
                      <span className={`position-tag ${p.position}`}>
                        {p.position.slice(0, 3).toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <div className="season-tags-list">
                        {seasonLabelsForIds(p.activeSeasonIds, seasons).map((label) => (
                          <span key={label} className="season-pill">{label}</span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span className="player-stats-text">
                        ⚽ {p.goals ?? 0} &nbsp;·&nbsp; 🎯 {p.assists ?? 0}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Modal>
  )
}

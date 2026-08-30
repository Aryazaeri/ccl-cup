import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  Flame,
  Goal,
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

const nav = ['Home', 'Fixtures', 'Standings', 'Teams', 'Scorers', 'News', 'About']

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

  // A live match outranks the next scheduled one — if something is being
  // played right now, that is the thing to lead with.
  const nextMatch = useMemo(
    () =>
      seasonMatches.find((m) => m.matchStatus === 'live') ??
      seasonMatches.find((m) => m.matchStatus === 'scheduled') ??
      seasonMatches[0],
    [seasonMatches],
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

  // Genuinely upcoming games lead; if the season is over, the most recent
  // fixtures still fill the panel rather than leaving it empty.
  const upcomingFixtures = useMemo(() => {
    const scheduled = seasonMatches.filter((match) => match.matchStatus === 'scheduled')
    return (scheduled.length > 0 ? scheduled : seasonMatches).slice(0, 4)
  }, [seasonMatches])

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
    window.location.hash = routeToHash(next)
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

  const leadStory = seasonStories[0]

  return (
    <div className="public-site">
      <FlagRippleDefs />
      <section className="hero" id="home">
        <img className="hero-photo" src="/assets/ccl-hero.png" alt="A floodlit CCL Cup football match" />
        <div className="hero-fade" />
        <header className="public-header content-width">
          <button className="brand-button" onClick={() => scrollTo('home')}>
            <Brand />
          </button>
          <nav className={menuOpen ? 'public-nav is-open' : 'public-nav'} aria-label="Main navigation">
            {nav.map((item, index) => (
              <button
                className={index === 0 ? 'active' : ''}
                key={item}
                onClick={() => scrollTo(item.toLowerCase())}
              >
                {item}
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
              {activeSeason ? `${activeSeason.year} ${activeSeason.name}` : 'Season'}
              <ChevronDown size={18} />
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

        <div className="hero-content content-width">
          <div className="hero-copy">
            <h1>
              The city
              <br />
              plays here.
            </h1>
            <p>Fixtures, live match stories, and every decisive moment from the CCL Cup.</p>
            <div className="hero-actions">
              <button className="button button-primary" onClick={() => scrollTo('fixtures')}>
                View fixtures <ArrowRight size={19} />
              </button>
              <button className="text-link" onClick={() => scrollTo('teams')}>
                Explore squads <ArrowRight size={18} />
              </button>
            </div>
          </div>

          {nextMatch && (
            <div
              className="featured-match clickable-card"
              aria-label="Next match"
              onClick={() => openDetail({ kind: 'match', id: nextMatch.id })}
              role="button"
              tabIndex={0}
            >
              <div className="match-label">
                {nextMatch.matchStatus === 'live' ? (
                  nextMatch.streamUrl ? (
                    // The badge only becomes a link when there is somewhere to
                    // go. stopPropagation keeps the card's own click from
                    // opening the modal underneath it.
                    <a
                      className="live-stream-link"
                      href={nextMatch.streamUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <span className="live-dot" aria-hidden="true" />
                      LIVE — WATCH NOW
                      <ArrowRight size={15} />
                    </a>
                  ) : (
                    <span className="live-flag">
                      <span className="live-dot" aria-hidden="true" />
                      LIVE MATCH
                    </span>
                  )
                ) : (
                  'NEXT FIXTURE'
                )}
              </div>
              <div className="match-versus">
                <span>
                  <TeamMark
                    name={nextMatch.home}
                    color={teamLookup.get(nextMatch.home)?.color}
                    secondaryColor={teamLookup.get(nextMatch.home)?.secondaryColor}
                    logoUrl={teamLookup.get(nextMatch.home)?.logoUrl}
                    countryCode={teamLookup.get(nextMatch.home)?.countryCode}
                  />
                  <strong>{nextMatch.home}</strong>
                </span>
                <b>
                  {nextMatch.homeScore != null && nextMatch.awayScore != null
                    ? `${nextMatch.homeScore} - ${nextMatch.awayScore}`
                    : 'VS'}
                </b>
                <span>
                  <strong>{nextMatch.away}</strong>
                  <TeamMark
                    name={nextMatch.away}
                    color={teamLookup.get(nextMatch.away)?.color}
                    secondaryColor={teamLookup.get(nextMatch.away)?.secondaryColor}
                    logoUrl={teamLookup.get(nextMatch.away)?.logoUrl}
                    countryCode={teamLookup.get(nextMatch.away)?.countryCode}
                  />
                </span>
              </div>
              <div className="match-meta">
                <span>
                  <CalendarDays size={17} />
                  {nextMatch.date.toUpperCase()} · {nextMatch.time}
                </span>
                <span>
                  <MapPin size={17} />
                  {nextMatch.venue}
                </span>
                <span className="details-hint">
                  Details <ArrowRight size={16} />
                </span>
              </div>
            </div>
          )}

        </div>
      </section>

      <main>
        {/* Results — real match cards rather than the old fixed-height rail */}
        <section className="results-section content-width" id="results">
          <div className="section-title-row">
            <h2>Results</h2>
            <span className="hint-label">
              {completedOrLiveMatches.length} played{activeSeason ? ` · ${activeSeason.year} ${activeSeason.name}` : ''}
            </span>
          </div>

          {completedOrLiveMatches.length === 0 ? (
            <p className="standings-note">No matches have been played in this season yet.</p>
          ) : (
            <div className="result-grid">
              {completedOrLiveMatches.map((m) => (
                <MatchResultCard
                  key={m.id}
                  match={m}
                  homeTeam={teamLookup.get(m.home)}
                  awayTeam={teamLookup.get(m.away)}
                  onOpen={() => openDetail({ kind: 'match', id: m.id })}
                />
              ))}
            </div>
          )}
        </section>

        {/* News & stories */}
        <section className="stories content-width" id="news">
          <div className="section-title-row">
            <h2>Latest stories</h2>
            {leadStory && (
              <button className="text-link" onClick={() => openDetail({ kind: 'story', id: leadStory.id })}>
                Read top story <ArrowRight size={18} />
              </button>
            )}
          </div>

          {seasonStories.length === 0 && (
            <p className="standings-note">
              No stories have been published for this season yet.
            </p>
          )}

          {seasonStories.length > 0 && (
            <StoryCarousel
              stories={seasonStories}
              onOpen={(story) => openDetail({ kind: 'story', id: story.id })}
            />
          )}

          <div className="story-list">
            {seasonStories.slice(1, 4).map((story, index) => (
              <button
                className="story-row"
                key={story.id}
                onClick={() => openDetail({ kind: 'story', id: story.id })}
              >
                <span className={`story-thumb story-thumb-${(index % 3) + 1}`} />
                <div className="story-row-info">
                  <strong>{story.title}</strong>
                  {story.summary && <span className="story-row-summary">{story.summary}</span>}
                </div>
                <ArrowRight />
              </button>
            ))}
          </div>
        </section>

        {/* Standings & next fixtures */}
        <section className="data-band" id="standings">
          <div className="content-width data-grid">
            <div className="standings-wrap">
              <div className="section-head-with-action">
                <h2>{standingsGroups.length > 1 ? 'Group Standings' : 'League Table'}</h2>
                <span className="hint-label">Click a club to view squad</span>
              </div>
              {standingsGroups.map((group) => (
              <div className="standings-group" key={group.groupId}>
              {standingsGroups.length > 1 ? <h3 className="standings-group-title">{group.groupName}</h3> : null}
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>POS</th>
                      <th>TEAM</th>
                      <th>P</th>
                      <th>W</th>
                      <th>D</th>
                      <th>L</th>
                      <th>GF</th>
                      <th>GA</th>
                      <th>GD</th>
                      <th>PTS</th>
                      <th className="form-column">FORM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row) => {
                      const country = getCountry(row.countryCode)
                      const team = teamById.get(row.teamId)
                      return (
                        <tr
                          key={row.teamId}
                          className="clickable-row"
                          onClick={() => team && openDetail({ kind: 'team', id: team.id })}
                          title="Click to view team roster"
                        >
                          <td>{row.position}</td>
                          <td>
                            <span className="team-cell">
                              <TeamMark
                                name={row.teamName}
                                color={row.color}
                                secondaryColor={team?.secondaryColor}
                                logoUrl={row.logoUrl}
                                countryCode={row.countryCode}
                              />
                              <div className="team-name-cell">
                                <strong>{row.teamName}</strong>
                                <span className="team-flag-country" title={country.name}>{country.flag}</span>
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
                          <td className="form-column">
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
                    })}
                  </tbody>
                </table>
              </div>
              </div>
              ))}
              {seasonTeams.length === 0 ? (
                <p className="standings-note">
                  No clubs are registered for this season, so there is no table to show yet.
                </p>
              ) : !hasResults ? (
                <p className="standings-note">
                  No results have been entered yet — the table updates automatically as matches are completed.
                </p>
              ) : null}
            </div>

            <div className="fixtures-wrap" id="fixtures">
              <h2>Next fixtures</h2>
              {upcomingFixtures.length === 0 && (
                <p className="standings-note">No fixtures are scheduled for this season yet.</p>
              )}
              <div className="fixtures-list">
                {upcomingFixtures.map((match) => {
                  const homeTeam = teamLookup.get(match.home)
                  const awayTeam = teamLookup.get(match.away)
                  return (
                    <div
                      className="fixture-row clickable"
                      key={match.id}
                      onClick={() => openDetail({ kind: 'match', id: match.id })}
                      title="Click to view match info"
                    >
                      <time>{match.date.toUpperCase()}</time>
                      <span className="fixture-team">
                        <TeamMark
                          name={match.home}
                          color={homeTeam?.color}
                          secondaryColor={homeTeam?.secondaryColor}
                          logoUrl={homeTeam?.logoUrl}
                          size="sm"
                        />
                        <strong>{match.home}</strong>
                      </span>
                      <b>
                        {match.homeScore != null && match.awayScore != null
                          ? `${match.homeScore} : ${match.awayScore}`
                          : match.time}
                      </b>
                      <span className="fixture-team away">
                        <strong>{match.away}</strong>
                        <TeamMark
                          name={match.away}
                          color={awayTeam?.color}
                          secondaryColor={awayTeam?.secondaryColor}
                          logoUrl={awayTeam?.logoUrl}
                          size="sm"
                        />
                      </span>
                      <span>{match.venue}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Participating clubs */}
        <section className="participants content-width" id="teams">
          <div className="section-title-row">
            <h2>Participating clubs</h2>
            <span className="hint-label">
              {participants.length} {participants.length === 1 ? 'club' : 'clubs'}
              {activeSeason ? ` · ${activeSeason.year} ${activeSeason.name}` : ''}
            </span>
          </div>

          {participants.length === 0 ? (
            <p className="standings-note">No clubs have been registered for this season yet.</p>
          ) : (
            <div className="participant-grid">
              {participants.map((team) => {
                const country = getCountry(team.countryCode)
                const squadSize = playersByTeamId.get(team.id) ?? 0
                return (
                  <button
                    className="participant-card"
                    key={team.id}
                    onClick={() => openDetail({ kind: 'team', id: team.id })}
                    title={`View the ${team.name} squad`}
                  >
                    <span className="participant-flag" title={country.name}>
                      {country.flag}
                    </span>
                    <TeamMark
                      name={team.name}
                      color={team.color}
                      secondaryColor={team.secondaryColor}
                      logoUrl={team.logoUrl}
                      countryCode={team.countryCode}
                      size="lg"
                    />
                    <strong className="participant-name">{team.name}</strong>
                    <span className="participant-country">{country.name}</span>
                    <span className="participant-meta">
                      <span>{team.groupName ?? 'Group A'}</span>
                      <span>
                        {squadSize} {squadSize === 1 ? 'player' : 'players'}
                      </span>
                    </span>
                    {team.managerName ? (
                      <span className="participant-manager">Manager · {team.managerName}</span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          )}
        </section>

        {/* Top scorers */}
        <section className="scorers-section content-width" id="scorers">
          <div className="section-title-row">
            <h2>Top scorers</h2>
            <span className="hint-label">Derived from the match event log</span>
          </div>

          {topScorers.length === 0 ? (
            <p className="standings-note">
              No goals have been recorded yet — this list builds itself as match events are logged.
            </p>
          ) : (
            <ol className="scorer-list">
              {topScorers.map((line, index) => {
                const team = teamLookup.get(line.teamName)
                return (
                  <li className="scorer-row" key={`${line.playerName}-${line.teamName}`}>
                    <span className="scorer-rank">{index + 1}</span>
                    <TeamMark
                      name={line.teamName}
                      color={team?.color}
                      secondaryColor={team?.secondaryColor}
                      logoUrl={team?.logoUrl}
                      size="sm"
                    />
                    <span className="scorer-identity">
                      <strong>{line.playerName}</strong>
                      <small>{line.teamName}</small>
                    </span>
                    <span className="scorer-cards">
                      {line.yellowCards > 0 ? <span className="card-tally yellow">{line.yellowCards}</span> : null}
                      {line.redCards > 0 ? <span className="card-tally red">{line.redCards}</span> : null}
                    </span>
                    <span className="scorer-goals">
                      <Goal size={16} />
                      <b>{line.goals}</b>
                    </span>
                  </li>
                )
              })}
            </ol>
          )}

          {topAssists.length > 0 && (
            <div className="assists-block">
              <h3 className="assists-title">Most assists</h3>
              <ol className="assist-list">
                {topAssists.map((line) => (
                  <li key={`${line.playerName}-${line.teamName}`}>
                    <span className="assist-name">
                      <strong>{line.playerName}</strong>
                      <small>{line.teamName}</small>
                    </span>
                    <b>{line.assists}</b>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>

        {/* Media Highlights */}
        {seasonMedia.length > 0 && (
          <section className="media-section content-width" id="media">
            <div className="section-title-row">
              <h2>Match highlights &amp; media</h2>
              <span className="hint-label">
                {seasonMedia.length} item{seasonMedia.length === 1 ? '' : 's'}
              </span>
            </div>
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

        {/* About */}
        <section className="about-section" id="about">
          <div className="content-width about-grid">
            <div className="about-lead">
              <span className="eyebrow">About the Cup</span>
              <h2>{SITE_CONFIG.about.intro}</h2>
              <p>{SITE_CONFIG.about.history}</p>
              <p className="about-vision">{SITE_CONFIG.about.vision}</p>
            </div>

            <div className="about-panels">
              <div className="about-panel">
                <h3>
                  <Shield size={17} /> Competition rules
                </h3>
                <ul>
                  {SITE_CONFIG.about.rules.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
              </div>

              <div className="about-panel">
                <h3>
                  <MapPin size={17} /> Venues &amp; kick-off
                </h3>
                <p>{SITE_CONFIG.about.venueNote}</p>
                {activeSeason ? (
                  <p className="about-host">
                    Host city this season: <strong>{activeSeason.city}</strong>
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        {/* Fan feedback */}
        <CommentsSection />

        {/* Sponsors */}
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
            <button onClick={() => scrollTo('about')}>About the Cup</button>
            <button onClick={() => scrollTo('teams')}>Squads &amp; Clubs</button>
            <button onClick={() => scrollTo('fixtures')}>Schedule &amp; Fixtures</button>
            <button onClick={() => scrollTo('scorers')}>Top Scorers</button>
            <button onClick={() => scrollTo('news')}>Newsroom</button>
            <button onClick={onAdmin}>Staff login</button>
          </nav>

          <SocialLinks />

          <small>© 2026 Corporate Champions League. Built for competition and community.</small>
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
 * Until the moderation module exists, submitted comments are visible to staff
 * in the database and nowhere else, which is the intended behaviour.
 * ------------------------------------------------------------------ */

function CommentsSection() {
  const [comments, setComments] = useState<Comment[]>([])
  const [authorName, setAuthorName] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

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
      await commentsRepository.submit({ authorName, body })
      setAuthorName('')
      setBody('')
      setSent(true)
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
        <span className="hint-label">Comments are reviewed before they appear</span>
      </div>

      <div className="comments-grid">
        <form className="comment-form" onSubmit={submit}>
          {sent ? (
            <div className="comment-sent">
              <Check size={20} />
              <div>
                <strong>Thanks — your comment has been sent for review.</strong>
                <span>It will appear here once a moderator approves it.</span>
              </div>
              <button type="button" className="text-link" onClick={() => setSent(false)}>
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

/* ------------------------------------------------------------------ *
 * Story carousel
 *
 * Each story slides in from the right, holds, then fades out as the next one
 * arrives. It advances on its own but stops the moment someone is interacting
 * with it — hovering, or tabbing to a control inside it — because a panel that
 * changes under the cursor while you are reading is worse than no rotation.
 *
 * Under `prefers-reduced-motion` the rotation does not start at all and the
 * slide becomes a plain swap: the arrows and dots still work, so nothing is
 * unreachable, it simply never moves by itself.
 * ------------------------------------------------------------------ */

const STORY_DWELL_MS = 6000

function StoryCarousel({ stories, onOpen }: { stories: Story[]; onOpen: (story: Story) => void }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = stories.length

  // Read once on mount rather than at module load, so it reflects the visitor's
  // setting rather than whoever's machine built the bundle.
  const [reducedMotion, setReducedMotion] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReducedMotion(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  // A story removed by a season switch must not leave the index past the end.
  useEffect(() => { setIndex((i) => (i >= count ? 0 : i)) }, [count])

  useEffect(() => {
    if (paused || reducedMotion || count < 2) return
    const timer = window.setTimeout(() => setIndex((i) => (i + 1) % count), STORY_DWELL_MS)
    return () => window.clearTimeout(timer)
  }, [index, paused, reducedMotion, count])

  if (count === 0) return null
  const go = (next: number) => setIndex(((next % count) + count) % count)

  return (
    <div
      className="story-carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Latest stories"
    >
      <div className="story-stage">
        {stories.map((story, i) => (
          <article
            key={story.id}
            className={`story-slide${i === index ? ' is-current' : ''}`}
            aria-hidden={i !== index}
            // Only the visible slide is reachable by keyboard or screen reader.
            inert={i !== index}
          >
            <button className="story-slide-inner" onClick={() => onOpen(story)}>
              <img
                src={story.coverImageUrl || '/assets/ccl-celebration.png'}
                alt=""
                loading={i === 0 ? 'eager' : 'lazy'}
              />
              <div className="story-slide-body">
                <h3>{story.title}</h3>
                <div className="story-meta">
                  {story.publishedAt ?? ''}
                  {story.category && <span>{story.category.replace('_', ' ').toUpperCase()}</span>}
                </div>
                {story.summary && <p>{story.summary}</p>}
                <span className="read-more-text">
                  Read full article <ArrowRight size={16} />
                </span>
              </div>
            </button>
          </article>
        ))}
      </div>

      {count > 1 && (
        <div className="story-carousel-controls">
          <button className="carousel-arrow" onClick={() => go(index - 1)} aria-label="Previous story">
            <ArrowRight size={16} style={{ transform: 'rotate(180deg)' }} />
          </button>
          <div className="carousel-dots" role="tablist">
            {stories.map((story, i) => (
              <button
                key={story.id}
                role="tab"
                aria-selected={i === index}
                aria-label={`Story ${i + 1} of ${count}`}
                className={`carousel-dot${i === index ? ' is-current' : ''}`}
                onClick={() => go(i)}
              />
            ))}
          </div>
          <button className="carousel-arrow" onClick={() => go(index + 1)} aria-label="Next story">
            <ArrowRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Match result card
 *
 * Replaces a rail that was absolutely positioned at a hard-coded `top: 727px`
 * with a fixed 72px height, and held every played match in that one strip —
 * so with a full fixture list most results were simply clipped out of sight,
 * and below 700px the whole thing was display:none.
 *
 * The shape follows the reference site: each side shows crest, club and
 * country, the score sits between them with the winner carrying the emphasis,
 * and kick-off and venue sit underneath.
 * ------------------------------------------------------------------ */

function MatchResultCard({
  match,
  homeTeam,
  awayTeam,
  onOpen,
}: {
  match: Match
  homeTeam?: Team
  awayTeam?: Team
  onOpen: () => void
}) {
  const home = match.homeScore ?? 0
  const away = match.awayScore ?? 0
  const played = match.homeScore != null && match.awayScore != null
  const live = match.matchStatus === 'live'

  // Only a finished match has a winner to emphasise; a live score is still moving.
  const homeWon = played && !live && home > away
  const awayWon = played && !live && away > home

  return (
    <article
      className="result-card clickable"
      onClick={onOpen}
      title={`${match.home} v ${match.away} — view the match summary`}
    >
      {live && (
        <span className="result-live">
          <span className="live-dot" /> LIVE
        </span>
      )}

      <div className="result-side">
        <TeamMark
          name={match.home}
          color={homeTeam?.color}
          secondaryColor={homeTeam?.secondaryColor}
          logoUrl={homeTeam?.logoUrl}
          size="md"
        />
        <strong>{match.home}</strong>
        {homeTeam && <small>{getCountry(homeTeam.countryCode).name}</small>}
      </div>

      <div className="result-middle">
        <div className="result-score">
          <span className={homeWon ? 'won' : awayWon ? 'lost' : ''}>{played ? home : '–'}</span>
          <i>–</i>
          <span className={awayWon ? 'won' : homeWon ? 'lost' : ''}>{played ? away : '–'}</span>
        </div>
        <small className="result-meta">
          {match.date}
          {match.time ? ` · ${match.time}` : ''}
        </small>
        {match.venue && <small className="result-meta">{match.venue}</small>}
      </div>

      <div className="result-side away">
        <TeamMark
          name={match.away}
          color={awayTeam?.color}
          secondaryColor={awayTeam?.secondaryColor}
          logoUrl={awayTeam?.logoUrl}
          size="md"
        />
        <strong>{match.away}</strong>
        {awayTeam && <small>{getCountry(awayTeam.countryCode).name}</small>}
      </div>
    </article>
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

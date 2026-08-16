import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  Clock3,
  Flame,
  MapPin,
  Menu,
  Play,
  Shield,
  User,
  Users,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { getCountry } from '../lib/countries'
import type { Match, Player, Story, Team } from '../types'
import { Brand } from './Brand'
import { Modal } from './Modal'
import { TeamMark } from './TeamMark'

type Props = {
  teams: Team[]
  players: Player[]
  matches: Match[]
  stories: Story[]
  onAdmin: () => void
}

const nav = ['Home', 'Fixtures', 'Standings', 'Teams', 'News', 'Media']

export function PublicSite({ teams, players, matches, stories, onAdmin }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeMatch, setActiveMatch] = useState<Match | null>(null)
  const [activeStory, setActiveStory] = useState<Story | null>(null)
  const [selectedTeamRoster, setSelectedTeamRoster] = useState<Team | null>(null)

  const nextMatch = useMemo(
    () => matches.find((m) => m.matchStatus === 'scheduled' || m.matchStatus === 'live') ?? matches[0],
    [matches],
  )

  const completedOrLiveMatches = useMemo(
    () => matches.filter((m) => m.matchStatus === 'completed' || m.matchStatus === 'live'),
    [matches],
  )

  const teamLookup = useMemo(() => {
    return new Map(teams.map((t) => [t.name, t]))
  }, [teams])

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    setMenuOpen(false)
  }

  const leadStory = stories[0]

  return (
    <div className="public-site">
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
          <button className="season-button">
            2026 Season <ChevronDown size={18} />
          </button>
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
              onClick={() => setActiveMatch(nextMatch)}
              role="button"
              tabIndex={0}
            >
              <div className="match-label">
                {nextMatch.matchStatus === 'live' ? '🔴 LIVE MATCH' : 'NEXT FIXTURE'}
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

          {/* Results rail */}
          <div className="result-rail" id="fixtures">
            {completedOrLiveMatches.length > 0 ? (
              completedOrLiveMatches.map((m) => {
                const homeTeam = teamLookup.get(m.home)
                const awayTeam = teamLookup.get(m.away)
                return (
                  <div
                    key={m.id}
                    className="rail-item clickable"
                    onClick={() => setActiveMatch(m)}
                    title="Click to view match summary & timeline"
                  >
                    <TeamMark
                      name={m.home}
                      color={homeTeam?.color}
                      secondaryColor={homeTeam?.secondaryColor}
                      logoUrl={homeTeam?.logoUrl}
                      size="sm"
                    />
                    <strong>{m.home}</strong>
                    <em>{m.homeScore ?? 0}</em>
                    <span>—</span>
                    <em className="muted-score">{m.awayScore ?? 0}</em>
                    <strong>{m.away}</strong>
                    <TeamMark
                      name={m.away}
                      color={awayTeam?.color}
                      secondaryColor={awayTeam?.secondaryColor}
                      logoUrl={awayTeam?.logoUrl}
                      size="sm"
                    />
                  </div>
                )
              })
            ) : (
              <div>
                <span>First matches kicking off this week</span>
              </div>
            )}
          </div>
        </div>
      </section>

      <main>
        {/* News & stories */}
        <section className="stories content-width" id="news">
          <div className="section-title-row">
            <h2>Latest stories</h2>
            <button className="text-link" onClick={() => leadStory && setActiveStory(leadStory)}>
              Read top story <ArrowRight size={18} />
            </button>
          </div>

          {leadStory && (
            <article
              className="lead-story clickable-card"
              onClick={() => setActiveStory(leadStory)}
              role="button"
              tabIndex={0}
            >
              <img
                src={leadStory.coverImageUrl || '/assets/ccl-celebration.png'}
                alt={leadStory.title}
              />
              <div>
                <h3>{leadStory.title}</h3>
                <div className="story-meta">
                  {leadStory.publishedAt ?? '15 AUG 2026'}{' '}
                  <span>{leadStory.category?.replace('_', ' ').toUpperCase() ?? 'MATCH REPORT'}</span>
                </div>
                <p>
                  {leadStory.summary ??
                    'In a tense, end-to-end clash, a stoppage-time strike sealed all three points and a place in the last eight.'}
                </p>
                <span className="read-more-text">
                  Read full article <ArrowRight size={16} />
                </span>
              </div>
            </article>
          )}

          <div className="story-list">
            {stories.slice(1, 4).map((story, index) => (
              <button
                className="story-row"
                key={story.id}
                onClick={() => setActiveStory(story)}
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
            <div className="standings-wrap" id="teams">
              <div className="section-head-with-action">
                <h2>Champions Cup Standings</h2>
                <span className="hint-label">Click a club to view squad</span>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>POS</th>
                    <th>TEAM</th>
                    <th>P</th>
                    <th>GD</th>
                    <th>PTS</th>
                  </tr>
                </thead>
                <tbody>
                  {teams
                    .slice()
                    .sort((a, b) => b.points - a.points)
                    .map((team, index) => {
                      const country = getCountry(team.countryCode)
                      return (
                        <tr
                          key={team.id}
                          className="clickable-row"
                          onClick={() => setSelectedTeamRoster(team)}
                          title="Click to view team roster"
                        >
                          <td>{index + 1}</td>
                          <td>
                            <span className="team-cell">
                              <TeamMark
                                name={team.name}
                                color={team.color}
                                secondaryColor={team.secondaryColor}
                                logoUrl={team.logoUrl}
                                countryCode={team.countryCode}
                              />
                              <div className="team-name-cell">
                                <strong>{team.name}</strong>
                                <span className="team-flag-country" title={country.name}>{country.flag}</span>
                              </div>
                            </span>
                          </td>
                          <td>{team.played}</td>
                          <td>{team.goalDifference > 0 ? `+${team.goalDifference}` : team.goalDifference}</td>
                          <td>
                            <strong>{team.points}</strong>
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>

            <div className="fixtures-wrap" id="fixtures">
              <h2>Next fixtures</h2>
              <div className="fixtures-list">
                {matches.slice(0, 4).map((match) => {
                  const homeTeam = teamLookup.get(match.home)
                  const awayTeam = teamLookup.get(match.away)
                  return (
                    <div
                      className="fixture-row clickable"
                      key={match.id}
                      onClick={() => setActiveMatch(match)}
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

        {/* Media Highlights */}
        <section className="media-section content-width" id="media">
          <div className="section-title-row">
            <h2>Match highlights & media</h2>
            <button className="text-link">
              View all video <ArrowRight size={18} />
            </button>
          </div>
          <div className="media-rail">
            <div className="media-card media-card-1 clickable-card">
              <span className="media-play">
                <Play />
              </span>
              <span className="video-title">Finals Highlights: CCL Cup Opening Week</span>
            </div>
            <div className="media-card media-card-2 clickable-card">
              <span className="media-play">
                <Play />
              </span>
              <span className="video-title">Top 5 Goals of the Tournament</span>
            </div>
            <div className="media-card media-card-3 clickable-card">
              <span className="media-play">
                <Play />
              </span>
              <span className="video-title">Manager Post-Match Press Conference</span>
            </div>
          </div>
        </section>
      </main>

      <footer className="public-footer">
        <div className="content-width">
          <Brand />
          <nav aria-label="Footer navigation">
            <button onClick={() => scrollTo('home')}>About the Cup</button>
            <button onClick={() => scrollTo('teams')}>Squads & Clubs</button>
            <button onClick={() => scrollTo('fixtures')}>Schedule & Fixtures</button>
            <button onClick={() => scrollTo('news')}>Newsroom</button>
            <button onClick={onAdmin}>Staff login</button>
          </nav>
          <small>© 2026 Corporate Champions League. Built for competition and community.</small>
        </div>
      </footer>

      {/* Interactive Match Details Modal */}
      {activeMatch && (
        <MatchDetailsModal
          match={activeMatch}
          players={players}
          teams={teams}
          onClose={() => setActiveMatch(null)}
        />
      )}

      {/* Interactive Story Reader Modal */}
      {activeStory && <StoryReaderModal story={activeStory} onClose={() => setActiveStory(null)} />}

      {/* Interactive Team Roster Modal */}
      {selectedTeamRoster && (
        <TeamRosterModal
          team={selectedTeamRoster}
          players={players.filter((p) => p.teamId === selectedTeamRoster.id || p.teamName === selectedTeamRoster.name)}
          onClose={() => setSelectedTeamRoster(null)}
        />
      )}
    </div>
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
                    {ev.eventType === 'penalty_scored' && '🎯'}
                    {ev.eventType === 'yellow_card' && '🟨'}
                    {ev.eventType === 'red_card' && '🟥'}
                    {ev.eventType === 'substitution' && '🔄'}
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

function TeamRosterModal({
  team,
  players,
  onClose,
}: {
  team: Team
  players: Player[]
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
                        {(p.activeSeasons && p.activeSeasons.length > 0 ? p.activeSeasons : ['2026 - Summer League']).map((s) => (
                          <span key={s} className="season-pill">{s}</span>
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

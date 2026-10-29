import type { Match } from '../types'
import { useKickoffCountdown } from '../lib/useKickoffCountdown'
import { youtubeVideoId } from '../lib/broadcast'

export function MatchCountdown({ match }: { match: Match }) {
  const countdown = useKickoffCountdown(match)
  const live = match.matchStatus === 'live' || countdown?.due
  const videoId = youtubeVideoId(match.streamUrl)
  if (live) return <section className="match-countdown" aria-label="Live match broadcast">
    <div role="status"><strong className="status-pill live">Live</strong><p>{match.home} vs {match.away}</p></div>
    {videoId ? <a className="watch-live-button" href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noopener noreferrer">Watch live on YouTube</a>
      : <p>Broadcast link coming soon.</p>}
  </section>
  if (!countdown) return null
  return <section className="match-countdown" aria-label="Kickoff countdown">
    <div><strong>Kickoff in</strong>
      <p>Counting down to the first whistle.</p>
    </div>
    {!countdown.due && <div className="match-countdown-digits" role="timer" aria-live="off">
      {Object.entries({ days: countdown.days, hours: countdown.hours, minutes: countdown.minutes, seconds: countdown.seconds }).map(([unit, value]) =>
        <span key={unit}><b>{String(value).padStart(2, '0')}</b><small>{unit}</small></span>)}
    </div>}
    <time dateTime={match.kickoffAt}>{new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Istanbul' }).format(new Date(match.kickoffAt!))} (Istanbul)</time>
  </section>
}

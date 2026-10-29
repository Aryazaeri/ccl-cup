import { ExternalLink, Play, Radio } from 'lucide-react'
import { useId, useState } from 'react'
import type { Match } from '../types'
import { youtubeEmbedUrl, youtubeVideoId } from '../lib/broadcast'

const focusPlayer = (frame: HTMLIFrameElement | null) => frame?.focus({ preventScroll: true })

export function MatchBroadcast({ match }: { match: Match }) {
  const [playing, setPlaying] = useState(false)
  const heading = useId()
  const id = youtubeVideoId(match.streamUrl)
  if (!id) return null
  const label = match.matchStatus === 'live' ? 'Live broadcast' : match.matchStatus === 'completed' ? 'Match replay'
    : match.matchStatus === 'postponed' ? 'Postponed broadcast' : match.matchStatus === 'stopped' ? 'Broadcast paused' : 'Scheduled broadcast'
  const title = `${match.home} vs ${match.away}`
  return <section className="pg-broadcast" aria-labelledby={heading}>
    <div className="pg-broadcast-copy">
      <span className="pg-broadcast-label"><Radio size={15} aria-hidden="true" />{label}</span>
      <h2 id={heading}>{title}</h2>
      <p>{match.date} · {match.time}{match.venue && match.venue !== '—' ? ` · ${match.venue}` : ''}</p>
      {match.matchStatus === 'scheduled' && <p>Watch here before kickoff. Scheduled streams begin when the broadcaster goes live.</p>}
      <a href={`https://www.youtube.com/watch?v=${id}`} target="_blank" rel="noopener noreferrer">Open on YouTube <ExternalLink size={13} aria-hidden="true" /></a>
    </div>
    <div className="pg-broadcast-screen">
      {playing ? <iframe ref={focusPlayer} title={`YouTube broadcast: ${title}`} src={youtubeEmbedUrl(id)}
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin" />
        : <button type="button" className="pg-broadcast-play" aria-label={`Play broadcast for ${title}`} onClick={() => setPlaying(true)}>
          <span className="pg-broadcast-play-icon"><Play size={28} aria-hidden="true" /></span>
          <strong>{match.matchStatus === 'completed' ? 'Play replay' : 'Play broadcast'}</strong>
          <span>Watch here on ICC</span>
        </button>}
    </div>
  </section>
}

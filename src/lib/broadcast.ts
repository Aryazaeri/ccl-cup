import type { Match } from '../types'

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com', 'youtu.be', 'www.youtu.be'])
const VIDEO_ID = /^[\w-]{11}$/

export function youtubeVideoId(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !YOUTUBE_HOSTS.has(url.hostname)) return undefined
    const parts = url.pathname.split('/').filter(Boolean)
    const id = url.hostname.endsWith('youtu.be') ? parts[0]
      : parts[0] === 'watch' ? url.searchParams.get('v')
      : ['live', 'embed', 'shorts'].includes(parts[0]) ? parts[1] : undefined
    return id && VIDEO_ID.test(id) ? id : undefined
  } catch { return undefined }
}

export function youtubeEmbedUrl(id: string): string {
  if (!VIDEO_ID.test(id)) throw new Error('Invalid YouTube video identity')
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0`
}

export function broadcastUrlError(value: string): string {
  if (!value.trim()) return ''
  try {
    const url = new URL(value)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return 'Use an http:// or https:// broadcast link without a username or password.'
    if (YOUTUBE_HOSTS.has(url.hostname) && !youtubeVideoId(value)) return 'Use a link to a specific YouTube video or scheduled live broadcast, rather than a channel or playlist.'
    return ''
  } catch { return 'Enter a complete broadcast URL, including https://.' }
}

/** A live broadcast takes priority; otherwise promote the next scheduled one. */
export function featuredBroadcast(matches: Match[]): Match | undefined {
  const eligible = matches.filter((m) => youtubeVideoId(m.streamUrl))
  const ordered = [...eligible].sort((a, b) => (a.kickoffAt ?? '').localeCompare(b.kickoffAt ?? '') || a.id - b.id)
  return ordered.find((m) => m.matchStatus === 'live') ?? ordered.find((m) => m.matchStatus === 'scheduled')
}

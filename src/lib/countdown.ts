import type { Match } from '../types'

/** Require a timezone so an archive's display-only date never becomes a kickoff. */
export function kickoffCountdown(match: Pick<Match, 'matchStatus' | 'kickoffAt'>, now: number) {
  if (match.matchStatus !== 'scheduled' || !match.kickoffAt || !/(Z|[+-]\d{2}:\d{2})$/.test(match.kickoffAt)) return null
  const kickoff = Date.parse(match.kickoffAt)
  if (!Number.isFinite(kickoff)) return null
  const remaining = Math.max(0, Math.ceil((kickoff - now) / 1000))
  return {
    days: Math.floor(remaining / 86400),
    hours: Math.floor(remaining / 3600) % 24,
    minutes: Math.floor(remaining / 60) % 60,
    seconds: remaining % 60,
    due: remaining === 0,
  }
}

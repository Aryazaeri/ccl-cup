import type { Match } from '../types'

/** Require a timezone so an archive's display-only date never becomes a kickoff. */
export function kickoffTimestamp(kickoffAt?: string): number | null {
  if (!kickoffAt || !/(Z|[+-]\d{2}:\d{2})$/.test(kickoffAt)) return null
  const value = Date.parse(kickoffAt)
  return Number.isFinite(value) ? value : null
}

export function fixtureSchedule(matches: Match[], now: number) {
  const scheduled = matches.filter((match) => match.matchStatus === 'scheduled')
    .sort((a, b) => (kickoffTimestamp(a.kickoffAt) ?? Infinity) - (kickoffTimestamp(b.kickoffAt) ?? Infinity) || a.id - b.id)
  return {
    upcoming: scheduled.filter((match) => (kickoffTimestamp(match.kickoffAt) ?? Infinity) > now),
    awaitingResult: scheduled.filter((match) => (kickoffTimestamp(match.kickoffAt) ?? Infinity) <= now),
    postponed: matches.filter((match) => match.matchStatus === 'postponed'),
  }
}

export function kickoffCountdown(match: Pick<Match, 'matchStatus' | 'kickoffAt'>, now: number) {
  const kickoff = kickoffTimestamp(match.kickoffAt)
  if (match.matchStatus !== 'scheduled' || kickoff === null) return null
  const remaining = Math.max(0, Math.ceil((kickoff - now) / 1000))
  return {
    days: Math.floor(remaining / 86400),
    hours: Math.floor(remaining / 3600) % 24,
    minutes: Math.floor(remaining / 60) % 60,
    seconds: remaining % 60,
    due: remaining === 0,
  }
}

import { useEffect, useState } from 'react'
import type { Match } from '../types'
import { kickoffTimestamp } from './countdown'

/** Reclassify fixtures at kickoff and when returning to the page. */
export function useFixtureTime(matches: Match[]) {
  const [now, setNow] = useState(Date.now)
  // A refreshed season may introduce fixtures after the previous clock snapshot.
  useEffect(() => {
    const timer = window.setTimeout(() => setNow(Date.now()), 0)
    return () => window.clearTimeout(timer)
  }, [matches])
  useEffect(() => {
    const update = () => setNow(Date.now())
    const next = Math.min(...matches.filter((match) => match.matchStatus === 'scheduled')
      .map((match) => kickoffTimestamp(match.kickoffAt) ?? Infinity).filter((time) => time > now))
    const timer = Number.isFinite(next) ? window.setTimeout(update, Math.min(next - now, 2_147_483_647)) : undefined
    const onVisible = () => { if (document.visibilityState === 'visible') update() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', update)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', update)
    }
  }, [matches, now])
  return now
}

import { useEffect, useState } from 'react'
import type { Match } from '../types'
import { kickoffCountdown } from './countdown'

export function useKickoffCountdown({ matchStatus, kickoffAt }: Pick<Match, 'matchStatus' | 'kickoffAt'>) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const match = { matchStatus, kickoffAt }
    if (!kickoffCountdown(match, Date.now())) return
    const timer = window.setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (kickoffCountdown(match, current)?.due) window.clearInterval(timer)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [matchStatus, kickoffAt])
  return kickoffCountdown({ matchStatus, kickoffAt }, now)
}

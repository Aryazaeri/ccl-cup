import type { LeagueSlot, SeasonLeague, Team } from '../types'

export function generateEmptyLeague(initialPlacedTeams: Team[] = []): SeasonLeague {
  const slots: LeagueSlot[] = initialPlacedTeams.map((t, idx) => ({
    position: idx + 1,
    teamId: t.id,
    teamName: t.name,
    teamLogo: t.logoUrl,
    teamColor: t.color,
    teamCountryCode: t.countryCode,
  }))

  return {
    teamCount: slots.length,
    slots,
  }
}

export function autoSeedLeague(
  teams: Team[],
  randomize: boolean = true,
): SeasonLeague {
  const pool = [...teams]
  if (randomize) {
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
  }

  const slots: LeagueSlot[] = pool.map((t, idx) => ({
    position: idx + 1,
    teamId: t.id,
    teamName: t.name,
    teamLogo: t.logoUrl,
    teamColor: t.color,
    teamCountryCode: t.countryCode,
  }))

  return {
    teamCount: slots.length,
    slots,
  }
}

export function clearLeagueSlots(): SeasonLeague {
  return {
    teamCount: 0,
    slots: [],
  }
}

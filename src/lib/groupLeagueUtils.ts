import type { LeagueSlot, SeasonGroup, SeasonGroupLeague, Team } from '../types'

const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P']

export function generateEmptyGroupLeague(groupCount: number = 4): SeasonGroupLeague {
  const count = Math.max(2, Math.min(16, groupCount || 4))
  const groups: SeasonGroup[] = []

  for (let i = 0; i < count; i++) {
    const letter = GROUP_LETTERS[i] || `${i + 1}`
    groups.push({
      id: `group_${letter.toLowerCase()}`,
      name: `Grup ${letter}`,
      slots: [],
    })
  }

  return {
    groupCount: count,
    groups,
  }
}

export function autoSeedGroupLeague(
  groupCount: number,
  teams: Team[],
  randomize: boolean = true,
): SeasonGroupLeague {
  const count = Math.max(2, Math.min(16, groupCount || 4))
  const pool = [...teams]
  if (randomize) {
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
  }

  const groups: SeasonGroup[] = []
  for (let i = 0; i < count; i++) {
    const letter = GROUP_LETTERS[i] || `${i + 1}`
    groups.push({
      id: `group_${letter.toLowerCase()}`,
      name: `Grup ${letter}`,
      slots: [],
    })
  }

  // Round-robin distribute teams to groups
  pool.forEach((team, index) => {
    const targetGroup = groups[index % count]
    const nextPos = targetGroup.slots.length + 1
    targetGroup.slots.push({
      position: nextPos,
      teamId: team.id,
      teamName: team.name,
      teamLogo: team.logoUrl,
      teamColor: team.color,
      teamCountryCode: team.countryCode,
    })
  })

  return {
    groupCount: count,
    groups,
  }
}

export function clearGroupLeagueSlots(groupCount: number): SeasonGroupLeague {
  return generateEmptyGroupLeague(groupCount)
}

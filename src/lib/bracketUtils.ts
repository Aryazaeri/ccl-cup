import type { BracketMatch, BracketRound, BracketSlot, Team, TournamentBracket } from '../types'

export function generateEmptyBracket(teamCount: number = 8): TournamentBracket {
  const count = [4, 8, 16, 32].includes(teamCount) ? teamCount : 8
  const rounds: BracketRound[] = []

  let currentMatches = count / 2
  let roundIdx = 0

  while (currentMatches >= 1) {
    let roundName = 'Round of 16'
    if (currentMatches === 8) roundName = 'Round of 16'
    else if (currentMatches === 4) roundName = 'Quarter-finals'
    else if (currentMatches === 2) roundName = 'Semi-finals'
    else if (currentMatches === 1) roundName = 'Grand Final'

    const matches: BracketMatch[] = []
    for (let m = 0; m < currentMatches; m++) {
      const matchId = `r${roundIdx}_m${m}`
      matches.push({
        matchId,
        label: `${roundName} #${m + 1}`,
        slot1: {
          slotId: `${matchId}_s1`,
          teamId: null,
        },
        slot2: {
          slotId: `${matchId}_s2`,
          teamId: null,
        },
      })
    }

    rounds.push({
      roundIndex: roundIdx,
      roundName,
      matches,
    })

    currentMatches = Math.floor(currentMatches / 2)
    roundIdx++
  }

  return {
    teamCount: count,
    rounds,
    championSlot: {
      slotId: 'champion_slot',
      teamId: null,
    },
  }
}

export function autoSeedBracket(
  currentBracket: TournamentBracket,
  teams: Team[],
  randomize: boolean = true,
): TournamentBracket {
  const pool = [...teams]
  if (randomize) {
    // Shuffle teams
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
  }

  // Clone bracket
  const updatedBracket: TournamentBracket = JSON.parse(JSON.stringify(currentBracket))
  if (!updatedBracket.rounds || updatedBracket.rounds.length === 0) {
    return updatedBracket
  }

  // Populate first round slots
  const firstRound = updatedBracket.rounds[0]
  let teamIdx = 0

  for (const match of firstRound.matches) {
    const t1 = pool[teamIdx++]
    if (t1) {
      match.slot1 = {
        slotId: match.slot1.slotId,
        teamId: t1.id,
        teamName: t1.name,
        teamColor: t1.color,
        teamLogo: t1.logoUrl,
        teamCountryCode: t1.countryCode,
      }
    } else {
      match.slot1 = { slotId: match.slot1.slotId, teamId: null }
    }

    const t2 = pool[teamIdx++]
    if (t2) {
      match.slot2 = {
        slotId: match.slot2.slotId,
        teamId: t2.id,
        teamName: t2.name,
        teamColor: t2.color,
        teamLogo: t2.logoUrl,
        teamCountryCode: t2.countryCode,
      }
    } else {
      match.slot2 = { slotId: match.slot2.slotId, teamId: null }
    }
  }

  return updatedBracket
}

export function clearBracketSlots(currentBracket: TournamentBracket): TournamentBracket {
  return generateEmptyBracket(currentBracket.teamCount)
}

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

/* ------------------------------------------------------------------ *
 * Progression
 *
 * A winner in round r feeds match floor(m / 2) of round r + 1, taking slot 1
 * when m is even and slot 2 when m is odd. The final round's winner becomes
 * the champion.
 *
 * Only the first round is seeded by hand; every later slot exists purely as
 * the output of an earlier result. So rather than patching forward from the
 * match that changed — which leaves stale teams behind when a result is
 * revised — the whole chain is recomputed from the recorded winners.
 * ------------------------------------------------------------------ */

function emptySlot(slotId: string): BracketSlot {
  return { slotId, teamId: null }
}

/** Carries a winning slot's team into another slot, keeping the target's id. */
function carry(target: BracketSlot, source: BracketSlot): BracketSlot {
  return {
    slotId: target.slotId,
    teamId: source.teamId ?? null,
    teamName: source.teamName,
    teamLogo: source.teamLogo,
    teamColor: source.teamColor,
    teamCountryCode: source.teamCountryCode,
  }
}

function slotById(match: BracketMatch, slotId: string | null | undefined): BracketSlot | null {
  if (!slotId) return null
  if (match.slot1.slotId === slotId) return match.slot1
  if (match.slot2.slotId === slotId) return match.slot2
  return null
}

/**
 * Rebuilds every round after the first from the recorded winners.
 *
 * A winner pointing at a slot that is no longer occupied is dropped, which is
 * what makes revising an earlier result clear the rounds behind it instead of
 * stranding a team that never qualified.
 */
export function recomputeProgression(bracket: TournamentBracket): TournamentBracket {
  const next: TournamentBracket = JSON.parse(JSON.stringify(bracket))
  const rounds = next.rounds ?? []
  if (rounds.length === 0) return next

  // Later rounds are outputs, never inputs — clear them before refilling.
  for (let r = 1; r < rounds.length; r++) {
    for (const match of rounds[r].matches) {
      match.slot1 = emptySlot(match.slot1.slotId)
      match.slot2 = emptySlot(match.slot2.slotId)
    }
  }
  next.championSlot = emptySlot(next.championSlot?.slotId ?? 'champion_slot')

  for (let r = 0; r < rounds.length; r++) {
    const round = rounds[r]

    round.matches.forEach((match, m) => {
      const winning = slotById(match, match.winnerSlotId)

      // The result is only valid while that slot still holds the same team.
      // If an earlier round was revised, a different club now occupies the
      // slot and the recorded result no longer describes anything that
      // happened, so it is dropped along with everything behind it.
      if (!winning || winning.teamId == null || winning.teamId !== match.winnerTeamId) {
        match.winnerSlotId = null
        match.winnerTeamId = null
        return
      }

      const nextRound = rounds[r + 1]
      if (!nextRound) {
        next.championSlot = carry(next.championSlot ?? emptySlot('champion_slot'), winning)
        return
      }

      const target = nextRound.matches[Math.floor(m / 2)]
      if (!target) return
      if (m % 2 === 0) target.slot1 = carry(target.slot1, winning)
      else target.slot2 = carry(target.slot2, winning)
    })
  }

  return next
}

/**
 * Records (or clears) the winner of one match and rebuilds the rounds behind
 * it. Passing the slot that is already the winner clears it, so the same
 * control toggles.
 */
export function setMatchWinner(
  bracket: TournamentBracket,
  matchId: string,
  slotId: string | null,
): TournamentBracket {
  const next: TournamentBracket = JSON.parse(JSON.stringify(bracket))
  for (const round of next.rounds ?? []) {
    for (const match of round.matches) {
      if (match.matchId !== matchId) continue
      if (match.winnerSlotId === slotId) {
        match.winnerSlotId = null
        match.winnerTeamId = null
      } else {
        match.winnerSlotId = slotId
        match.winnerTeamId = slotById(match, slotId)?.teamId ?? null
      }
    }
  }
  return recomputeProgression(next)
}

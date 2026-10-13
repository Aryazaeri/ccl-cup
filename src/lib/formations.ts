import type { PlayerPosition } from '../types'

export type FormationType = '4-3-3' | '4-4-2' | '3-5-2' | '4-2-3-1' | '7v7' | '5v5'

export type FormationSlotConfig = {
  id: string
  roleName: string
  position: PlayerPosition
  top: number // percentage from top (0-100)
  left: number // percentage from left (0-100)
}

export const FORMATIONS: Record<FormationType, { name: string; slots: FormationSlotConfig[] }> = {
  '4-3-3': {
    name: '4-3-3 Attack',
    slots: [
      { id: 'gk', roleName: 'GK', position: 'goalkeeper', top: 86, left: 50 },
      { id: 'lb', roleName: 'LB', position: 'defender', top: 68, left: 16 },
      { id: 'cb1', roleName: 'CB', position: 'defender', top: 72, left: 38 },
      { id: 'cb2', roleName: 'CB', position: 'defender', top: 72, left: 62 },
      { id: 'rb', roleName: 'RB', position: 'defender', top: 68, left: 84 },
      { id: 'cm1', roleName: 'LCM', position: 'midfielder', top: 48, left: 26 },
      { id: 'cm2', roleName: 'CM', position: 'midfielder', top: 52, left: 50 },
      { id: 'cm3', roleName: 'RCM', position: 'midfielder', top: 48, left: 74 },
      { id: 'lw', roleName: 'LW', position: 'forward', top: 22, left: 20 },
      { id: 'st', roleName: 'ST', position: 'forward', top: 16, left: 50 },
      { id: 'rw', roleName: 'RW', position: 'forward', top: 22, left: 80 },
    ],
  },
  '4-4-2': {
    name: '4-4-2 Classic',
    slots: [
      { id: 'gk', roleName: 'GK', position: 'goalkeeper', top: 86, left: 50 },
      { id: 'lb', roleName: 'LB', position: 'defender', top: 68, left: 16 },
      { id: 'cb1', roleName: 'CB', position: 'defender', top: 72, left: 38 },
      { id: 'cb2', roleName: 'CB', position: 'defender', top: 72, left: 62 },
      { id: 'rb', roleName: 'RB', position: 'defender', top: 68, left: 84 },
      { id: 'lm', roleName: 'LM', position: 'midfielder', top: 45, left: 16 },
      { id: 'cm1', roleName: 'CM', position: 'midfielder', top: 48, left: 38 },
      { id: 'cm2', roleName: 'CM', position: 'midfielder', top: 48, left: 62 },
      { id: 'rm', roleName: 'RM', position: 'midfielder', top: 45, left: 84 },
      { id: 'st1', roleName: 'LS', position: 'forward', top: 18, left: 36 },
      { id: 'st2', roleName: 'RS', position: 'forward', top: 18, left: 64 },
    ],
  },
  '3-5-2': {
    name: '3-5-2 Dynamic',
    slots: [
      { id: 'gk', roleName: 'GK', position: 'goalkeeper', top: 86, left: 50 },
      { id: 'cb1', roleName: 'LCB', position: 'defender', top: 72, left: 26 },
      { id: 'cb2', roleName: 'CB', position: 'defender', top: 74, left: 50 },
      { id: 'cb3', roleName: 'RCB', position: 'defender', top: 72, left: 74 },
      { id: 'lwb', roleName: 'LWB', position: 'midfielder', top: 50, left: 12 },
      { id: 'dm', roleName: 'CDM', position: 'midfielder', top: 58, left: 50 },
      { id: 'cm1', roleName: 'CAM', position: 'midfielder', top: 38, left: 38 },
      { id: 'cm2', roleName: 'CAM', position: 'midfielder', top: 38, left: 62 },
      { id: 'rwb', roleName: 'RWB', position: 'midfielder', top: 50, left: 88 },
      { id: 'st1', roleName: 'LS', position: 'forward', top: 16, left: 36 },
      { id: 'st2', roleName: 'RS', position: 'forward', top: 16, left: 64 },
    ],
  },
  '4-2-3-1': {
    name: '4-2-3-1 Tactical',
    slots: [
      { id: 'gk', roleName: 'GK', position: 'goalkeeper', top: 86, left: 50 },
      { id: 'lb', roleName: 'LB', position: 'defender', top: 68, left: 16 },
      { id: 'cb1', roleName: 'CB', position: 'defender', top: 72, left: 38 },
      { id: 'cb2', roleName: 'CB', position: 'defender', top: 72, left: 62 },
      { id: 'rb', roleName: 'RB', position: 'defender', top: 68, left: 84 },
      { id: 'dm1', roleName: 'LDM', position: 'midfielder', top: 54, left: 36 },
      { id: 'dm2', roleName: 'RDM', position: 'midfielder', top: 54, left: 64 },
      { id: 'lam', roleName: 'LAM', position: 'midfielder', top: 36, left: 22 },
      { id: 'cam', roleName: 'CAM', position: 'midfielder', top: 34, left: 50 },
      { id: 'ram', roleName: 'RAM', position: 'midfielder', top: 36, left: 78 },
      { id: 'st', roleName: 'ST', position: 'forward', top: 15, left: 50 },
    ],
  },
  '7v7': {
    name: '7v7 Corporate Cup',
    slots: [
      { id: 'gk', roleName: 'GK', position: 'goalkeeper', top: 86, left: 50 },
      { id: 'df1', roleName: 'LCB', position: 'defender', top: 66, left: 28 },
      { id: 'df2', roleName: 'RCB', position: 'defender', top: 66, left: 72 },
      { id: 'mf1', roleName: 'LM', position: 'midfielder', top: 44, left: 22 },
      { id: 'mf2', roleName: 'CM', position: 'midfielder', top: 48, left: 50 },
      { id: 'mf3', roleName: 'RM', position: 'midfielder', top: 44, left: 78 },
      { id: 'fw', roleName: 'ST', position: 'forward', top: 18, left: 50 },
    ],
  },
  '5v5': {
    name: '5v5 Futsal / Arena',
    slots: [
      { id: 'gk', roleName: 'GK', position: 'goalkeeper', top: 86, left: 50 },
      { id: 'df', roleName: 'CB', position: 'defender', top: 64, left: 50 },
      { id: 'mf1', roleName: 'LM', position: 'midfielder', top: 42, left: 22 },
      { id: 'mf2', roleName: 'RM', position: 'midfielder', top: 42, left: 78 },
      { id: 'fw', roleName: 'ST', position: 'forward', top: 18, left: 50 },
    ],
  },
}

/** A club entry's saved lineup: the formation, who starts in each slot, and the bench. */
export type Lineup = { formation: FormationType; starters: Record<string, number>; bench: number[] }

export const isFormation = (value: unknown): value is FormationType => typeof value === 'string' && value in FORMATIONS

/** How many of the formation's own slots are filled; stale keys from another formation do not count. */
export const filledSlots = (formation: FormationType, starters: Record<string, unknown>) =>
  FORMATIONS[formation].slots.filter((slot) => starters[slot.id] != null).length

/**
 * Re-seats starters for a new formation: same slot id first, then a slot for
 * the same position, then any free slot. Anyone left over goes to the bench.
 */
export function reseat<P>(
  formation: FormationType,
  starters: Record<string, P>,
  positionOf: (player: P) => PlayerPosition,
): { starters: Record<string, P>; overflow: P[] } {
  const slots = FORMATIONS[formation].slots
  const next: Record<string, P> = {}
  const waiting: P[] = []
  for (const [slotId, player] of Object.entries(starters)) {
    if (slots.some((slot) => slot.id === slotId) && next[slotId] == null) next[slotId] = player
    else waiting.push(player)
  }
  const free = () => slots.filter((slot) => next[slot.id] == null)
  const overflow: P[] = []
  for (const player of waiting) {
    const slot = free().find((s) => s.position === positionOf(player)) ?? free()[0]
    if (slot) next[slot.id] = player
    else overflow.push(player)
  }
  return { starters: next, overflow }
}

/**
 * A saved lineup resolved against the current squad: players who have left
 * are dropped, and squad members not placed anywhere join the bench.
 */
export function resolveLineup<P extends { id: number }>(lineup: Lineup | undefined, squad: P[]) {
  if (!lineup || !isFormation(lineup.formation)) return null
  const byId = new Map(squad.map((player) => [player.id, player]))
  const starters: Record<string, P> = {}
  for (const slot of FORMATIONS[lineup.formation].slots) {
    const player = byId.get(lineup.starters[slot.id])
    if (player) starters[slot.id] = player
  }
  const starting = new Set(Object.values(starters).map((player) => player.id))
  const bench = [
    ...lineup.bench.map((id) => byId.get(id)).filter((p): p is P => !!p && !starting.has(p.id)),
    ...squad.filter((p) => !starting.has(p.id) && !lineup.bench.includes(p.id)),
  ]
  return { formation: lineup.formation, starters, bench }
}

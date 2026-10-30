import type { Season } from '../types'

const STAGES = ['group', 'round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'third_place', 'final'] as const
export type DatabaseMatchStage = (typeof STAGES)[number]
const LABELS: Record<DatabaseMatchStage, string> = {
  group: 'Group Stage', round_of_32: 'Round of 32', round_of_16: 'Round of 16',
  quarter_final: 'Quarter-final', semi_final: 'Semi-final', third_place: 'Third-place Play-off', final: 'Final',
}

/** Store playoff phases using the existing constrained database round values. */
export function toDbStage(stage: string): DatabaseMatchStage {
  const value = String(stage ?? '').trim().toLowerCase()
  if (STAGES.includes(value as DatabaseMatchStage)) return value as DatabaseMatchStage
  if (value.includes('third') || value.includes('üçüncü')) return 'third_place'
  if (value.includes('preliminary') || value.includes('32')) return 'round_of_32'
  if (value.includes('playoff') || value.includes('play-off') || value.includes('16') || value.includes('son 16')) return 'round_of_16'
  if (value.startsWith('quarter') || value.includes('çeyrek') || value.includes('ceyrek')) return 'quarter_final'
  if (value.startsWith('semi') || value.includes('yarı') || value.includes('yari')) return 'semi_final'
  if (value.includes('final')) return 'final'
  return 'group'
}

/** Restore playoff-specific labels without changing ordinary knockout seasons. */
export function displayDbStage(stage: string, season?: Season): string {
  const count = season?.bracket?.qualification?.qualifiersPerTable ?? 0
  if (count > 8 && count < 16) {
    if (stage === 'round_of_32') return 'Preliminary round'
    if (stage === 'round_of_16') return 'Playoff round'
  }
  return Object.hasOwn(LABELS, stage) ? LABELS[stage as DatabaseMatchStage] : LABELS.group
}

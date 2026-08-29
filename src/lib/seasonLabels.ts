import type { Season } from '../types'

/* ------------------------------------------------------------------ *
 * Season display labels
 *
 * Players store season membership as ids. Labels are derived here at render
 * time, so renaming a season updates everywhere at once instead of orphaning
 * the history — which is exactly what the previous label-based storage did.
 * ------------------------------------------------------------------ */

/** The canonical way to show a season in the UI. */
export function seasonLabel(season: Season): string {
  return `${season.year} — ${season.name || season.fullName || season.city}`
}

/**
 * Resolves stored season ids to labels for display.
 *
 * An id with no matching season is rendered as a marker rather than dropped:
 * silently hiding a registration would make a data problem invisible.
 */
export function seasonLabelsForIds(ids: number[] | undefined, seasons: Season[]): string[] {
  if (!ids || ids.length === 0) return []
  const byId = new Map(seasons.map((season) => [season.id, season]))
  return ids.map((id) => {
    const season = byId.get(id)
    return season ? seasonLabel(season) : `Unknown season (#${id})`
  })
}

/** The season a newly added player should default to. */
export function defaultSeasonId(seasons: Season[]): number | undefined {
  return (seasons.find((season) => season.isActive) ?? seasons[0])?.id
}

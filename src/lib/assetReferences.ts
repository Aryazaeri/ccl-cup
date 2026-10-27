const IMAGE_FIELDS = new Set(['logoUrl', 'photoUrl', 'coverImageUrl', 'thumbnailUrl', 'externalUrl', 'teamLogo'])

/** Include saved canvas slots, which also carry image references. */
export function mapAssetReferences<T>(value: T, map: (url: string) => string | undefined): T {
  const visit = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(visit)
    if (!item || typeof item !== 'object') return item
    return Object.fromEntries(Object.entries(item).map(([key, field]) => [key,
      IMAGE_FIELDS.has(key) && typeof field === 'string' ? map(field) : visit(field),
    ]))
  }
  return visit(value) as T
}

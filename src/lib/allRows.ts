/**
 * The Supabase API returns at most a fixed number of rows per request (1000 by
 * default), silently cutting off the rest. Reads every page of a query instead.
 * It steps by the rows actually returned, so a lower server cap still reads
 * everything; the query must have a stable order (end it with a unique column).
 *
 * When the first page reports an exact count, the remaining pages are read a few
 * at a time instead of one after another (14 lineup pages took ~9s in sequence).
 */
type Page<T> = PromiseLike<{ data: T[] | null; error: unknown; count?: number | null }>

const PARALLEL_PAGES = 4

export async function allRows<T>(page: (from: number, to: number) => Page<T>, size = 1000): Promise<{ data: T[]; error: unknown; count?: number | null }> {
  // One retry: on the free tier a page can time out while the panel's other
  // lists load in parallel, and one failed list used to fail the whole load.
  const read = async (from: number) => {
    const result = await page(from, from + size - 1)
    return result.error ? page(from, from + size - 1) : result
  }

  const rows: T[] = []
  const first = await read(0)
  if (first.error) return { data: rows, error: first.error }
  if (!first.data?.length) return { data: rows, error: null }
  rows.push(...first.data)
  let total = first.count ?? null

  if (total != null && rows.length < total) {
    const step = rows.length // the server's real cap
    const offsets: number[] = []
    for (let from = step; from < total; from += step) offsets.push(from)
    const pages = new Array<Awaited<ReturnType<typeof read>>>(offsets.length)
    let next = 0
    await Promise.all(Array.from({ length: Math.min(PARALLEL_PAGES, offsets.length) }, async () => {
      while (next < offsets.length) {
        const index = next++
        pages[index] = await read(offsets[index])
      }
    }))
    for (const result of pages) {
      if (result.error) return { data: rows, error: result.error }
      rows.push(...(result.data ?? []))
    }
  }

  // No count, or rows were added while reading: continue one page at a time.
  for (;;) {
    if (total != null && rows.length >= total) return { data: rows, error: null }
    const { data, error, count } = await read(rows.length)
    if (error) return { data: rows, error }
    if (!data?.length) return { data: rows, error: null }
    rows.push(...data)
    if (count != null) total = count
  }
}

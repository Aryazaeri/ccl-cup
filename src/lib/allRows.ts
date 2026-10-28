/**
 * The Supabase API returns at most a fixed number of rows per request (1000 by
 * default), silently cutting off the rest. Reads every page of a query instead.
 * It steps by the rows actually returned, so a lower server cap still reads
 * everything; the query must have a stable order (end it with a unique column).
 */
type Page<T> = PromiseLike<{ data: T[] | null; error: unknown; count?: number | null }>

export async function allRows<T>(page: (from: number, to: number) => Page<T>, size = 1000): Promise<{ data: T[]; error: unknown; count?: number | null }> {
  const rows: T[] = []
  let total: number | null = null
  for (;;) {
    const { data, error, count } = await page(rows.length, rows.length + size - 1)
    if (error) return { data: rows, error }
    if (!data?.length) return { data: rows, error: null }
    rows.push(...data)
    if (count != null) total = count
    if (total != null && rows.length >= total) return { data: rows, error: null }
  }
}

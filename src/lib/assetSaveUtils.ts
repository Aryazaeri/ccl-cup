export type UploadedAsset = { url?: string; path?: string }

/** Compensate only a newly uploaded asset when the row write is rejected.
 * Refreshing after the committed write belongs outside this operation.
 */
export async function saveWithAsset<T>(
  prepare: () => Promise<UploadedAsset>,
  persist: (url: string | undefined) => Promise<T>,
  discard: (asset: UploadedAsset) => Promise<void>,
): Promise<T> {
  const asset = await prepare()
  try { return await persist(asset.url) }
  catch (reason) {
    if (asset.path) {
      try { await discard(asset) }
      catch {
        const message = reason instanceof Error ? reason.message : 'The club could not be saved.'
        throw new Error(`${message} The unused crest could not be cleaned up.`, { cause: reason })
      }
    }
    throw reason
  }
}

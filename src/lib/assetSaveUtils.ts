export type UploadedAsset = { url?: string; path?: string }

/** A network failure may still commit. Only an explicit rejection permits
 * cleanup of an upload submitted with that request. */
export function isDefinitiveSaveRejection(reason: unknown): boolean {
  let value = reason
  for (let depth = 0; value && typeof value === 'object' && depth < 8; depth++) {
    const error = value as { code?: string; status?: number; cause?: unknown }
    if (error.code && /^(22|23|42|40P01|40001|55P03|PGRST1)/.test(error.code)) return true
    if (error.status && [400, 401, 403, 404, 409, 422].includes(error.status)) return true
    value = error.cause
  }
  return false
}

export function reportAssetSaveFailure(form: HTMLFormElement, reason: unknown): void {
  form.dispatchEvent(new CustomEvent('ccl:asset-save-failed', { detail: reason }))
}

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
    if (asset.path && isDefinitiveSaveRejection(reason)) {
      try { await discard(asset) }
      catch {
        const message = reason instanceof Error ? reason.message : 'The club could not be saved.'
        throw new Error(`${message} The unused crest could not be cleaned up.`, { cause: reason })
      }
    }
    if (asset.path && !isDefinitiveSaveRejection(reason)) {
      throw new Error('The save result is uncertain. Reload before retrying; the image has been retained.', { cause: reason })
    }
    throw reason
  }
}

import { isSupabaseConfigured, supabase } from './supabase'

/**
 * Uploading images to Supabase Storage.
 *
 * The pickers used to hand a base64 `data:` URL straight to the form field,
 * which then went into a text column. A 2 MB crest becomes ~2.7 MB of text
 * inlined into the row, re-sent on every read of that table, and shipped to
 * every visitor of the public site. This module puts the bytes in a bucket and
 * stores a URL instead.
 */

const BUCKET = 'club-assets'

/** Folders inside the bucket, one per kind of subject. */
export type AssetFolder = 'logos' | 'players' | 'sponsors' | 'articles' | 'media'

/** Mirrors the bucket's own limits so the user hears about it before the upload. */
export const MAX_ASSET_BYTES = 5 * 1024 * 1024
export const ALLOWED_ASSET_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'image/gif',
]

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/gif': 'gif',
}

export class AssetUploadError extends Error {}

/** Reject the obvious failures here rather than after a round trip. */
export function validateAssetFile(file: File): string | null {
  if (!ALLOWED_ASSET_TYPES.includes(file.type)) {
    return 'Use a PNG, JPG, WEBP, SVG or GIF image.'
  }
  if (file.size > MAX_ASSET_BYTES) {
    return `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB.`
  }
  return null
}

function objectPath(folder: AssetFolder, file: File): string {
  const ext = EXTENSIONS[file.type] ?? 'bin'
  // Random name, not the original: two clubs uploading "logo.png" must not
  // collide, and a user-supplied filename should never become a public URL.
  const unique =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return `${folder}/${unique}.${ext}`
}

/**
 * Convert a `data:` URL back into a File so the existing pickers — which crop
 * and hand back a data URL — can be redirected into storage without being
 * rewritten around Blobs.
 */
export function dataUrlToFile(dataUrl: string, name = 'upload'): File | null {
  // Parameters such as ";utf8" or ";charset=utf-8" may sit between the type
  // and the payload; the preset crests use "data:image/svg+xml;utf8,…", which
  // the old pattern rejected, so saving a club with a preset crest failed.
  const match = /^data:([^;,]+)((?:;[^;,]*)*),(.*)$/s.exec(dataUrl)
  if (!match) return null
  const [, mime, params, payload] = match
  try {
    let bytes: Uint8Array<ArrayBuffer>
    if (params.split(';').includes('base64')) {
      const binary = atob(payload)
      bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    } else {
      // Percent-encoded text: encode as UTF-8 so non-ASCII characters survive.
      bytes = new TextEncoder().encode(decodeURIComponent(payload))
    }
    return new File([bytes], name, { type: mime })
  } catch {
    return null
  }
}

export function isDataUrl(value: string | undefined): boolean {
  return !!value && value.startsWith('data:')
}

/**
 * Put a file in the bucket and return its public URL.
 *
 * With no Supabase project configured there is nowhere to put it, so the data
 * URL is returned unchanged — local demo mode keeps working, and only the
 * browser holds the bytes.
 */
export async function uploadAsset(file: File, folder: AssetFolder): Promise<string> {
  const invalid = validateAssetFile(file)
  if (invalid) throw new AssetUploadError(invalid)

  if (!isSupabaseConfigured || !supabase) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new AssetUploadError('Could not read that file.'))
      reader.readAsDataURL(file)
    })
    return dataUrl
  }

  const path = objectPath(folder, file)
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '31536000',
    upsert: false,
    contentType: file.type,
  })
  if (error) {
    // The policies only admit signed-in staff, which is the likely cause.
    throw new AssetUploadError(
      error.message.toLowerCase().includes('row-level security')
        ? 'You do not have permission to upload images. Sign in with a staff account.'
        : `Upload failed: ${error.message}`,
    )
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  if (!data?.publicUrl) throw new AssetUploadError('Upload succeeded but no public URL was returned.')
  return data.publicUrl
}

/**
 * Upload whatever a picker produced, if it still needs uploading.
 *
 * Pickers hand back either a `data:` URL they just built or an untouched http
 * URL from a previous save; only the former should cost a round trip.
 */
export async function ensureUploaded(
  value: string | undefined,
  folder: AssetFolder,
): Promise<string | undefined> {
  if (!value || !isDataUrl(value)) return value
  const file = dataUrlToFile(value, `${folder}-upload`)
  if (!file) throw new AssetUploadError('That image could not be read.')
  return uploadAsset(file, folder)
}

import { useAdminLanguage } from '../i18n/AdminLanguageContext'
import { Image as ImageIcon, Loader2, Trash2, Upload } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import { assetDisplayUrl, canonicalAssetUrl, discardUploadedAsset, uploadAssetReceipt, validateAssetFile, type AssetFolder } from '../lib/assetStorage'
import { isDefinitiveSaveRejection, type UploadedAsset } from '../lib/assetSaveUtils'

/**
 * An image field that accepts a file or a URL.
 *
 * Every image in the panel except the club crest was a bare `type="url"` box,
 * so staff could only reference a picture already hosted somewhere else. There
 * was nowhere to put one. This uploads to the bucket and keeps the resulting
 * URL in a hidden input, so the surrounding form still reads it out of
 * FormData under `name` and nothing else has to change.
 *
 * The upload happens on selection rather than on submit: a five-megabyte file
 * on a slow connection should not look like a frozen Save button, and a
 * rejected file should be reported while the user is still looking at it.
 *
 * Closing discards only uploads with no possible committed save. A definitive
 * rejection permits cleanup; an uncertain network outcome retains the file.
 * Previously saved images are never removed by this field.
 */
export function ImageUploadField({
  name,
  label,
  folder,
  defaultValue = '',
  hint,
  required = false,
}: {
  name: string
  label: string
  folder: AssetFolder
  defaultValue?: string
  hint?: string
  required?: boolean
}) {
  const { tr } = useAdminLanguage()
  const [value, setValue] = useState(canonicalAssetUrl(defaultValue) ?? '')
  const [preview, setPreview] = useState(defaultValue)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const fieldId = useId()
  // Track each uploaded file and every attempted save outcome.
  const uploads = useRef<UploadedAsset[]>([])
  const mounted = useRef(false)
  const uploading = useRef(false)
  const attempts = useRef<{ url: string; rejected: boolean }[]>([])
  useEffect(() => {
    let active = true
    assetDisplayUrl(value).then((url) => { if (active) setPreview(url ?? '') })
    return () => { active = false }
  }, [value])

  useEffect(() => {
    mounted.current = true
    const form = inputRef.current?.closest('form')
    const blockPrematureSave = (event: Event) => {
      if (uploading.current) {
        event.preventDefault(); event.stopImmediatePropagation()
        setError('Wait for the image upload to finish before saving.')
      } else {
        attempts.current.push({ url: String(new FormData(form!).get(name) ?? ''), rejected: false })
      }
    }
    const rejected = (event: Event) => {
      const last = attempts.current.at(-1)
      if (last && isDefinitiveSaveRejection((event as CustomEvent).detail)) last.rejected = true
      else if (last) setError('The save outcome is uncertain. This upload will be retained; reload and check the record before trying again.')
    }
    form?.addEventListener('submit', blockPrematureSave, true)
    form?.addEventListener('ccl:asset-save-failed', rejected)
    const uploaded = uploads.current // the same arrays for this field's lifetime
    const saveAttempts = attempts.current
    return () => {
      mounted.current = false
      form?.removeEventListener('submit', blockPrematureSave, true)
      form?.removeEventListener('ccl:asset-save-failed', rejected)
      // The server checks references across all rows, including a save whose
      // response was lost. Cancel and rejected saves remove only unused files.
      for (const asset of uploaded) {
        // Retain any upload with an ambiguous commit. A later explicit
        // rejection does not erase uncertainty from an earlier attempt.
        if (saveAttempts.some((a) => a.url === asset.url && !a.rejected)) continue
        discardUploadedAsset(asset).catch((reason) => console.warn('Could not remove an unused upload:', reason))
      }
    }
  }, [name])

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Reset immediately so re-picking the same file still fires a change.
    event.target.value = ''
    if (!file) return

    const invalid = validateAssetFile(file)
    if (invalid) {
      setError(invalid)
      return
    }

    setBusy(true)
    uploading.current = true
    setError('')
    try {
      const receipt = await uploadAssetReceipt(file, folder)
      if (!mounted.current) { await discardUploadedAsset(receipt); return }
      uploads.current.push(receipt)
      setValue(receipt.url ?? '')
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : 'That image could not be uploaded.')
      else console.warn('Could not clean up a cancelled image upload:', reason)
    } finally {
      uploading.current = false
      if (mounted.current) setBusy(false)
    }
  }

  return (
    <label className="span-2 image-upload-field" htmlFor={fieldId}>
      {tr(label)}
      {required ? ' *' : ''}

      <div className="image-upload-row">
        <span className="image-upload-preview" aria-hidden="true">
          {preview ? <img src={preview} alt="" /> : <ImageIcon size={18} />}
        </span>

        <input
          id={fieldId}
          className="image-upload-url"
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={tr("Upload a file, or paste an image URL")}
        />

        <button
          type="button"
          className="ghost-button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          {busy ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
          {busy ? tr("Uploading…") : tr("Upload")}
        </button>

        {value ? (
          <button
            type="button"
            className="ghost-button danger"
            onClick={() => { setValue(''); setError('') }}
            title={tr("Remove this image")}
          >
            <Trash2 size={14} />
          </button>
        ) : null}
      </div>

      {/* What the surrounding form actually reads. */}
      <input type="hidden" name={name} value={value} />

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
        onChange={pick}
        hidden
      />

      {error ? <small className="field-error">{tr(error)}</small> : hint ? <small className="field-hint">{hint}</small> : null}
    </label>
  )
}

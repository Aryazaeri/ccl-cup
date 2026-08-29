import { Image as ImageIcon, Loader2, Trash2, Upload } from 'lucide-react'
import { useId, useRef, useState, type ChangeEvent } from 'react'
import { uploadAsset, validateAssetFile, type AssetFolder } from '../lib/assetStorage'

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
  const [value, setValue] = useState(defaultValue)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const fieldId = useId()

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
    setError('')
    try {
      setValue(await uploadAsset(file, folder))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'That image could not be uploaded.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <label className="span-2 image-upload-field" htmlFor={fieldId}>
      {label}
      {required ? ' *' : ''}

      <div className="image-upload-row">
        <span className="image-upload-preview" aria-hidden="true">
          {value ? <img src={value} alt="" /> : <ImageIcon size={18} />}
        </span>

        <input
          id={fieldId}
          className="image-upload-url"
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Upload a file, or paste an image URL"
        />

        <button
          type="button"
          className="ghost-button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          {busy ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
          {busy ? 'Uploading…' : 'Upload'}
        </button>

        {value ? (
          <button
            type="button"
            className="ghost-button danger"
            onClick={() => { setValue(''); setError('') }}
            title="Remove this image"
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

      {error ? <small className="field-error">{error}</small> : hint ? <small className="field-hint">{hint}</small> : null}
    </label>
  )
}

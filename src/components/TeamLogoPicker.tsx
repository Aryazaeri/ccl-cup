import { Check, Crop, Image, Sparkles, Trash2, Upload } from 'lucide-react'
import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { PRESET_LOGOS } from '../lib/presetLogos'
import { ImageTrimmerModal } from './ImageTrimmerModal'

type Props = {
  value: string
  onChange: (logoUrl: string) => void
  teamName?: string
  teamColor?: string
}

export function TeamLogoPicker({ value, onChange, teamName, teamColor }: Props) {
  const [activeTab, setActiveTab] = useState<'upload' | 'preset'>('upload')
  const [dragOver, setDragOver] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [trimmerImageSrc, setTrimmerImageSrc] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileProcess = (file: File) => {
    setErrorMsg('')
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please choose an image file (PNG, JPG, SVG or WEBP).')
      return
    }

    if (file.size > 8 * 1024 * 1024) {
      setErrorMsg('Resim boyutu en fazla 8MB olabilir.')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const result = e.target?.result as string
      if (result) {
        // Open the trimmer directly with the uploaded image!
        setTrimmerImageSrc(result)
      }
    }
    reader.readAsDataURL(file)
  }

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files[0]) {
      handleFileProcess(files[0])
    }
    // Reset input value so same file can be re-selected if desired
    e.target.value = ''
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const files = e.dataTransfer.files
    if (files && files[0]) {
      handleFileProcess(files[0])
    }
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
  }

  return (
    <>
      <div className="team-logo-picker-container span-2">
        <div className="picker-header-row">
          <label className="picker-title-label">
            <Image size={16} /> Club logo
          </label>

          <div className="picker-mode-tabs">
            <button
              type="button"
              className={`picker-tab-btn ${activeTab === 'upload' ? 'active' : ''}`}
              onClick={() => setActiveTab('upload')}
            >
              <Upload size={14} /> Upload a file
            </button>
            <button
              type="button"
              className={`picker-tab-btn ${activeTab === 'preset' ? 'active' : ''}`}
              onClick={() => setActiveTab('preset')}
            >
              <Sparkles size={14} /> Preset crests
            </button>
          </div>
        </div>

        {/* HIDDEN INPUT FOR FORM SUBMISSION */}
        <input type="hidden" name="logoUrl" value={value || ''} />

        {/* ACTIVE SELECTION BANNER IF LOGO IS SET */}
        {value && (
          <div className="selected-logo-strip">
            <div className="selected-logo-preview">
              <img src={value} alt="Selected Logo" />
            </div>
            <div className="selected-logo-info">
              <strong>Custom logo selected</strong>
              <span>Your crest is sized for club cards and match screens.</span>
            </div>
            <div className="selected-logo-actions">
              <button
                type="button"
                className="btn-trim-again"
                onClick={() => setTrimmerImageSrc(value)}
                title="Crop or resize the logo"
              >
                <Crop size={14} /> Crop / edit
              </button>
              <button
                type="button"
                className="btn-remove-logo"
                onClick={() => onChange('')}
                title="Remove the logo and use the monogram"
              >
                <Trash2 size={14} /> Remove
              </button>
            </div>
          </div>
        )}

        {/* 1. UPLOAD TAB */}
        {activeTab === 'upload' && (
          <div
            className={`logo-dropzone ${dragOver ? 'drag-over' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
              style={{ display: 'none' }}
              onChange={handleFileInputChange}
            />
            <div className="dropzone-content">
              <div className="dropzone-icon-circle">
                <Upload size={22} />
              </div>
              <strong>Choose an image or drop it here</strong>
              <span>PNG, JPG, SVG or WEBP — the crop tool opens automatically</span>
              <button
                type="button"
                className="button button-admin btn-browse"
                onClick={(e) => {
                  e.stopPropagation()
                  fileInputRef.current?.click()
                }}
              >
                Choose file
              </button>
            </div>
          </div>
        )}

        {/* 2. PRESET GALLERY TAB */}
        {activeTab === 'preset' && (
          <div className="preset-logos-gallery">
            <div className="preset-logos-grid">
              {PRESET_LOGOS.map((preset) => {
                const isSelected = value === preset.url

                return (
                  <button
                    key={preset.id}
                    type="button"
                    className={`preset-logo-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => onChange(preset.url)}
                    title={preset.name}
                  >
                    <img src={preset.url} alt={preset.name} />
                    <span className="preset-item-name">{preset.name}</span>
                    {isSelected && (
                      <div className="preset-selected-check">
                        <Check size={12} />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {errorMsg && <div className="picker-error-msg">{errorMsg}</div>}
      </div>

      {/* SMART IMAGE TRIMMER & CROPPER MODAL */}
      {trimmerImageSrc && (
        <ImageTrimmerModal
          rawImageSrc={trimmerImageSrc}
          teamName={teamName}
          teamColor={teamColor}
          onClose={() => setTrimmerImageSrc(null)}
          onApply={(trimmedUrl) => {
            onChange(trimmedUrl)
            setTrimmerImageSrc(null)
          }}
        />
      )}
    </>
  )
}

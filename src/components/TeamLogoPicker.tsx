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
      setErrorMsg('Lütfen geçerli bir resim dosyası seçin (PNG, JPG, SVG, WEBP).')
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
            <Image size={16} /> Kulüp Logosu / Arma Seçimi
          </label>

          <div className="picker-mode-tabs">
            <button
              type="button"
              className={`picker-tab-btn ${activeTab === 'upload' ? 'active' : ''}`}
              onClick={() => setActiveTab('upload')}
            >
              <Upload size={14} /> Dosya Yükle / Bilgisayardan Seç
            </button>
            <button
              type="button"
              className={`picker-tab-btn ${activeTab === 'preset' ? 'active' : ''}`}
              onClick={() => setActiveTab('preset')}
            >
              <Sparkles size={14} /> Hazır Arma Galerisi
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
              <strong>Özel Logo Seçildi</strong>
              <span>Armanız kulüp kartları ve maç ekranlarına göre optimize edilmiştir.</span>
            </div>
            <div className="selected-logo-actions">
              <button
                type="button"
                className="btn-trim-again"
                onClick={() => setTrimmerImageSrc(value)}
                title="Logoyu Yeniden Kırp / Boyutlandır"
              >
                <Crop size={14} /> Kırp / Düzenle
              </button>
              <button
                type="button"
                className="btn-remove-logo"
                onClick={() => onChange('')}
                title="Logoyu Kaldır / Otomatik Monogram Kullan"
              >
                <Trash2 size={14} /> Kaldır
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
              <strong>Resim Seçin veya Buraya Sürükleyin</strong>
              <span>PNG, JPG, SVG veya WEBP (Otomatik kırpma & hizalama katmanı açılır)</span>
              <button
                type="button"
                className="button button-admin btn-browse"
                onClick={(e) => {
                  e.stopPropagation()
                  fileInputRef.current?.click()
                }}
              >
                Bilgisayardan Dosya Seç
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

import {
  Check,
  Maximize,
  RotateCw,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useEffect, useRef, useState, type MouseEvent, type TouchEvent } from 'react'
import {
  renderCustomCrop,
  smartAutoTrimImage,
  type CropConfig,
} from '../lib/imageTrimmer'
import { Modal } from './Modal'

type Props = {
  rawImageSrc: string
  teamName?: string
  teamColor?: string
  onClose: () => void
  onApply: (trimmedImageSrc: string) => void
}

export function ImageTrimmerModal({
  rawImageSrc,
  teamName = 'Team',
  teamColor = '#63e35b',
  onClose,
  onApply,
}: Props) {
  const [config, setConfig] = useState<CropConfig>({
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
  })

  const [currentPreview, setCurrentPreview] = useState<string>(rawImageSrc)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef<{ x: number; y: number; initialOffsetX: number; initialOffsetY: number }>({
    x: 0,
    y: 0,
    initialOffsetX: 0,
    initialOffsetY: 0,
  })

  // Live render cropped preview whenever config changes
  useEffect(() => {
    let active = true
    renderCustomCrop(rawImageSrc, config, 300).then((preview) => {
      if (active) setCurrentPreview(preview)
    })
    return () => {
      active = false
    }
  }, [rawImageSrc, config])

  // Mouse drag handlers for panning
  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    setIsDragging(true)
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      initialOffsetX: config.offsetX,
      initialOffsetY: config.offsetY,
    }
  }

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return
    const dx = e.clientX - dragStartRef.current.x
    const dy = e.clientY - dragStartRef.current.y
    setConfig((prev) => ({
      ...prev,
      offsetX: dragStartRef.current.initialOffsetX + dx,
      offsetY: dragStartRef.current.initialOffsetY + dy,
    }))
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  // Touch handlers for mobile / tablet
  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1 && e.touches[0]) {
      setIsDragging(true)
      dragStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        initialOffsetX: config.offsetX,
        initialOffsetY: config.offsetY,
      }
    }
  }

  const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    if (!isDragging || e.touches.length !== 1 || !e.touches[0]) return
    const dx = e.touches[0].clientX - dragStartRef.current.x
    const dy = e.touches[0].clientY - dragStartRef.current.y
    setConfig((prev) => ({
      ...prev,
      offsetX: dragStartRef.current.initialOffsetX + dx,
      offsetY: dragStartRef.current.initialOffsetY + dy,
    }))
  }

  // Smart Auto-Trim (AI / Pixel Bounding Box crop)
  const handleSmartAutoTrim = async () => {
    setIsProcessing(true)
    try {
      const trimmed = await smartAutoTrimImage(rawImageSrc, 0.05)
      setCurrentPreview(trimmed)
      // Reset manual crop
      setConfig({
        zoom: 1,
        offsetX: 0,
        offsetY: 0,
        rotation: 0,
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleRotate = () => {
    setConfig((prev) => ({
      ...prev,
      rotation: (prev.rotation + 90) % 360,
    }))
  }

  const handleReset = () => {
    setConfig({
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
    })
  }

  const handleSaveAndApply = async () => {
    setIsProcessing(true)
    try {
      const finalHighRes = await renderCustomCrop(rawImageSrc, config, 512)
      onApply(finalHighRes)
      onClose()
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <Modal title="✂️ Crop logo" onClose={onClose}>
      <div className="trimmer-modal-shell">
        <div className="trimmer-content-grid">
          {/* LEFT: INTERACTIVE CROP CANVAS & PAN WORKSPACE */}
          <div className="trimmer-workspace-panel">
            <div className="trimmer-workspace-header">
              <span>Drag to position the logo:</span>
              <button
                type="button"
                className="btn-smart-trim-action"
                onClick={handleSmartAutoTrim}
                disabled={isProcessing}
                title="Trim the empty edges and centre the logo"
              >
                <Sparkles size={15} /> Auto trim & fit
              </button>
            </div>

            <div
              className={`crop-canvas-viewport ${isDragging ? 'is-dragging' : ''}`}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleMouseUp}
            >
              {/* TRANSPARENT CHECKERBOARD BG */}
              <div className="crop-checkerboard-bg" />

              {/* TRANSFORMED IMAGE */}
              <div
                className="crop-image-container"
                style={{
                  transform: `translate(${config.offsetX}px, ${config.offsetY}px) rotate(${config.rotation}deg) scale(${config.zoom})`,
                }}
              >
                <img src={rawImageSrc} alt="Crop Subject" draggable={false} />
              </div>

              {/* CROP OVERLAY MASK & GUIDES */}
              <div className="crop-mask-overlay">
                <div className="crop-safe-area-circle" />
                <div className="crop-grid-lines">
                  <div className="line-h-1" />
                  <div className="line-h-2" />
                  <div className="line-v-1" />
                  <div className="line-v-2" />
                </div>
              </div>
            </div>

            {/* CROP CONTROLS TOOLBAR */}
            <div className="crop-controls-toolbar">
              <div className="zoom-slider-group">
                <ZoomOut size={16} />
                <input
                  type="range"
                  min="0.5"
                  max="3"
                  step="0.05"
                  value={config.zoom}
                  onChange={(e) => setConfig({ ...config, zoom: parseFloat(e.target.value) })}
                />
                <ZoomIn size={16} />
                <span className="zoom-value-label">{Math.round(config.zoom * 100)}%</span>
              </div>

              <div className="crop-aux-actions">
                <button
                  type="button"
                  className="btn-crop-tool"
                  onClick={handleRotate}
                  title="Rotate 90° right"
                >
                  <RotateCw size={15} /> Rotate
                </button>
                <button
                  type="button"
                  className="btn-crop-tool secondary"
                  onClick={handleReset}
                  title="Reset to centre"
                >
                  <Maximize size={15} /> Reset
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT: REAL-TIME COMPONENT PREVIEW PANEL */}
          <aside className="trimmer-preview-sidebar">
            <h4>Previews</h4>
            <span className="preview-subtitle">
              How the logo will look around the site:
            </span>

            <div className="previews-collection">
              {/* 1. LARGE SHIELD BADGE PREVIEW */}
              <div className="preview-card-item">
                <label>Club page crest</label>
                <div
                  className="preview-shield-box"
                  style={{ borderColor: teamColor || '#63e35b' }}
                >
                  <img src={currentPreview} alt="Shield Preview" />
                </div>
              </div>

              {/* 2. CIRCLE PROFILE PREVIEW */}
              <div className="preview-card-item">
                <label>Match & list icon</label>
                <div className="preview-circle-box">
                  <img src={currentPreview} alt="Circle Preview" />
                </div>
              </div>

              {/* 3. MINI MATCH STRIP PREVIEW */}
              <div className="preview-card-item">
                <label>Live score strip</label>
                <div className="preview-match-row">
                  <div className="mini-team-thumb">
                    <img src={currentPreview} alt="Mini" />
                  </div>
                  <strong>{teamName.toUpperCase() || 'CLUB'}</strong>
                </div>
              </div>
            </div>
          </aside>
        </div>

        {/* BOTTOM ACTION BAR */}
        <div className="trimmer-actions-bar">
          <button type="button" className="button button-admin secondary" onClick={onClose}>
            <X size={15} /> Cancel
          </button>
          <button
            type="button"
            className="button button-admin primary"
            onClick={handleSaveAndApply}
            disabled={isProcessing}
          >
            <Check size={16} /> {isProcessing ? 'Processing…' : 'Apply crop'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

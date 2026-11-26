import { useEffect, useRef, useState } from 'react'
import {
  Crop,
  EyeOff,
  KeyRound,
  Loader2,
  PenLine,
  RotateCcw,
  RotateCw,
  ScanLine,
  ShieldAlert,
  Undo2,
} from 'lucide-react'
import type { AppSettings, ScannedReceiptRaw } from '../types/receipt'
import { resolveModelId, scanReceiptWithGemini } from '../utils/gemini'
import {
  exportCroppedRedactedJpeg,
  loadImageElement,
  type NormalizedRect,
} from '../utils/imageProcessor'

interface PrivacyCropViewProps {
  photoFile: File
  settings: AppSettings
  onScanComplete: (raw: ScannedReceiptRaw) => void
  onCancel: () => void
  onOpenSettings: () => void
  onManualFallback: () => void
}

type EditMode = 'crop' | 'blackout'
type DragHandle =
  | 'move'
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w'

const FULL_CROP: NormalizedRect = { x: 0.03, y: 0.03, w: 0.94, h: 0.94 }
const MIN_CROP_SIZE = 0.1

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

export function PrivacyCropView({
  photoFile,
  settings,
  onScanComplete,
  onCancel,
  onOpenSettings,
  onManualFallback,
}: PrivacyCropViewProps) {
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [rotationDeg, setRotationDeg] = useState<number>(0)
  const [mode, setMode] = useState<EditMode>('crop')
  const [crop, setCrop] = useState<NormalizedRect>(FULL_CROP)
  const [redactions, setRedactions] = useState<NormalizedRect[]>([])
  const [draftRedaction, setDraftRedaction] = useState<NormalizedRect | null>(null)

  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)

  // Track active pointer drag cleanly without re-creating listeners
  const dragStateRef = useRef<
    | {
        kind: 'crop'
        handle: DragHandle
        startX: number
        startY: number
        initialCrop: NormalizedRect
      }
    | {
        kind: 'blackout'
        startX: number
        startY: number
      }
    | null
  >(null)

  // Load File into object URL and immediately revoke once decoded
  useEffect(() => {
    let active = true
    const objectUrl = URL.createObjectURL(photoFile)
    loadImageElement(objectUrl)
      .then((img) => {
        if (!active) return
        setImageEl(img)
        setLoadError(null)
      })
      .catch((err) => {
        if (!active) return
        setLoadError(err instanceof Error ? err.message : 'Failed to load image.')
      })
      .finally(() => {
        URL.revokeObjectURL(objectUrl)
      })

    return () => {
      active = false
    }
  }, [photoFile])

  // Render rotated image onto preview canvas whenever image or rotation changes
  useEffect(() => {
    const canvas = previewCanvasRef.current
    if (!canvas || !imageEl) return

    const normRot = ((rotationDeg % 360) + 360) % 360
    const natW = imageEl.naturalWidth
    const natH = imageEl.naturalHeight
    const swapped = normRot === 90 || normRot === 270
    const rotW = swapped ? natH : natW
    const rotH = swapped ? natW : natH

    // Cap preview canvas size for smooth rendering on mobile
    const scale = Math.min(1, 1000 / Math.max(rotW, rotH))
    const cw = Math.max(1, Math.round(rotW * scale))
    const ch = Math.max(1, Math.round(rotH * scale))

    canvas.width = cw
    canvas.height = ch
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, cw, ch)
    ctx.save()
    ctx.translate(cw / 2, ch / 2)
    ctx.rotate((normRot * Math.PI) / 180)
    ctx.drawImage(
      imageEl,
      (-natW * scale) / 2,
      (-natH * scale) / 2,
      natW * scale,
      natH * scale
    )
    ctx.restore()
  }, [imageEl, rotationDeg])

  const getNormalizedPoint = (e: React.PointerEvent): { x: number; y: number } => {
    const el = overlayRef.current
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    return {
      x: clamp((e.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((e.clientY - rect.top) / rect.height, 0, 1),
    }
  }

  const startCropDrag = (handle: DragHandle, e: React.PointerEvent) => {
    if (mode !== 'crop') return
    e.stopPropagation()
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const pt = getNormalizedPoint(e)
    dragStateRef.current = {
      kind: 'crop',
      handle,
      startX: pt.x,
      startY: pt.y,
      initialCrop: { ...crop },
    }
  }

  const handleOverlayPointerDown = (e: React.PointerEvent) => {
    if (mode !== 'blackout') return
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const pt = getNormalizedPoint(e)
    dragStateRef.current = {
      kind: 'blackout',
      startX: pt.x,
      startY: pt.y,
    }
    setDraftRedaction({ x: pt.x, y: pt.y, w: 0, h: 0 })
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    const drag = dragStateRef.current
    if (!drag) return
    e.preventDefault()
    const pt = getNormalizedPoint(e)

    if (drag.kind === 'blackout') {
      const x = Math.min(drag.startX, pt.x)
      const y = Math.min(drag.startY, pt.y)
      const w = Math.abs(pt.x - drag.startX)
      const h = Math.abs(pt.y - drag.startY)
      setDraftRedaction({ x, y, w, h })
      return
    }

    const dx = pt.x - drag.startX
    const dy = pt.y - drag.startY
    const init = drag.initialCrop

    if (drag.handle === 'move') {
      setCrop({
        x: clamp(init.x + dx, 0, 1 - init.w),
        y: clamp(init.y + dy, 0, 1 - init.h),
        w: init.w,
        h: init.h,
      })
      return
    }

    let left = init.x
    let top = init.y
    let right = init.x + init.w
    let bottom = init.y + init.h

    if (drag.handle.includes('w')) {
      left = clamp(init.x + dx, 0, right - MIN_CROP_SIZE)
    }
    if (drag.handle.includes('e')) {
      right = clamp(init.x + init.w + dx, left + MIN_CROP_SIZE, 1)
    }
    if (drag.handle.includes('n')) {
      top = clamp(init.y + dy, 0, bottom - MIN_CROP_SIZE)
    }
    if (drag.handle.includes('s')) {
      bottom = clamp(init.y + init.h + dy, top + MIN_CROP_SIZE, 1)
    }

    setCrop({
      x: left,
      y: top,
      w: right - left,
      h: bottom - top,
    })
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    const drag = dragStateRef.current
    if (!drag) return
    e.preventDefault()

    if (drag.kind === 'blackout' && draftRedaction) {
      if (draftRedaction.w >= 0.015 && draftRedaction.h >= 0.01) {
        setRedactions((prev) => [...prev, draftRedaction])
      }
      setDraftRedaction(null)
    }
    dragStateRef.current = null
  }

  const handleRotate = () => {
    setRotationDeg((prev) => (prev + 90) % 360)
    setCrop(FULL_CROP)
    setRedactions([])
  }

  const handleReset = () => {
    setRotationDeg(0)
    setCrop(FULL_CROP)
    setRedactions([])
    setDraftRedaction(null)
    setScanError(null)
  }

  const handleUndoRedaction = () => {
    setRedactions((prev) => prev.slice(0, -1))
  }

  const handleScan = async () => {
    if (!imageEl) return
    setScanError(null)

    if (!settings.geminiApiKey.trim()) {
      setScanError(
        'You need a free Google AI Studio Gemini API key before scanning. Tap "Add Free API Key" below — your cropped photo will stay ready here.'
      )
      return
    }

    setScanning(true)
    try {
      const processed = await exportCroppedRedactedJpeg({
        image: imageEl,
        rotationDeg,
        crop,
        redactions,
        maxDimension: 1600,
        quality: 0.88,
      })

      const modelId = resolveModelId(settings)
      const scanned = await scanReceiptWithGemini({
        apiKey: settings.geminiApiKey,
        modelId,
        jpegBase64: processed.base64,
      })

      onScanComplete(scanned)
    } catch (err) {
      setScanError(
        err instanceof Error ? err.message : 'Receipt scan failed. Please try again.'
      )
    } finally {
      setScanning(false)
    }
  }

  const handles: Array<{
    id: DragHandle
    left: string
    top: string
    edge?: boolean
    cursor: string
  }> = [
    { id: 'nw', left: '0%', top: '0%', cursor: 'nwse-resize' },
    { id: 'n', left: '50%', top: '0%', edge: true, cursor: 'ns-resize' },
    { id: 'ne', left: '100%', top: '0%', cursor: 'nesw-resize' },
    { id: 'e', left: '100%', top: '50%', edge: true, cursor: 'ew-resize' },
    { id: 'se', left: '100%', top: '100%', cursor: 'nwse-resize' },
    { id: 's', left: '50%', top: '100%', edge: true, cursor: 'ns-resize' },
    { id: 'sw', left: '0%', top: '100%', cursor: 'nesw-resize' },
    { id: 'w', left: '0%', top: '50%', edge: true, cursor: 'ew-resize' },
  ]

  const hasApiKey = Boolean(settings.geminiApiKey.trim())

  return (
    <div className="section-stack">
      <div className="privacy-banner" role="alert">
        <ShieldAlert size={20} style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <p className="privacy-banner-title">
            Privacy Check: Crop or Black Out Sensitive Details First
          </p>
          <p className="privacy-banner-text">
            Trim or black out credit card digits, signatures, phone numbers, and
            addresses. Only your cropped &amp; redacted JPEG is sent to Gemini —
            the original photo stays on your device.
          </p>
        </div>
      </div>

      <div className="crop-toolbar">
        <div className="segmented" role="tablist" aria-label="Edit mode">
          <button
            type="button"
            role="tab"
            id="mode-crop-btn"
            aria-selected={mode === 'crop'}
            className={`segmented-btn ${mode === 'crop' ? 'active' : ''}`}
            onClick={() => setMode('crop')}
          >
            <Crop size={15} />
            <span>Crop</span>
          </button>
          <button
            type="button"
            role="tab"
            id="mode-blackout-btn"
            aria-selected={mode === 'blackout'}
            className={`segmented-btn ${mode === 'blackout' ? 'active' : ''}`}
            onClick={() => setMode('blackout')}
          >
            <EyeOff size={15} />
            <span>Blackout {redactions.length > 0 ? `(${redactions.length})` : ''}</span>
          </button>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            id="rotate-photo-btn"
            className="btn btn-secondary btn-sm"
            onClick={handleRotate}
            disabled={scanning}
          >
            <RotateCw size={15} />
            <span>Rotate 90°</span>
          </button>
          {redactions.length > 0 && (
            <button
              type="button"
              id="undo-blackout-btn"
              className="btn btn-secondary btn-sm"
              onClick={handleUndoRedaction}
              disabled={scanning}
            >
              <Undo2 size={15} />
              <span>Undo</span>
            </button>
          )}
          <button
            type="button"
            id="reset-crop-btn"
            className="btn btn-ghost btn-sm"
            onClick={handleReset}
            disabled={scanning}
          >
            <RotateCcw size={15} />
            <span>Reset</span>
          </button>
        </div>
      </div>

      <div className="crop-stage-card">
        {loadError ? (
          <div style={{ color: '#fca5a5', padding: 20, textAlign: 'center' }}>
            {loadError}
          </div>
        ) : (
          <div className="crop-canvas-wrap">
            <canvas ref={previewCanvasRef} className="crop-preview-canvas" />

            <div
              ref={overlayRef}
              className="crop-overlay"
              style={{ cursor: mode === 'blackout' ? 'crosshair' : 'default' }}
              onPointerDown={handleOverlayPointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              {/* Dimmed regions outside the crop frame */}
              <div
                className="crop-shade"
                style={{ left: 0, top: 0, right: 0, height: `${crop.y * 100}%` }}
              />
              <div
                className="crop-shade"
                style={{
                  left: 0,
                  top: `${(crop.y + crop.h) * 100}%`,
                  right: 0,
                  bottom: 0,
                }}
              />
              <div
                className="crop-shade"
                style={{
                  left: 0,
                  top: `${crop.y * 100}%`,
                  width: `${crop.x * 100}%`,
                  height: `${crop.h * 100}%`,
                }}
              />
              <div
                className="crop-shade"
                style={{
                  left: `${(crop.x + crop.w) * 100}%`,
                  top: `${crop.y * 100}%`,
                  right: 0,
                  height: `${crop.h * 100}%`,
                }}
              />

              {/* Redaction blackout rectangles */}
              {redactions.map((box, idx) => (
                <div
                  key={idx}
                  className="redaction-box"
                  style={{
                    left: `${box.x * 100}%`,
                    top: `${box.y * 100}%`,
                    width: `${box.w * 100}%`,
                    height: `${box.h * 100}%`,
                  }}
                />
              ))}
              {draftRedaction && (
                <div
                  className="redaction-box draft"
                  style={{
                    left: `${draftRedaction.x * 100}%`,
                    top: `${draftRedaction.y * 100}%`,
                    width: `${draftRedaction.w * 100}%`,
                    height: `${draftRedaction.h * 100}%`,
                  }}
                />
              )}

              {/* Interactive Crop Frame */}
              <div
                className="crop-box"
                style={{
                  left: `${crop.x * 100}%`,
                  top: `${crop.y * 100}%`,
                  width: `${crop.w * 100}%`,
                  height: `${crop.h * 100}%`,
                  pointerEvents: mode === 'crop' ? 'auto' : 'none',
                  opacity: mode === 'crop' ? 1 : 0.72,
                }}
                onPointerDown={(e) => startCropDrag('move', e)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              >
                {mode === 'crop' &&
                  handles.map((h) => (
                    <div
                      key={h.id}
                      className={`crop-handle ${h.edge ? 'crop-handle-edge' : ''}`}
                      style={{ left: h.left, top: h.top, cursor: h.cursor }}
                      onPointerDown={(e) => startCropDrag(h.id, e)}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerUp}
                      aria-label={`Resize ${h.id}`}
                    >
                      <span className="crop-handle-dot" />
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="field-hint" style={{ textAlign: 'center', margin: 0 }}>
        {mode === 'crop'
          ? 'Drag the white corner/edge handles to frame only the items, tax, and tip.'
          : 'Drag across any line (e.g., card last 4 digits or signature) to paint a permanent black redaction box.'}
      </p>

      {scanError && (
        <div className="crop-inline-notice" role="alert">
          <div>{scanError}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!hasApiKey && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={onOpenSettings}
              >
                <KeyRound size={15} />
                <span>Add Free API Key</span>
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onManualFallback}
            >
              <PenLine size={15} />
              <span>Enter Manually Instead</span>
            </button>
          </div>
        </div>
      )}

      <div className="crop-actions-bar">
        {!hasApiKey && !scanError && (
          <button
            type="button"
            className="btn btn-soft btn-full"
            onClick={onOpenSettings}
          >
            <KeyRound size={17} />
            <span>Set Up Free Gemini API Key First</span>
          </button>
        )}

        <button
          type="button"
          id="scan-cropped-btn"
          className="btn btn-primary btn-lg btn-full"
          onClick={handleScan}
          disabled={!imageEl || scanning}
        >
          {scanning ? (
            <>
              <Loader2 size={20} className="spin" />
              <span>Scanning with {resolveModelId(settings)}…</span>
            </>
          ) : (
            <>
              <ScanLine size={20} />
              <span>Scan Cropped &amp; Redacted Receipt</span>
            </>
          )}
        </button>

        <button
          type="button"
          id="cancel-crop-btn"
          className="btn btn-ghost btn-full"
          onClick={onCancel}
          disabled={scanning}
        >
          Cancel &amp; Discard Photo
        </button>
      </div>
    </div>
  )
}

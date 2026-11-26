import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { ChevronLeft, ChevronRight, Copy, Share2, X } from 'lucide-react'
import { formatCents } from '../utils/format'

export interface QRFriendItem {
  personName: string
  amountCents: number
  url: string
  destinationLabel: string
  merchant: string
  onShare: () => void
  onCopy: () => void
}

interface QRModalProps {
  items: QRFriendItem[]
  currentIndex: number
  onChangeIndex: (index: number) => void
  onClose: () => void
}

export function QRModal({
  items,
  currentIndex,
  onChangeIndex,
  onClose,
}: QRModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const active = items[currentIndex]

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && currentIndex > 0) {
        onChangeIndex(currentIndex - 1)
      }
      if (e.key === 'ArrowRight' && currentIndex < items.length - 1) {
        onChangeIndex(currentIndex + 1)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentIndex, items.length, onChangeIndex, onClose])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !active) return
    QRCode.toCanvas(canvas, active.url, {
      width: 300,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    }).catch(() => undefined)
  }, [active])

  if (!active) return null

  return (
    <div
      className="fullscreen-overlay qr-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`QR Code for ${active.personName}`}
    >
      <div className="fullscreen-header">
        <div className="fullscreen-header-inner">
          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
            {active.merchant}{' '}
            <span className="mono" style={{ opacity: 0.65, fontSize: '0.82rem' }}>
              ({currentIndex + 1}/{items.length})
            </span>
          </div>
          <button
            type="button"
            id="close-qr-btn"
            className="qr-nav-btn"
            style={{ minHeight: 38, padding: '6px 12px' }}
            onClick={onClose}
            aria-label="Close QR modal"
          >
            <X size={18} />
            <span>Done</span>
          </button>
        </div>
      </div>

      <div className="qr-stage">
        <div>
          <div className="qr-friend-name">{active.personName}</div>
          <div className="qr-amount-hero">{formatCents(active.amountCents)}</div>
        </div>

        <span className="qr-dest-badge">{active.destinationLabel}</span>

        <div className="qr-paper-frame">
          <canvas ref={canvasRef} className="qr-canvas" />
          <div
            style={{
              marginTop: 10,
              fontSize: '0.78rem',
              color: '#58534a',
              fontWeight: 600,
            }}
          >
            Point any iPhone or Android camera to pay
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, width: 'min(330px, 88vw)' }}>
          <button
            type="button"
            className="btn btn-primary btn-full"
            onClick={active.onShare}
          >
            <Share2 size={17} />
            <span>Quick Share / AirDrop</span>
          </button>
          <button
            type="button"
            className="qr-nav-btn"
            onClick={active.onCopy}
            aria-label="Copy link"
            title="Copy link"
          >
            <Copy size={17} />
          </button>
        </div>

        {items.length > 1 && (
          <div className="qr-nav-row">
            <button
              type="button"
              id="qr-prev-btn"
              className="qr-nav-btn"
              disabled={currentIndex <= 0}
              onClick={() => onChangeIndex(currentIndex - 1)}
            >
              <ChevronLeft size={18} />
              <span>Prev</span>
            </button>

            <span className="mono" style={{ fontSize: '0.84rem', opacity: 0.75 }}>
              {currentIndex + 1} of {items.length}
            </span>

            <button
              type="button"
              id="qr-next-btn"
              className="qr-nav-btn"
              disabled={currentIndex >= items.length - 1}
              onClick={() => onChangeIndex(currentIndex + 1)}
            >
              <span>Next</span>
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

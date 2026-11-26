import { useRef } from 'react'
import {
  Camera,
  CheckCircle2,
  Clock,
  ImagePlus,
  KeyRound,
  PenLine,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wallet,
} from 'lucide-react'
import type { AppSettings, ReceiptSplit } from '../types/receipt'
import { formatCents, formatDateLabel } from '../utils/format'
import { hasAnyPaymentHandle } from '../utils/paymentLinks'
import { calculateSplit } from '../utils/splitMath'

interface HomeViewProps {
  settings: AppSettings
  recentSplits: ReceiptSplit[]
  onSelectPhoto: (file: File) => void
  onTrySample: () => void
  onEnterManual: () => void
  onOpenRecent: (split: ReceiptSplit) => void
  onDeleteRecent: (id: string) => void
  onOpenSettings: () => void
}

export function HomeView({
  settings,
  recentSplits,
  onSelectPhoto,
  onTrySample,
  onEnterManual,
  onOpenRecent,
  onDeleteRecent,
  onOpenSettings,
}: HomeViewProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)

  const hasApiKey = Boolean(settings.geminiApiKey.trim())
  const hasHandles = hasAnyPaymentHandle(settings.handles)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) {
      onSelectPhoto(file)
    }
  }

  return (
    <div className="section-stack">
      <section className="hero-card">
        <div className="hero-kicker">
          <ShieldCheck size={14} />
          <span>Private · On-Device · $0 Forever</span>
        </div>
        <h1 className="hero-heading">Snap a receipt, collect to the exact cent.</h1>
        <p className="hero-desc">
          Crop out card digits before scanning with your free Gemini key, assign
          items in seconds, and share QR codes or itemized breakdown links with
          no database or login.
        </p>

        <input
          ref={cameraInputRef}
          id="camera-file-input"
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={handleFileChange}
        />
        <input
          ref={uploadInputRef}
          id="upload-file-input"
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={handleFileChange}
        />

        <div className="capture-grid">
          <button
            type="button"
            id="take-photo-btn"
            className="btn btn-primary capture-btn-primary"
            onClick={() => cameraInputRef.current?.click()}
          >
            <Camera size={20} />
            <span>Snap Receipt Photo</span>
          </button>

          <button
            type="button"
            id="upload-photo-btn"
            className="btn btn-secondary"
            onClick={() => uploadInputRef.current?.click()}
          >
            <ImagePlus size={18} />
            <span>Upload Photo</span>
          </button>

          <button
            type="button"
            id="enter-manual-btn"
            className="btn btn-secondary"
            onClick={onEnterManual}
          >
            <PenLine size={18} />
            <span>Enter Manually</span>
          </button>
        </div>

        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            id="try-sample-btn"
            className="btn btn-soft btn-full"
            onClick={onTrySample}
          >
            <Sparkles size={17} />
            <span>Try Sample Receipt (Marigold Bistro)</span>
          </button>
        </div>

        <div className="setup-strip">
          <div className="setup-chips">
            <span className={`status-chip ${hasApiKey ? 'ok' : 'warn'}`}>
              <KeyRound size={13} />
              {hasApiKey ? 'Gemini Key Ready' : 'No Gemini Key Yet'}
            </span>
            <span className={`status-chip ${hasHandles ? 'ok' : 'warn'}`}>
              <Wallet size={13} />
              {hasHandles ? 'Pay Handles Set' : 'Add Venmo / Zelle'}
            </span>
          </div>
          <button
            type="button"
            id="setup-settings-btn"
            className="btn btn-ghost btn-sm"
            onClick={onOpenSettings}
          >
            <Settings size={15} />
            <span>Configure</span>
          </button>
        </div>
      </section>

      <section className="how-strip" aria-label="How PleasePayMe works">
        <div className="how-step">
          <div className="how-num">01 · PRIVACY CROP</div>
          <div className="how-title">Crop &amp; Blackout First</div>
          <div className="how-copy">
            Hide credit card digits &amp; signatures before anything is sent to Gemini.
          </div>
        </div>
        <div className="how-step">
          <div className="how-num">02 · EXACT CENTS</div>
          <div className="how-title">Tap to Split</div>
          <div className="how-copy">
            Multi-way splits, custom weights, tax &amp; tip rounded cleanly to the penny.
          </div>
        </div>
        <div className="how-step">
          <div className="how-num">03 · TABLE HANDOFF</div>
          <div className="how-title">QR &amp; AirDrop / Quick Share</div>
          <div className="how-copy">
            Zero-DB itemized receipt links with 1-tap Venmo, Cash App, PayPal &amp; Zelle.
          </div>
        </div>
      </section>

      {recentSplits.length > 0 && (
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">
              <Clock size={17} />
              <span>Recent Splits</span>
            </h2>
            <span className="mono" style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
              {recentSplits.length} saved locally
            </span>
          </div>

          <div className="recent-list">
            {recentSplits.map((split) => {
              const summary = calculateSplit(split)
              const debtors = split.people.filter((p) => p.id !== split.payerId)
              const paidCount = debtors.filter((p) => p.paid).length

              return (
                <div key={split.id} className="recent-item">
                  <button
                    type="button"
                    className="recent-main"
                    onClick={() => onOpenRecent(split)}
                  >
                    <div className="recent-merchant">
                      {split.merchant || 'Untitled Receipt'}
                    </div>
                    <div className="recent-meta">
                      <span>{formatDateLabel(split.date) || 'No date'}</span>
                      <span>·</span>
                      <span>{split.people.length} people</span>
                      {debtors.length > 0 && (
                        <>
                          <span>·</span>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                              color:
                                paidCount === debtors.length
                                  ? 'var(--success)'
                                  : 'var(--ink-muted)',
                              fontWeight: paidCount === debtors.length ? 700 : 500,
                            }}
                          >
                            {paidCount === debtors.length && <CheckCircle2 size={12} />}
                            {paidCount}/{debtors.length} paid
                          </span>
                        </>
                      )}
                    </div>
                  </button>

                  <div className="recent-right">
                    <span className="recent-total">
                      {formatCents(summary.grandTotalCents)}
                    </span>
                    <button
                      type="button"
                      className="btn btn-danger-ghost btn-xs"
                      onClick={() => onDeleteRecent(split.id)}
                      aria-label={`Delete ${split.merchant || 'receipt'}`}
                      title="Delete from history"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

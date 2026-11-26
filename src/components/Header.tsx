import { ArrowLeft, Receipt, Settings } from 'lucide-react'

interface HeaderProps {
  showBack?: boolean
  onBack?: () => void
  onHome: () => void
  onOpenSettings: () => void
  isConfigured: boolean
}

export function Header({
  showBack,
  onBack,
  onHome,
  onOpenSettings,
  isConfigured,
}: HeaderProps) {
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {showBack && onBack && (
            <button
              type="button"
              id="header-back-btn"
              className="icon-btn"
              onClick={onBack}
              aria-label="Go back"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <button
            type="button"
            id="header-brand-btn"
            className="brand-btn"
            onClick={onHome}
          >
            <span className="brand-mark" aria-hidden="true">
              <Receipt size={18} strokeWidth={2.3} />
            </span>
            <span>
              <span className="brand-title" style={{ display: 'block' }}>
                PleasePayMe
              </span>
              <span className="brand-sub" style={{ display: 'block' }}>
                Zero-DB Receipt Splitter
              </span>
            </span>
          </button>
        </div>

        <div className="header-actions">
          <button
            type="button"
            id="header-settings-btn"
            className="icon-btn"
            onClick={onOpenSettings}
            aria-label="Open Settings"
            title="Settings (Gemini Key & Payment Handles)"
          >
            <Settings size={18} />
            <span
              className={`status-dot ${isConfigured ? 'ready' : ''}`}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
    </header>
  )
}

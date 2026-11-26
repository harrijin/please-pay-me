import { useState } from 'react'
import {
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  Wallet,
  X,
  XCircle,
} from 'lucide-react'
import type { AppSettings, GeminiModelOption } from '../types/receipt'
import { generateId } from '../utils/format'
import {
  GEMINI_MODELS,
  resolveModelId,
  testGeminiApiKey,
} from '../utils/gemini'
import {
  cleanCashAppHandle,
  cleanPayPalHandle,
  cleanVenmoHandle,
} from '../utils/paymentLinks'

interface SettingsViewProps {
  settings: AppSettings
  onChange: (next: AppSettings) => void
  onClose: () => void
  onNotify: (msg: string) => void
}

export function SettingsView({
  settings,
  onChange,
  onClose,
  onNotify,
}: SettingsViewProps) {
  const [showKey, setShowKey] = useState(false)
  const [testingKey, setTestingKey] = useState(false)
  const [testResult, setTestResult] = useState<{
    ok: boolean
    message: string
  } | null>(null)
  const [friendName, setFriendName] = useState('')
  const [friendVenmo, setFriendVenmo] = useState('')

  const update = (patch: Partial<AppSettings>) => {
    onChange({ ...settings, ...patch })
  }

  const updateHandle = (key: keyof AppSettings['handles'], value: string) => {
    update({
      handles: {
        ...settings.handles,
        [key]: value,
      },
    })
  }

  const handleTestKey = async () => {
    setTestingKey(true)
    setTestResult(null)
    const modelId = resolveModelId(settings)
    const result = await testGeminiApiKey(settings.geminiApiKey, modelId)
    setTestResult(result)
    setTestingKey(false)
  }

  const handleAddFriend = (e: React.FormEvent) => {
    e.preventDefault()
    const name = friendName.trim()
    if (!name) return
    const venmo = cleanVenmoHandle(friendVenmo)
    update({
      savedFriends: [
        ...settings.savedFriends,
        { id: generateId('sf'), name, ...(venmo ? { venmo } : {}) },
      ],
    })
    setFriendName('')
    setFriendVenmo('')
    onNotify(`Saved ${name} to quick-add friends`)
  }

  const handleDeleteFriend = (id: string) => {
    update({
      savedFriends: settings.savedFriends.filter((f) => f.id !== id),
    })
  }

  return (
    <div
      className="fullscreen-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="PleasePayMe Settings"
    >
      <div className="fullscreen-header">
        <div className="fullscreen-header-inner">
          <h1 style={{ margin: 0, fontSize: '1.12rem', fontWeight: 800 }}>
            Settings
          </h1>
          <button
            type="button"
            id="close-settings-btn"
            className="btn btn-primary btn-sm"
            onClick={onClose}
          >
            <X size={16} />
            <span>Done</span>
          </button>
        </div>
      </div>

      <div className="fullscreen-body section-stack">
        {/* Gemini API Key & Model */}
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">
              <KeyRound size={17} />
              <span>Free Gemini Receipt Scanner</span>
            </h2>
            <span className="status-chip ok">
              <ShieldCheck size={12} />
              Local only
            </span>
          </div>

          <label htmlFor="gemini-key-input" className="field-label">
            Google AI Studio API Key
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              id="gemini-key-input"
              type={showKey ? 'text' : 'password'}
              className="input mono"
              placeholder="AIza..."
              autoComplete="off"
              spellCheck={false}
              value={settings.geminiApiKey}
              onChange={(e) => {
                update({ geminiApiKey: e.target.value })
                setTestResult(null)
              }}
            />
            <button
              type="button"
              className="icon-btn"
              style={{ width: 44, height: 44, flexShrink: 0 }}
              onClick={() => setShowKey((s) => !s)}
              aria-label={showKey ? 'Hide API key' : 'Show API key'}
            >
              {showKey ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
          <p className="field-hint">
            Stored strictly in your browser&apos;s <code>localStorage</code> and
            sent only via the <code>x-goog-api-key</code> header to Google&apos;s
            API. <strong>Never included in shared links.</strong>
          </p>

          <div style={{ marginTop: 14 }}>
            <div className="field-label">Gemini Model</div>
            <div className="model-radio-list" role="radiogroup" aria-label="Gemini model">
              {GEMINI_MODELS.map((m) => {
                const selected = settings.geminiModel === m.id
                return (
                  <label
                    key={m.id}
                    className={`model-option ${selected ? 'selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="geminiModel"
                      value={m.id}
                      checked={selected}
                      onChange={() => {
                        update({ geminiModel: m.id as GeminiModelOption })
                        setTestResult(null)
                      }}
                      style={{ marginTop: 3, accentColor: 'var(--accent)' }}
                    />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>
                        <span className="mono">{m.label}</span>
                        <span className="model-badge">{m.badge}</span>
                      </div>
                      <div
                        style={{
                          fontSize: '0.78rem',
                          color: 'var(--ink-secondary)',
                          marginTop: 2,
                        }}
                      >
                        {m.description}
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>

            {settings.geminiModel === 'custom' && (
              <div style={{ marginTop: 10 }}>
                <label htmlFor="custom-model-input" className="field-label">
                  Custom Model ID
                </label>
                <input
                  id="custom-model-input"
                  type="text"
                  className="input mono"
                  placeholder="e.g., gemini-3.5-flash-lite"
                  value={settings.customGeminiModel}
                  onChange={(e) => update({ customGeminiModel: e.target.value })}
                />
              </div>
            )}
          </div>

          <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              id="test-gemini-key-btn"
              className="btn btn-soft btn-sm"
              onClick={handleTestKey}
              disabled={testingKey || !settings.geminiApiKey.trim()}
            >
              {testingKey ? (
                <>
                  <Loader2 size={15} className="spin" />
                  <span>Testing…</span>
                </>
              ) : (
                <>
                  <Sparkles size={15} />
                  <span>Test Key</span>
                </>
              )}
            </button>

            {testResult && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: '0.82rem',
                  fontWeight: 650,
                  color: testResult.ok ? 'var(--success)' : 'var(--danger)',
                }}
              >
                {testResult.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                <span>{testResult.message}</span>
              </span>
            )}
          </div>

          <div className="guide-box">
            <div style={{ fontWeight: 750, color: 'var(--ink-primary)' }}>
              How to get a free Gemini API key (takes ~30 seconds)
            </div>
            <ol>
              <li>
                Open{' '}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  aistudio.google.com/apikey{' '}
                  <ExternalLink size={12} style={{ verticalAlign: '-1px' }} />
                </a>{' '}
                and sign in with any Google account.
              </li>
              <li>
                Tap <strong>Create API key</strong> (the free tier works with no
                credit card required).
              </li>
              <li>
                Copy the key starting with <code>AIza…</code>, paste it above,
                and tap <strong>Test Key</strong>.
              </li>
            </ol>
          </div>
        </section>

        {/* Your Name & Payment Handles */}
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">
              <Wallet size={17} />
              <span>Your Payment Handles</span>
            </h2>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label htmlFor="user-name-input" className="field-label">
              Your Display Name (shown as Payer on shared tickets)
            </label>
            <input
              id="user-name-input"
              type="text"
              className="input"
              placeholder="e.g., Harrison"
              value={settings.userName}
              onChange={(e) => update({ userName: e.target.value })}
            />
          </div>

          <div className="handles-grid">
            <div>
              <label htmlFor="venmo-handle-input" className="field-label">
                Venmo Username
              </label>
              <input
                id="venmo-handle-input"
                type="text"
                className="input mono"
                placeholder="your-username"
                value={settings.handles.venmo}
                onChange={(e) => updateHandle('venmo', e.target.value)}
                onBlur={(e) =>
                  updateHandle('venmo', cleanVenmoHandle(e.target.value))
                }
              />
            </div>

            <div>
              <label htmlFor="cashapp-handle-input" className="field-label">
                Cash App $Cashtag
              </label>
              <input
                id="cashapp-handle-input"
                type="text"
                className="input mono"
                placeholder="yourcashtag"
                value={settings.handles.cashApp}
                onChange={(e) => updateHandle('cashApp', e.target.value)}
                onBlur={(e) =>
                  updateHandle('cashApp', cleanCashAppHandle(e.target.value))
                }
              />
            </div>

            <div>
              <label htmlFor="paypal-handle-input" className="field-label">
                PayPal.Me Username
              </label>
              <input
                id="paypal-handle-input"
                type="text"
                className="input mono"
                placeholder="yourpaypalname"
                value={settings.handles.paypal}
                onChange={(e) => updateHandle('paypal', e.target.value)}
                onBlur={(e) =>
                  updateHandle('paypal', cleanPayPalHandle(e.target.value))
                }
              />
            </div>

            <div>
              <label htmlFor="zelle-handle-input" className="field-label">
                Zelle Email or Phone
              </label>
              <input
                id="zelle-handle-input"
                type="text"
                className="input mono"
                placeholder="you@email.com or 555-0123"
                value={settings.handles.zelle}
                onChange={(e) => updateHandle('zelle', e.target.value)}
              />
            </div>
          </div>
          <p className="field-hint">
            Any handles you fill in will appear as 1-tap pay buttons on your
            friends&apos; receipt breakdown pages.
          </p>
        </section>

        {/* Saved Friends */}
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">
              <Users size={17} />
              <span>Saved Friends ({settings.savedFriends.length})</span>
            </h2>
          </div>

          <form className="add-person-form" onSubmit={handleAddFriend}>
            <input
              type="text"
              className="input input-compact"
              placeholder="Friend name"
              value={friendName}
              onChange={(e) => setFriendName(e.target.value)}
            />
            <input
              type="text"
              className="input input-compact mono"
              placeholder="Venmo @handle (opt.)"
              value={friendVenmo}
              onChange={(e) => setFriendVenmo(e.target.value)}
            />
            <button
              type="submit"
              className="btn btn-secondary btn-sm"
              disabled={!friendName.trim()}
            >
              <UserPlus size={15} />
              <span>Save</span>
            </button>
          </form>

          {settings.savedFriends.length > 0 && (
            <div className="recent-list" style={{ marginTop: 12 }}>
              {settings.savedFriends.map((sf) => (
                <div key={sf.id} className="recent-item" style={{ padding: '9px 12px' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                      {sf.name}
                    </div>
                    {sf.venmo && (
                      <div className="mono" style={{ fontSize: '0.76rem', color: 'var(--ink-muted)' }}>
                        @{sf.venmo}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn btn-danger-ghost btn-xs"
                    onClick={() => handleDeleteFriend(sf.id)}
                    aria-label={`Remove ${sf.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

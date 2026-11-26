import { useState } from 'react'
import {
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  Wallet,
  X,
  XCircle,
} from 'lucide-react'
import type {
  AppSettings,
  GeminiModelOption,
  SavedFriend,
} from '../types/receipt'
import { CURRENCY_OPTIONS, generateId } from '../utils/format'
import {
  GEMINI_MODELS,
  resolveModelId,
  testGeminiApiKey,
} from '../utils/gemini'
import {
  cleanCashAppHandle,
  cleanPayPalHandle,
  cleanVenmoHandle,
  cleanZelleHandle,
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
  const [friendCashApp, setFriendCashApp] = useState('')
  const [friendPayPal, setFriendPayPal] = useState('')
  const [friendZelle, setFriendZelle] = useState('')
  const [editingFriendId, setEditingFriendId] = useState<string | null>(null)

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
    const cashApp = cleanCashAppHandle(friendCashApp)
    const paypal = cleanPayPalHandle(friendPayPal)
    const zelle = cleanZelleHandle(friendZelle)
    update({
      savedFriends: [
        ...settings.savedFriends,
        {
          id: generateId('sf'),
          name,
          ...(venmo ? { venmo } : {}),
          ...(cashApp ? { cashApp } : {}),
          ...(paypal ? { paypal } : {}),
          ...(zelle ? { zelle } : {}),
        },
      ],
    })
    setFriendName('')
    setFriendVenmo('')
    setFriendCashApp('')
    setFriendPayPal('')
    setFriendZelle('')
    onNotify(`Saved ${name} to quick-add friends`)
  }

  const handleUpdateFriend = (id: string, patch: Partial<SavedFriend>) => {
    update({
      savedFriends: settings.savedFriends.map((f) =>
        f.id === id ? { ...f, ...patch } : f
      ),
    })
  }

  const handleDeleteFriend = (id: string) => {
    update({
      savedFriends: settings.savedFriends.filter((f) => f.id !== id),
    })
    if (editingFriendId === id) setEditingFriendId(null)
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

          <form
            onSubmit={handleAddFriend}
            style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            <div>
              <label htmlFor="new-friend-name" className="field-label">
                Friend Name
              </label>
              <input
                id="new-friend-name"
                type="text"
                className="input input-compact"
                placeholder="e.g., Alex"
                value={friendName}
                onChange={(e) => setFriendName(e.target.value)}
              />
            </div>

            <div className="handles-grid">
              <input
                type="text"
                className="input input-compact mono"
                placeholder="Venmo @username (opt.)"
                value={friendVenmo}
                onChange={(e) => setFriendVenmo(e.target.value)}
              />
              <input
                type="text"
                className="input input-compact mono"
                placeholder="Cash App $cashtag (opt.)"
                value={friendCashApp}
                onChange={(e) => setFriendCashApp(e.target.value)}
              />
              <input
                type="text"
                className="input input-compact mono"
                placeholder="PayPal.Me username (opt.)"
                value={friendPayPal}
                onChange={(e) => setFriendPayPal(e.target.value)}
              />
              <input
                type="text"
                className="input input-compact mono"
                placeholder="Zelle email or phone (opt.)"
                value={friendZelle}
                onChange={(e) => setFriendZelle(e.target.value)}
              />
            </div>

            <button
              type="submit"
              className="btn btn-secondary btn-sm"
              disabled={!friendName.trim()}
            >
              <UserPlus size={15} />
              <span>Save Friend</span>
            </button>
          </form>

          {settings.savedFriends.length > 0 && (
            <div className="recent-list" style={{ marginTop: 14 }}>
              {settings.savedFriends.map((sf) => {
                const isEditing = editingFriendId === sf.id
                const badges = [
                  sf.venmo ? `Venmo @${sf.venmo}` : null,
                  sf.cashApp ? `Cash App $${sf.cashApp}` : null,
                  sf.paypal ? `PayPal ${sf.paypal}` : null,
                  sf.zelle ? `Zelle ${sf.zelle}` : null,
                ].filter(Boolean)

                return (
                  <div
                    key={sf.id}
                    className="recent-item"
                    style={{
                      padding: '10px 12px',
                      flexDirection: 'column',
                      alignItems: 'stretch',
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                          {sf.name}
                        </div>
                        {badges.length > 0 && (
                          <div
                            className="mono"
                            style={{
                              fontSize: '0.74rem',
                              color: 'var(--ink-muted)',
                              marginTop: 2,
                              wordBreak: 'break-word',
                            }}
                          >
                            {badges.join(' · ')}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button
                          type="button"
                          className={`btn btn-xs ${isEditing ? 'btn-soft' : 'btn-ghost'}`}
                          onClick={() =>
                            setEditingFriendId((prev) =>
                              prev === sf.id ? null : sf.id
                            )
                          }
                          aria-label={`Edit ${sf.name}`}
                          title="Edit friend handles"
                        >
                          <SlidersHorizontal size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger-ghost btn-xs"
                          onClick={() => handleDeleteFriend(sf.id)}
                          aria-label={`Remove ${sf.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {isEditing && (
                      <div
                        className="handles-grid"
                        style={{
                          paddingTop: 8,
                          borderTop: '1px dashed var(--border-strong)',
                        }}
                      >
                        <div>
                          <label className="field-label">Venmo</label>
                          <input
                            type="text"
                            className="input input-compact mono"
                            placeholder="username"
                            value={sf.venmo ?? ''}
                            onChange={(e) =>
                              handleUpdateFriend(sf.id, { venmo: e.target.value })
                            }
                            onBlur={(e) =>
                              handleUpdateFriend(sf.id, {
                                venmo: cleanVenmoHandle(e.target.value),
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="field-label">Cash App</label>
                          <input
                            type="text"
                            className="input input-compact mono"
                            placeholder="$cashtag"
                            value={sf.cashApp ?? ''}
                            onChange={(e) =>
                              handleUpdateFriend(sf.id, { cashApp: e.target.value })
                            }
                            onBlur={(e) =>
                              handleUpdateFriend(sf.id, {
                                cashApp: cleanCashAppHandle(e.target.value),
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="field-label">PayPal.Me</label>
                          <input
                            type="text"
                            className="input input-compact mono"
                            placeholder="username"
                            value={sf.paypal ?? ''}
                            onChange={(e) =>
                              handleUpdateFriend(sf.id, { paypal: e.target.value })
                            }
                            onBlur={(e) =>
                              handleUpdateFriend(sf.id, {
                                paypal: cleanPayPalHandle(e.target.value),
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="field-label">Zelle</label>
                          <input
                            type="text"
                            className="input input-compact mono"
                            placeholder="email or phone"
                            value={sf.zelle ?? ''}
                            onChange={(e) =>
                              handleUpdateFriend(sf.id, { zelle: e.target.value })
                            }
                            onBlur={(e) =>
                              handleUpdateFriend(sf.id, {
                                zelle: cleanZelleHandle(e.target.value),
                              })
                            }
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Tucked-away Advanced section */}
        <details className="advanced-card">
          <summary className="advanced-summary">
            <span>Advanced</span>
            <span className="mono" style={{ fontSize: '0.76rem', color: 'var(--ink-muted)' }}>
              Default currency: {settings.defaultCurrency || 'USD'}
            </span>
          </summary>
          <div style={{ marginTop: 12 }}>
            <label htmlFor="default-currency-select" className="field-label">
              Default Currency
            </label>
            <select
              id="default-currency-select"
              className="select"
              value={settings.defaultCurrency || 'USD'}
              onChange={(e) => update({ defaultCurrency: e.target.value })}
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} ({c.symbol.trim()}) — {c.name}
                </option>
              ))}
            </select>
            <p className="field-hint">
              Used for new receipts when a scanned receipt doesn&apos;t specify a
              currency. You can also override currency per receipt under
              Advanced on the Assign Items screen.
            </p>
          </div>
        </details>
      </div>
    </div>
  )
}

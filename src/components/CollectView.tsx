import { useMemo, useState } from 'react'
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Crown,
  ExternalLink,
  Eye,
  QrCode,
  Send,
  Settings,
  Share2,
} from 'lucide-react'
import type {
  AppSettings,
  Person,
  PersonBreakdown,
  QRDestination,
  ReceiptSplit,
  SharePayload,
  SplitSummary,
} from '../types/receipt'
import { formatCents, getInitials } from '../utils/format'
import {
  buildCashAppPayUrl,
  buildPaymentNote,
  buildPayPalPayUrl,
  buildVenmoChargeUrl,
  buildVenmoPayUrl,
  cleanCashAppHandle,
  cleanPayPalHandle,
  cleanVenmoHandle,
  cleanZelleHandle,
  hasAnyPaymentHandle,
  resolveDestinationUrl,
  resolvePayerHandles,
} from '../utils/paymentLinks'
import { buildShareUrl, createSharePayload } from '../utils/shareCodec'
import { QRModal } from './QRModal'

interface CollectViewProps {
  receipt: ReceiptSplit
  summary: SplitSummary
  settings: AppSettings
  onTogglePaid: (personId: string) => void
  onUpdatePerson: (personId: string, patch: Partial<Person>) => void
  onBackToAssign: () => void
  onOpenSettings: () => void
  onPreviewBreakdown: (payload: SharePayload, isPayingSelf: boolean) => void
  onNotify: (msg: string) => void
}

export function CollectView({
  receipt,
  summary,
  settings,
  onTogglePaid,
  onUpdatePerson,
  onBackToAssign,
  onOpenSettings,
  onPreviewBreakdown,
  onNotify,
}: CollectViewProps) {
  const [destination, setDestination] = useState<QRDestination>('breakdown')
  const [expandedPersonId, setExpandedPersonId] = useState<string | null>(null)
  const [qrFriendIndex, setQrFriendIndex] = useState<number | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [editingPayerHandles, setEditingPayerHandles] = useState(false)

  const payer =
    receipt.people.find((p) => p.id === receipt.payerId) ?? receipt.people[0]
  const payerName = payer?.name || settings.userName || 'Me'

  const { handles: payerHandles, isPayerSelf } = useMemo(
    () => resolvePayerHandles(payer, receipt, settings),
    [payer, receipt, settings]
  )

  const friendBreakdowns = useMemo(
    () => summary.breakdowns.filter((b) => !b.isPayer),
    [summary.breakdowns]
  )
  const payerBreakdown = useMemo(
    () => summary.breakdowns.find((b) => b.isPayer) ?? null,
    [summary.breakdowns]
  )

  const totalToCollectCents = friendBreakdowns.reduce(
    (sum, b) => sum + b.totalCents,
    0
  )
  const collectedCents = friendBreakdowns
    .filter((b) => b.person.paid)
    .reduce((sum, b) => sum + b.totalCents, 0)
  const remainingCents = Math.max(0, totalToCollectCents - collectedCents)

  const note = buildPaymentNote(receipt.merchant, receipt.date)
  const hasHandles = hasAnyPaymentHandle(payerHandles)

  const getFriendLinks = (b: PersonBreakdown) => {
    const payload = createSharePayload(receipt, b, payerName, payerHandles)
    const breakdownUrl = buildShareUrl(payload)
    const resolved = resolveDestinationUrl({
      destination,
      breakdownUrl,
      handles: payerHandles,
      amountCents: b.totalCents,
      note,
    })
    const venmoChargeUrl = buildVenmoChargeUrl(
      b.person.venmo,
      b.totalCents,
      note
    )
    const directPayPayerUrl =
      (payerHandles.venmo && buildVenmoPayUrl(payerHandles.venmo, b.totalCents, note)) ||
      (payerHandles.cashApp && buildCashAppPayUrl(payerHandles.cashApp, b.totalCents)) ||
      (payerHandles.paypal && buildPayPalPayUrl(payerHandles.paypal, b.totalCents)) ||
      null
    return { payload, breakdownUrl, resolved, venmoChargeUrl, directPayPayerUrl }
  }

  const handleCopy = async (url: string, personId: string, label: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(personId)
      onNotify(`Copied ${label}`)
      window.setTimeout(() => {
        setCopiedId((curr) => (curr === personId ? null : curr))
      }, 2000)
    } catch {
      onNotify('Could not copy automatically — try Share instead')
    }
  }

  const handleNativeShare = async (b: PersonBreakdown) => {
    const { resolved } = getFriendLinks(b)
    const shareTitle = `${receipt.merchant || 'Receipt'} — ${formatCents(b.totalCents)}`
    const shareText = `Hey ${b.person.name}, here's your share (${formatCents(
      b.totalCents
    )}) for ${receipt.merchant || 'our bill'}:`

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: resolved.url,
        })
        return
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
      }
    }

    await handleCopy(resolved.url, b.person.id, `${b.person.name}'s link`)
  }

  const destOptions: Array<{
    id: QRDestination
    label: string
    configured: boolean
  }> = [
    { id: 'breakdown', label: 'Breakdown Page', configured: true },
    {
      id: 'venmo',
      label: 'Direct: Venmo',
      configured: Boolean(cleanVenmoHandle(payerHandles.venmo)),
    },
    {
      id: 'cashapp',
      label: 'Direct: Cash App',
      configured: Boolean(cleanCashAppHandle(payerHandles.cashApp)),
    },
    {
      id: 'paypal',
      label: 'Direct: PayPal',
      configured: Boolean(cleanPayPalHandle(payerHandles.paypal)),
    },
  ]

  const qrItems = useMemo(
    () =>
      friendBreakdowns.map((b) => {
        const { resolved } = getFriendLinks(b)
        return {
          personName: b.person.name,
          amountCents: b.totalCents,
          url: resolved.url,
          destinationLabel: resolved.label,
          merchant: receipt.merchant || 'Shared Receipt',
          onShare: () => handleNativeShare(b),
          onCopy: () => handleCopy(resolved.url, b.person.id, `${b.person.name}'s link`),
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [friendBreakdowns, destination, payerHandles, receipt.merchant, receipt.date]
  )

  return (
    <div className="section-stack">
      <div className="step-bar">
        <div className="step-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected="false"
            className="step-tab"
            onClick={onBackToAssign}
          >
            1. Assign Items
          </button>
          <button
            type="button"
            role="tab"
            aria-selected="true"
            className="step-tab active"
          >
            2. Collect &amp; Share
          </button>
        </div>

        {friendBreakdowns.length > 0 && (
          <button
            type="button"
            id="show-all-qr-btn"
            className="btn btn-primary btn-sm"
            onClick={() => setQrFriendIndex(0)}
          >
            <QrCode size={15} />
            <span>Table QR</span>
          </button>
        )}
      </div>

      {/* Summary Metrics */}
      <section className="card">
        <div className="card-header" style={{ marginBottom: 12 }}>
          <div>
            <h1 className="card-title" style={{ fontSize: '1.12rem' }}>
              {receipt.merchant || 'Shared Receipt'}
            </h1>
            <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', marginTop: 2 }}>
              Paid by <strong>{payerName}</strong>
              {summary.unassignedItemIds.length > 0 && (
                <span style={{ color: 'var(--privacy-ink)', marginLeft: 8 }}>
                  · {summary.unassignedItemIds.length} unassigned item(s)
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="collect-summary-grid">
          <div className="metric-box">
            <div className="metric-label">Bill Total</div>
            <div className="metric-value">
              {formatCents(summary.grandTotalCents)}
            </div>
          </div>
          <div className="metric-box">
            <div className="metric-label">Collected</div>
            <div className="metric-value accent">
              {formatCents(collectedCents)}
            </div>
          </div>
          <div className="metric-box">
            <div className="metric-label">Remaining</div>
            <div className="metric-value">
              {formatCents(remainingCents)}
            </div>
          </div>
        </div>
      </section>

      {/* QR & Share Destination Selector */}
      <section className="card">
        <div className="card-header" style={{ marginBottom: 10 }}>
          <h2 className="card-title">QR &amp; Share Destination</h2>
          {isPayerSelf && !hasHandles && (
            <button
              type="button"
              className="btn btn-soft btn-xs"
              onClick={onOpenSettings}
            >
              <Settings size={13} />
              <span>Add Handles</span>
            </button>
          )}
        </div>

        {!isPayerSelf && payer && (
          <div
            style={{
              marginBottom: 12,
              padding: 12,
              borderRadius: 'var(--radius-md)',
              background: 'var(--surface-subtle)',
              border: '1px solid var(--border-strong)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                marginBottom: !hasHandles || editingPayerHandles ? 10 : 0,
              }}
            >
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--ink-primary)' }}>
                {payerName}&apos;s Payment Handles
                <span style={{ fontWeight: 500, color: 'var(--ink-muted)', marginLeft: 6 }}>
                  (payments go to {payerName})
                </span>
              </span>
              {hasHandles && (
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => setEditingPayerHandles((v) => !v)}
                >
                  {editingPayerHandles ? 'Done' : 'Edit'}
                </button>
              )}
            </div>

            {(!hasHandles || editingPayerHandles) && (
              <div className="handles-grid">
                <div>
                  <label htmlFor="payer-venmo-inline" className="field-label">
                    Venmo
                  </label>
                  <input
                    id="payer-venmo-inline"
                    type="text"
                    className="input input-compact mono"
                    placeholder="@username"
                    value={payer.venmo ?? ''}
                    onChange={(e) =>
                      onUpdatePerson(payer.id, { venmo: e.target.value })
                    }
                    onBlur={(e) =>
                      onUpdatePerson(payer.id, {
                        venmo: cleanVenmoHandle(e.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <label htmlFor="payer-cashapp-inline" className="field-label">
                    Cash App
                  </label>
                  <input
                    id="payer-cashapp-inline"
                    type="text"
                    className="input input-compact mono"
                    placeholder="$cashtag"
                    value={payer.cashApp ?? ''}
                    onChange={(e) =>
                      onUpdatePerson(payer.id, { cashApp: e.target.value })
                    }
                    onBlur={(e) =>
                      onUpdatePerson(payer.id, {
                        cashApp: cleanCashAppHandle(e.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <label htmlFor="payer-paypal-inline" className="field-label">
                    PayPal.Me
                  </label>
                  <input
                    id="payer-paypal-inline"
                    type="text"
                    className="input input-compact mono"
                    placeholder="username"
                    value={payer.paypal ?? ''}
                    onChange={(e) =>
                      onUpdatePerson(payer.id, { paypal: e.target.value })
                    }
                    onBlur={(e) =>
                      onUpdatePerson(payer.id, {
                        paypal: cleanPayPalHandle(e.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <label htmlFor="payer-zelle-inline" className="field-label">
                    Zelle
                  </label>
                  <input
                    id="payer-zelle-inline"
                    type="text"
                    className="input input-compact mono"
                    placeholder="email or phone"
                    value={payer.zelle ?? ''}
                    onChange={(e) =>
                      onUpdatePerson(payer.id, { zelle: e.target.value })
                    }
                    onBlur={(e) =>
                      onUpdatePerson(payer.id, {
                        zelle: cleanZelleHandle(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="dest-pills" role="radiogroup" aria-label="QR and Share Destination">
          {destOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={destination === opt.id}
              className={`dest-pill ${destination === opt.id ? 'active' : ''}`}
              onClick={() => {
                setDestination(opt.id)
                if (!opt.configured) {
                  onNotify(
                    isPayerSelf
                      ? `Add your ${opt.label.replace('Direct: ', '')} handle in Settings`
                      : `Add ${payerName}'s ${opt.label.replace('Direct: ', '')} handle above first`
                  )
                }
              }}
            >
              {opt.label}
              {!opt.configured && ' *'}
            </button>
          ))}
        </div>

        <p className="field-hint" style={{ marginBottom: 0 }}>
          {destination === 'breakdown'
            ? `Opens a zero-database itemized receipt ticket (#s=…) paying ${payerName}.`
            : `Scans or shares directly into the selected payment app to pay ${payerName}.`}
        </p>
      </section>

      {/* Friend Collection Cards */}
      {friendBreakdowns.length === 0 ? (
        <section className="card" style={{ textAlign: 'center', padding: 28 }}>
          <p style={{ margin: '0 0 12px', color: 'var(--ink-secondary)' }}>
            Add friends in Step 1 to generate QR codes and shareable payment links.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onBackToAssign}
          >
            Back to Assign Items
          </button>
        </section>
      ) : (
        friendBreakdowns.map((b, idx) => {
          const { payload, resolved, venmoChargeUrl, directPayPayerUrl } =
            getFriendLinks(b)
          const isExpanded = expandedPersonId === b.person.id
          const isPaid = Boolean(b.person.paid)

          return (
            <article
              key={b.person.id}
              className={`friend-collect-card ${isPaid ? 'paid' : ''}`}
            >
              <div className="friend-collect-head">
                <div className="friend-identity">
                  <span
                    className="friend-avatar-lg"
                    style={{ backgroundColor: b.person.color }}
                  >
                    {getInitials(b.person.name)}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span className="friend-name">{b.person.name}</span>
                      {isPaid && (
                        <span className="paid-badge">
                          <CheckCircle2 size={12} />
                          Paid
                        </span>
                      )}
                    </div>
                    <div className="friend-sub">
                      {b.items.length} item{b.items.length === 1 ? '' : 's'}
                      {b.person.venmo ? ` · @${b.person.venmo}` : ''}
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div className={`friend-amount ${isPaid ? 'paid' : ''}`}>
                    {formatCents(b.totalCents)}
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    style={{ padding: '2px 6px', minHeight: 24 }}
                    onClick={() =>
                      setExpandedPersonId((prev) =>
                        prev === b.person.id ? null : b.person.id
                      )
                    }
                  >
                    <span>Details</span>
                    {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="mini-breakdown">
                  {b.items.length === 0 ? (
                    <div style={{ color: 'var(--ink-muted)' }}>No items assigned</div>
                  ) : (
                    b.items.map((line) => (
                      <div key={line.itemId} className="mini-line">
                        <span>
                          {line.name}
                          {line.splitLabel && (
                            <span className="split-fraction-pill">{line.splitLabel}</span>
                          )}
                        </span>
                        <span className="mono">{formatCents(line.shareCents)}</span>
                      </div>
                    ))
                  )}
                  <hr className="receipt-divider" style={{ margin: '8px 0' }} />
                  <div className="mini-line" style={{ color: 'var(--ink-muted)' }}>
                    <span>Subtotal</span>
                    <span className="mono">{formatCents(b.subtotalCents)}</span>
                  </div>
                  {b.taxCents > 0 && (
                    <div className="mini-line" style={{ color: 'var(--ink-muted)' }}>
                      <span>Tax</span>
                      <span className="mono">{formatCents(b.taxCents)}</span>
                    </div>
                  )}
                  {b.tipCents > 0 && (
                    <div className="mini-line" style={{ color: 'var(--ink-muted)' }}>
                      <span>Tip</span>
                      <span className="mono">{formatCents(b.tipCents)}</span>
                    </div>
                  )}
                  {b.extraFeeCents > 0 && (
                    <div className="mini-line" style={{ color: 'var(--ink-muted)' }}>
                      <span>Fee</span>
                      <span className="mono">{formatCents(b.extraFeeCents)}</span>
                    </div>
                  )}
                  {b.discountCents > 0 && (
                    <div className="mini-line" style={{ color: 'var(--success)' }}>
                      <span>Discount</span>
                      <span className="mono">-{formatCents(b.discountCents)}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="friend-actions-grid">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setQrFriendIndex(idx)}
                >
                  <QrCode size={16} />
                  <span>Show QR</span>
                </button>

                <button
                  type="button"
                  className="btn btn-soft btn-sm"
                  onClick={() => handleNativeShare(b)}
                >
                  <Share2 size={16} />
                  <span>Quick Share</span>
                </button>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    handleCopy(resolved.url, b.person.id, `${b.person.name}'s link`)
                  }
                >
                  {copiedId === b.person.id ? <Check size={15} /> : <Copy size={15} />}
                  <span>{copiedId === b.person.id ? 'Copied!' : 'Copy Link'}</span>
                </button>

                {isPayerSelf ? (
                  <a
                    href={venmoChargeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary btn-sm"
                  >
                    <Send size={15} />
                    <span>Charge Venmo</span>
                    <ExternalLink size={12} style={{ opacity: 0.65 }} />
                  </a>
                ) : directPayPayerUrl ? (
                  <a
                    href={directPayPayerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary btn-sm"
                  >
                    <Send size={15} />
                    <span>Pay {payerName}</span>
                    <ExternalLink size={12} style={{ opacity: 0.65 }} />
                  </a>
                ) : (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onPreviewBreakdown(payload, false)}
                  >
                    <Send size={15} />
                    <span>Pay {payerName}</span>
                  </button>
                )}
              </div>

              <div
                style={{
                  marginTop: 10,
                  paddingTop: 10,
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => onPreviewBreakdown(payload, isPayerSelf)}
                >
                  <Eye size={14} />
                  <span>Preview Ticket</span>
                </button>

                <button
                  type="button"
                  className={`btn btn-xs ${isPaid ? 'btn-soft' : 'btn-secondary'}`}
                  onClick={() => onTogglePaid(b.person.id)}
                >
                  <CheckCircle2 size={14} />
                  <span>{isPaid ? 'Paid (Undo)' : 'Mark Paid'}</span>
                </button>
              </div>
            </article>
          )
        })
      )}

      {/* Payer's Own Share */}
      {payerBreakdown && (
        <article className="friend-collect-card" style={{ opacity: 0.92 }}>
          <div className="friend-collect-head">
            <div className="friend-identity">
              <span
                className="friend-avatar-lg"
                style={{ backgroundColor: payerBreakdown.person.color }}
              >
                {getInitials(payerBreakdown.person.name)}
              </span>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="friend-name">{payerBreakdown.person.name}</span>
                  <span className="payer-badge">
                    <Crown size={11} />
                    Paid Bill
                  </span>
                </div>
                <div className="friend-sub">
                  Own share ({payerBreakdown.items.length} item
                  {payerBreakdown.items.length === 1 ? '' : 's'})
                </div>
              </div>
            </div>
            <div className="friend-amount">
              {formatCents(payerBreakdown.totalCents)}
            </div>
          </div>
        </article>
      )}

      {qrFriendIndex !== null && qrItems[qrFriendIndex] && (
        <QRModal
          items={qrItems}
          currentIndex={qrFriendIndex}
          onChangeIndex={setQrFriendIndex}
          onClose={() => setQrFriendIndex(null)}
        />
      )}
    </div>
  )
}

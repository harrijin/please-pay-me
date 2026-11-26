import { useState } from 'react'
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Receipt,
  Sparkles,
} from 'lucide-react'
import type { SharePayload } from '../types/receipt'
import {
  centsToPlainAmount,
  formatCents,
  formatDateLabel,
} from '../utils/format'
import {
  buildCashAppPayUrl,
  buildPaymentNote,
  buildPayPalPayUrl,
  buildVenmoPayUrl,
} from '../utils/paymentLinks'

interface BreakdownViewProps {
  payload: SharePayload
  isHostPreview?: boolean
  onExit: () => void
  onNotify: (msg: string) => void
}

export function BreakdownView({
  payload,
  isHostPreview = false,
  onExit,
  onNotify,
}: BreakdownViewProps) {
  const [copiedField, setCopiedField] = useState<'zelle' | 'amount' | 'venmo' | null>(null)

  const note = buildPaymentNote(payload.m, payload.d)
  const venmoUrl = payload.h.v
    ? buildVenmoPayUrl(payload.h.v, payload.g, note)
    : null
  const cashAppUrl = payload.h.c
    ? buildCashAppPayUrl(payload.h.c, payload.g)
    : null
  const paypalUrl = payload.h.p
    ? buildPayPalPayUrl(payload.h.p, payload.g)
    : null
  const zelleHandle = payload.h.z?.trim() || ''

  const hasAnyPayMethod = Boolean(
    venmoUrl || cashAppUrl || paypalUrl || zelleHandle
  )

  const copyValue = async (
    value: string,
    field: 'zelle' | 'amount' | 'venmo',
    label: string
  ) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedField(field)
      onNotify(`Copied ${label}`)
      window.setTimeout(() => {
        setCopiedField((prev) => (prev === field ? null : prev))
      }, 2000)
    } catch {
      onNotify(`Copy manually: ${value}`)
    }
  }

  return (
    <main className="breakdown-shell">
      {isHostPreview && (
        <div
          style={{
            width: '100%',
            maxWidth: 480,
            marginBottom: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onExit}
          >
            <ArrowLeft size={15} />
            <span>Back to Collect</span>
          </button>
          <span className="status-chip ok">Friend Preview</span>
        </div>
      )}

      <article className="receipt-ticket" aria-label="Receipt share breakdown">
        <div className="receipt-ticket-top">
          <div className="ticket-kicker">
            <Receipt size={13} />
            <span>PleasePayMe Breakdown</span>
          </div>
          <h1 className="ticket-merchant">{payload.m}</h1>
          <div className="ticket-meta">
            {payload.d ? `${formatDateLabel(payload.d)} · ` : ''}
            Split for <strong>{payload.f}</strong> · Paid by{' '}
            <strong>{payload.p}</strong>
          </div>

          <div className="ticket-due-box">
            <div className="ticket-due-label">
              {payload.f}&apos;s Total Due to {payload.p}
            </div>
            <div className="ticket-due-amount">{formatCents(payload.g)}</div>
          </div>
        </div>

        <div className="ticket-perforation" aria-hidden="true">
          <span className="ticket-notch left" />
          <span className="ticket-notch right" />
        </div>

        <div className="receipt-ticket-body">
          <div
            style={{
              fontSize: '0.73rem',
              fontWeight: 750,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              color: 'var(--ink-muted)',
              marginBottom: 6,
            }}
          >
            Itemized Share
          </div>

          {payload.i.length === 0 ? (
            <div style={{ color: 'var(--ink-muted)', fontSize: '0.88rem' }}>
              No line items listed.
            </div>
          ) : (
            payload.i.map(([name, itemTotalCents, shareCents, splitLabel], idx) => (
              <div key={`${name}-${idx}`} className="ticket-line">
                <div>
                  <span className="ticket-item-name">{name}</span>
                  {splitLabel && (
                    <span
                      className="split-fraction-pill"
                      title={`Your share of ${formatCents(itemTotalCents)}`}
                    >
                      {splitLabel} of {formatCents(itemTotalCents)}
                    </span>
                  )}
                </div>
                <span className="mono" style={{ fontWeight: 650 }}>
                  {formatCents(shareCents)}
                </span>
              </div>
            ))
          )}

          <div className="ticket-sub-rows">
            <div className="totals-row">
              <span>Items Subtotal</span>
              <span className="mono">{formatCents(payload.s)}</span>
            </div>
            {payload.x > 0 && (
              <div className="totals-row">
                <span>Tax</span>
                <span className="mono">{formatCents(payload.x)}</span>
              </div>
            )}
            {payload.t > 0 && (
              <div className="totals-row">
                <span>Tip</span>
                <span className="mono">{formatCents(payload.t)}</span>
              </div>
            )}
            {(payload.e ?? 0) > 0 && (
              <div className="totals-row">
                <span>Extra Fee</span>
                <span className="mono">{formatCents(payload.e ?? 0)}</span>
              </div>
            )}
            {(payload.k ?? 0) > 0 && (
              <div className="totals-row" style={{ color: 'var(--success)' }}>
                <span>Discount</span>
                <span className="mono">-{formatCents(payload.k ?? 0)}</span>
              </div>
            )}
            <div className="totals-row grand">
              <span>Total</span>
              <span className="mono">{formatCents(payload.g)}</span>
            </div>
          </div>
        </div>

        <div className="ticket-pay-section">
          <div
            style={{
              fontSize: '0.75rem',
              fontWeight: 750,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              color: 'var(--ink-secondary)',
              marginBottom: 10,
            }}
          >
            Pay {payload.p} Now
          </div>

          {hasAnyPayMethod ? (
            <div className="pay-buttons-stack">
              {venmoUrl && (
                <div>
                  <a
                    href={venmoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pay-btn venmo"
                  >
                    <span>Pay with Venmo (@{payload.h.v})</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span className="mono">{formatCents(payload.g)}</span>
                      <ExternalLink size={15} />
                    </span>
                  </a>
                  <div className="venmo-sub-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() =>
                        copyValue(`@${payload.h.v}`, 'venmo', `Venmo @${payload.h.v}`)
                      }
                    >
                      {copiedField === 'venmo' ? <Check size={12} /> : <Copy size={12} />}
                      <span>{copiedField === 'venmo' ? 'Copied handle' : 'Copy @handle'}</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() =>
                        copyValue(
                          centsToPlainAmount(payload.g),
                          'amount',
                          `amount ${formatCents(payload.g)}`
                        )
                      }
                    >
                      {copiedField === 'amount' ? <Check size={12} /> : <Copy size={12} />}
                      <span>{copiedField === 'amount' ? 'Copied amount' : 'Copy amount'}</span>
                    </button>
                  </div>
                  {isHostPreview && (
                    <p className="field-hint" style={{ margin: '4px 2px 0' }}>
                      Preview note: Venmo&apos;s app won&apos;t open a payment to your own
                      account — test this button from a friend&apos;s phone.
                    </p>
                  )}
                </div>
              )}

              {cashAppUrl && (
                <a
                  href={cashAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pay-btn cashapp"
                >
                  <span>Pay with Cash App (${payload.h.c})</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span className="mono">{formatCents(payload.g)}</span>
                    <ExternalLink size={15} />
                  </span>
                </a>
              )}

              {paypalUrl && (
                <a
                  href={paypalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pay-btn paypal"
                >
                  <span>Pay with PayPal.Me ({payload.h.p})</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span className="mono">{formatCents(payload.g)}</span>
                    <ExternalLink size={15} />
                  </span>
                </a>
              )}

              {zelleHandle && (
                <div className="zelle-card">
                  <div className="zelle-header">
                    <span className="zelle-title">Zelle</span>
                    <span className="mono" style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                      {formatCents(payload.g)}
                    </span>
                  </div>
                  <div className="zelle-handle">{zelleHandle}</div>
                  <div className="zelle-actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => copyValue(zelleHandle, 'zelle', 'Zelle handle')}
                    >
                      {copiedField === 'zelle' ? <Check size={14} /> : <Copy size={14} />}
                      <span>{copiedField === 'zelle' ? 'Copied' : 'Copy Zelle'}</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() =>
                        copyValue(
                          centsToPlainAmount(payload.g),
                          'amount',
                          `amount ${formatCents(payload.g)}`
                        )
                      }
                    >
                      {copiedField === 'amount' ? <Check size={14} /> : <Copy size={14} />}
                      <span>{copiedField === 'amount' ? 'Copied' : 'Copy Amount'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div
              style={{
                padding: 14,
                borderRadius: 'var(--radius-md)',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                fontSize: '0.86rem',
                color: 'var(--ink-secondary)',
              }}
            >
              {payload.p} hasn&apos;t added payment handles yet — pay{' '}
              <strong className="mono">{formatCents(payload.g)}</strong> directly
              or copy the amount below.
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm btn-full"
                  onClick={() =>
                    copyValue(
                      centsToPlainAmount(payload.g),
                      'amount',
                      `amount ${formatCents(payload.g)}`
                    )
                  }
                >
                  {copiedField === 'amount' ? <Check size={14} /> : <Copy size={14} />}
                  <span>Copy {formatCents(payload.g)}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </article>

      {!isHostPreview && (
        <div style={{ marginTop: 18, textAlign: 'center' }}>
          <button
            type="button"
            id="start-own-split-btn"
            className="btn btn-soft btn-sm"
            onClick={onExit}
          >
            <Sparkles size={15} />
            <span>Split your own receipt with PleasePayMe</span>
          </button>
          <p
            style={{
              fontSize: '0.75rem',
              color: 'var(--ink-muted)',
              marginTop: 8,
            }}
          >
            100% client-side breakdown · encoded directly in this link · zero database
          </p>
        </div>
      )}
    </main>
  )
}

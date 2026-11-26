import type { PaymentHandles, QRDestination } from '../types/receipt'
import { centsToPlainAmount } from './format'

export function cleanVenmoHandle(raw?: string): string {
  if (!raw) return ''
  return raw
    .trim()
    .replace(/^https?:\/\/(www\.)?venmo\.com\/u?\//i, '')
    .replace(/^@+/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
}

export function cleanCashAppHandle(raw?: string): string {
  if (!raw) return ''
  return raw
    .trim()
    .replace(/^https?:\/\/(www\.)?cash\.app\/\$/i, '')
    .replace(/^\$+/, '')
    .replace(/[^a-zA-Z0-9_]/g, '')
}

export function cleanPayPalHandle(raw?: string): string {
  if (!raw) return ''
  return raw
    .trim()
    .replace(/^https?:\/\/(www\.)?paypal\.me\//i, '')
    .replace(/^@+/, '')
    .replace(/[^a-zA-Z0-9._-]/g, '')
}

export function cleanZelleHandle(raw?: string): string {
  if (!raw) return ''
  return raw.trim()
}

export function buildVenmoPayUrl(
  recipientHandle: string,
  amountCents: number,
  note: string
): string | null {
  const user = cleanVenmoHandle(recipientHandle)
  if (!user) return null
  const amount = centsToPlainAmount(amountCents)
  const params = new URLSearchParams({
    txn: 'pay',
    amount,
    note,
  })
  return `https://venmo.com/${encodeURIComponent(user)}?${params.toString()}`
}

export function buildVenmoChargeUrl(
  friendHandle: string | undefined,
  amountCents: number,
  note: string
): string {
  const friend = cleanVenmoHandle(friendHandle)
  const amount = centsToPlainAmount(amountCents)
  const params = new URLSearchParams({
    txn: 'charge',
    amount,
    note,
  })
  if (friend) {
    return `https://venmo.com/${encodeURIComponent(friend)}?${params.toString()}`
  }
  return `https://venmo.com/?${params.toString()}`
}

export function buildCashAppPayUrl(
  cashtag: string,
  amountCents: number
): string | null {
  const clean = cleanCashAppHandle(cashtag)
  if (!clean) return null
  return `https://cash.app/$${encodeURIComponent(clean)}/${centsToPlainAmount(amountCents)}`
}

export function buildPayPalPayUrl(
  paypalUser: string,
  amountCents: number
): string | null {
  const clean = cleanPayPalHandle(paypalUser)
  if (!clean) return null
  return `https://paypal.me/${encodeURIComponent(clean)}/${centsToPlainAmount(amountCents)}USD`
}

export function buildPaymentNote(merchant: string, date?: string): string {
  const place = merchant.trim() || 'Shared Receipt'
  return date ? `${place} (${date}) via PleasePayMe` : `${place} via PleasePayMe`
}

export function hasAnyPaymentHandle(handles: PaymentHandles): boolean {
  return Boolean(
    cleanVenmoHandle(handles.venmo) ||
      cleanCashAppHandle(handles.cashApp) ||
      cleanPayPalHandle(handles.paypal) ||
      cleanZelleHandle(handles.zelle)
  )
}

export function resolveDestinationUrl(options: {
  destination: QRDestination
  breakdownUrl: string
  handles: PaymentHandles
  amountCents: number
  note: string
}): { url: string; label: string; isFallback: boolean } {
  const { destination, breakdownUrl, handles, amountCents, note } = options

  if (destination === 'venmo') {
    const venmoUrl = buildVenmoPayUrl(handles.venmo, amountCents, note)
    if (venmoUrl) {
      return { url: venmoUrl, label: 'Direct to Venmo', isFallback: false }
    }
    return {
      url: breakdownUrl,
      label: 'Breakdown Page (set Venmo handle in Settings)',
      isFallback: true,
    }
  }

  if (destination === 'cashapp') {
    const cashUrl = buildCashAppPayUrl(handles.cashApp, amountCents)
    if (cashUrl) {
      return { url: cashUrl, label: 'Direct to Cash App', isFallback: false }
    }
    return {
      url: breakdownUrl,
      label: 'Breakdown Page (set Cash App tag in Settings)',
      isFallback: true,
    }
  }

  if (destination === 'paypal') {
    const paypalUrl = buildPayPalPayUrl(handles.paypal, amountCents)
    if (paypalUrl) {
      return { url: paypalUrl, label: 'Direct to PayPal.Me', isFallback: false }
    }
    return {
      url: breakdownUrl,
      label: 'Breakdown Page (set PayPal.Me in Settings)',
      isFallback: true,
    }
  }

  return { url: breakdownUrl, label: 'Receipt Breakdown Page', isFallback: false }
}

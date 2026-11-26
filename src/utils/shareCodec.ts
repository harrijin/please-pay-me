import LZString from 'lz-string'
import type {
  PaymentHandles,
  PersonBreakdown,
  ReceiptSplit,
  SharePayload,
} from '../types/receipt'
import { DEFAULT_CURRENCY, normalizeCurrencyCode } from './format'
import {
  cleanCashAppHandle,
  cleanPayPalHandle,
  cleanVenmoHandle,
  cleanZelleHandle,
} from './paymentLinks'

export const SHARE_HASH_PREFIX = '#s='

/**
 * Builds a minimal, privacy-safe share payload for one friend.
 * Whitelists only receipt breakdown fields and payment handles.
 * NEVER includes API keys, saved friends, or other diners.
 */
export function createSharePayload(
  receipt: ReceiptSplit,
  breakdown: PersonBreakdown,
  payerName: string,
  handles: PaymentHandles
): SharePayload {
  const safeHandles: SharePayload['h'] = {}
  const venmo = cleanVenmoHandle(handles.venmo)
  const cashApp = cleanCashAppHandle(handles.cashApp)
  const paypal = cleanPayPalHandle(handles.paypal)
  const zelle = cleanZelleHandle(handles.zelle)

  if (venmo) safeHandles.v = venmo
  if (cashApp) safeHandles.c = cashApp
  if (paypal) safeHandles.p = paypal
  if (zelle) safeHandles.z = zelle

  const currency = normalizeCurrencyCode(receipt.currency)
  const payload: SharePayload = {
    v: 1,
    m: receipt.merchant.trim() || 'Shared Receipt',
    d: receipt.date.trim(),
    p: payerName.trim() || 'Your Friend',
    f: breakdown.person.name.trim() || 'Friend',
    i: breakdown.items.map((item) => [
      item.name,
      item.itemTotalCents,
      item.shareCents,
      item.splitLabel,
    ]),
    s: breakdown.subtotalCents,
    x: breakdown.taxCents,
    t: breakdown.tipCents,
    g: breakdown.totalCents,
    h: safeHandles,
  }

  if (currency !== DEFAULT_CURRENCY) {
    payload.c = currency
  }
  if (breakdown.extraFeeCents > 0) {
    payload.e = breakdown.extraFeeCents
  }
  if (breakdown.discountCents > 0) {
    payload.k = breakdown.discountCents
  }

  return payload
}

export function encodeSharePayload(payload: SharePayload): string {
  const json = JSON.stringify(payload)
  return LZString.compressToEncodedURIComponent(json)
}

export function buildShareUrl(
  payload: SharePayload,
  baseUrl?: string
): string {
  const base =
    baseUrl ??
    (typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}`
      : 'https://harrijin.github.io/please-pay-me/')
  const compressed = encodeSharePayload(payload)
  return `${base}${SHARE_HASH_PREFIX}${compressed}`
}

export function decodeShareHash(hash: string): SharePayload | null {
  if (!hash || !hash.startsWith(SHARE_HASH_PREFIX)) return null
  const encoded = hash.slice(SHARE_HASH_PREFIX.length).trim()
  if (!encoded) return null

  try {
    const json = LZString.decompressFromEncodedURIComponent(encoded)
    if (!json) return null
    const parsed = JSON.parse(json) as Partial<SharePayload>
    if (
      parsed.v !== 1 ||
      typeof parsed.m !== 'string' ||
      typeof parsed.f !== 'string' ||
      typeof parsed.g !== 'number' ||
      !Array.isArray(parsed.i)
    ) {
      return null
    }

    const currency = parsed.c ? normalizeCurrencyCode(parsed.c) : undefined

    return {
      v: 1,
      m: parsed.m,
      d: typeof parsed.d === 'string' ? parsed.d : '',
      ...(currency && currency !== DEFAULT_CURRENCY ? { c: currency } : {}),
      p: typeof parsed.p === 'string' ? parsed.p : 'Your Friend',
      f: parsed.f,
      i: parsed.i
        .filter((row) => Array.isArray(row) && row.length >= 3)
        .map((row) => [
          String(row[0] ?? 'Item'),
          Number(row[1] ?? 0),
          Number(row[2] ?? 0),
          String(row[3] ?? ''),
        ]),
      s: typeof parsed.s === 'number' ? parsed.s : 0,
      x: typeof parsed.x === 'number' ? parsed.x : 0,
      t: typeof parsed.t === 'number' ? parsed.t : 0,
      e: typeof parsed.e === 'number' ? parsed.e : 0,
      k: typeof parsed.k === 'number' ? parsed.k : 0,
      g: parsed.g,
      h: {
        v: typeof parsed.h?.v === 'string' ? parsed.h.v : undefined,
        c: typeof parsed.h?.c === 'string' ? parsed.h.c : undefined,
        p: typeof parsed.h?.p === 'string' ? parsed.h.p : undefined,
        z: typeof parsed.h?.z === 'string' ? parsed.h.z : undefined,
      },
    }
  } catch {
    return null
  }
}
